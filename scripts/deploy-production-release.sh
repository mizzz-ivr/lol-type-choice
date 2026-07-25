#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

artifact_path="${1:-}"
checksum_path="${2:-}"
release_sha="${3:-}"

app_root="${APP_ROOT:-/var/www/lol-type-choice}"
releases_to_keep="${RELEASES_TO_KEEP:-5}"
health_url="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
health_attempts="${HEALTH_ATTEMPTS:-15}"
health_interval_seconds="${HEALTH_INTERVAL_SECONDS:-2}"
pm2_app_name="${PM2_APP_NAME:-lol-type-choice}"

[[ -n "${artifact_path}" ]] || fail "リリースアーカイブを指定してください。"
[[ -n "${checksum_path}" ]] || fail "チェックサムファイルを指定してください。"
[[ "${release_sha}" =~ ^[0-9a-f]{40}$ ]] || fail "リリースSHAは40桁の小文字16進数で指定してください。"
[[ "${app_root}" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "APP_ROOTに利用できない文字が含まれています。"
[[ "${app_root}" != *"/../"* && "${app_root}" != */.. && "${app_root}" != *"//"* ]] || fail "APP_ROOTの形式が不正です。"
[[ "${releases_to_keep}" =~ ^[0-9]+$ ]] || fail "RELEASES_TO_KEEPは数値で指定してください。"
(( releases_to_keep >= 2 && releases_to_keep <= 20 )) || fail "RELEASES_TO_KEEPは2から20の範囲で指定してください。"
[[ "${health_attempts}" =~ ^[0-9]+$ ]] || fail "HEALTH_ATTEMPTSは数値で指定してください。"
(( health_attempts >= 1 && health_attempts <= 60 )) || fail "HEALTH_ATTEMPTSは1から60の範囲で指定してください。"
[[ "${health_interval_seconds}" =~ ^[0-9]+$ ]] || fail "HEALTH_INTERVAL_SECONDSは数値で指定してください。"

[[ -f "${artifact_path}" ]] || fail "リリースアーカイブが見つかりません: ${artifact_path}"
[[ -f "${checksum_path}" ]] || fail "チェックサムファイルが見つかりません: ${checksum_path}"

expected_artifact_name="release-${release_sha}.tar.gz"
expected_checksum_name="${expected_artifact_name}.sha256"
[[ "$(basename "${artifact_path}")" == "${expected_artifact_name}" ]] || fail "アーカイブ名がリリースSHAと一致しません。"
[[ "$(basename "${checksum_path}")" == "${expected_checksum_name}" ]] || fail "チェックサム名がリリースSHAと一致しません。"

grep -Eq "^[0-9a-f]{64}  ${expected_artifact_name}$" "${checksum_path}" \
  || fail "チェックサムファイルの形式が不正です。"

(
  cd "$(dirname "${artifact_path}")"
  sha256sum --check "$(basename "${checksum_path}")"
) || fail "リリースアーカイブのチェックサムが一致しません。"

archive_entries="$(tar -tzf "${artifact_path}")" || fail "リリースアーカイブを読み取れません。"
while IFS= read -r entry; do
  normalized_entry="${entry#./}"
  [[ -n "${normalized_entry}" ]] || continue

  case "${normalized_entry}" in
    /*|..|../*|*/../*|*/..)
      fail "アーカイブに不正なパスが含まれています: ${entry}"
      ;;
  esac
done <<<"${archive_entries}"

[[ ! -d "${app_root}/.git" ]] || fail "APP_ROOTがGit作業ツリーです。リリース配置構成へ移行してから実行してください。"

releases_directory="${app_root}/releases"
shared_directory="${app_root}/shared"
release_directory="${releases_directory}/${release_sha}"
current_link="${app_root}/current"
incoming_directory="${releases_directory}/.incoming-${release_sha}-$$"
temporary_link="${app_root}/.current-${release_sha}-$$"
created_release=false

cleanup_temporary_files() {
  rm -rf -- "${incoming_directory}" 2>/dev/null || true
  rm -f -- "${temporary_link}" 2>/dev/null || true
}
trap cleanup_temporary_files EXIT

mkdir -p "${releases_directory}" "${shared_directory}"
[[ -f "${shared_directory}/.env.production" ]] \
  || fail "${shared_directory}/.env.production がありません。先に本番環境変数を配置してください。"

validate_release_directory() {
  local directory=$1

  [[ -f "${directory}/server.js" ]] || fail "server.jsがリリースに含まれていません。"
  [[ -d "${directory}/.next/static" ]] || fail ".next/staticがリリースに含まれていません。"
  [[ -f "${directory}/deploy/sakura-vps/ecosystem.production.cjs" ]] \
    || fail "本番PM2設定がリリースに含まれていません。"
}

if [[ -e "${release_directory}" ]]; then
  [[ -d "${release_directory}" ]] || fail "同名リリースのパスがディレクトリではありません。"
  validate_release_directory "${release_directory}"
else
  mkdir -p "${incoming_directory}"
  tar --extract --gzip --file "${artifact_path}" \
    --directory "${incoming_directory}" \
    --no-same-owner \
    --no-same-permissions

  validate_release_directory "${incoming_directory}"
  [[ ! -e "${incoming_directory}/.env.production" ]] \
    || fail "リリースアーカイブに.env.productionを含めないでください。"

  ln -s "${shared_directory}/.env.production" "${incoming_directory}/.env.production"
  printf '%s\n' "${release_sha}" >"${incoming_directory}/RELEASE_SHA"
  mv -- "${incoming_directory}" "${release_directory}"
  created_release=true
fi

if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
  [[ -d "${previous_release}" ]] || fail "currentリンクの参照先が存在しません。"
elif [[ -e "${current_link}" ]]; then
  fail "${current_link} はシンボリックリンクではありません。"
else
  previous_release=""
fi

switch_current() {
  local target_directory=$1

  rm -f -- "${temporary_link}"
  ln -s "${target_directory}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${current_link}"
}

reload_application() {
  APP_ROOT="${app_root}" pm2 startOrReload \
    "${current_link}/deploy/sakura-vps/ecosystem.production.cjs" \
    --update-env
}

rollback_release() {
  echo "[WARN] 新リリースに問題があるため切り戻します。" >&2

  if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
    switch_current "${previous_release}"
    reload_application || true
  else
    rm -f -- "${current_link}"
    pm2 delete "${pm2_app_name}" >/dev/null 2>&1 || true
  fi

  if [[ "${created_release}" == "true" ]]; then
    rm -rf -- "${release_directory}"
  fi
}

switch_current "${release_directory}"

if ! reload_application; then
  rollback_release
  fail "PM2によるアプリ再読込に失敗しました。"
fi

health_succeeded=false
for ((attempt = 1; attempt <= health_attempts; attempt += 1)); do
  if response="$(curl --fail --silent --show-error --max-time 5 "${health_url}" 2>/dev/null)" \
    && [[ "${response}" == *'"status":"ok"'* ]]; then
    health_succeeded=true
    break
  fi

  if (( attempt < health_attempts )); then
    sleep "${health_interval_seconds}"
  fi
done

if [[ "${health_succeeded}" != "true" ]]; then
  rollback_release
  fail "ヘルスチェックに失敗しました: ${health_url}"
fi

mapfile -t release_directories < <(
  find "${releases_directory}" \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    ! -name '.incoming-*' \
    -printf '%T@ %p\n' \
    | sort -rn \
    | cut -d' ' -f2-
)

for ((index = releases_to_keep; index < ${#release_directories[@]}; index += 1)); do
  old_release="${release_directories[index]}"
  [[ "${old_release}" != "${release_directory}" ]] || continue
  [[ "${old_release}" != "${previous_release}" ]] || continue
  [[ "${old_release}" == "${releases_directory}/"* ]] || fail "削除対象がreleases配下ではありません。"
  rm -rf -- "${old_release}"
done

echo "本番リリースが完了しました。"
echo "release_sha=${release_sha}"
echo "current=$(readlink -f "${current_link}")"
