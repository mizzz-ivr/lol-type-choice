#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  echo "[TEST ERROR] $*" >&2
  exit 1
}

test_root="$(mktemp -d)"
trap 'rm -rf -- "${test_root}"' EXIT

app_root="${test_root}/app"
bin_directory="${test_root}/bin"
mkdir -p "${app_root}/shared" "${bin_directory}"
printf 'NEXT_PUBLIC_SITE_URL=https://example.com\n' >"${app_root}/shared/.env.production"

export PM2_LOG="${test_root}/pm2.log"
export CURL_FAIL_FILE="${test_root}/curl-fail"

cat >"${bin_directory}/pm2" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"${PM2_LOG}"
exit "${PM2_EXIT_CODE:-0}"
EOF

cat >"${bin_directory}/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ -f "${CURL_FAIL_FILE}" ]]; then
  exit 22
fi
printf '{"status":"ok"}\n'
EOF

chmod 700 "${bin_directory}/pm2" "${bin_directory}/curl"
export PATH="${bin_directory}:${PATH}"

create_release_artifact() {
  local release_sha=$1
  local payload_directory="${test_root}/payload-${release_sha}"
  local artifact_path="${test_root}/release-${release_sha}.tar.gz"

  mkdir -p \
    "${payload_directory}/.next/static" \
    "${payload_directory}/deploy/sakura-vps"

  printf 'console.log("%s");\n' "${release_sha}" >"${payload_directory}/server.js"
  printf '%s\n' "static" >"${payload_directory}/.next/static/chunk.js"
  cp deploy/sakura-vps/ecosystem.production.cjs \
    "${payload_directory}/deploy/sakura-vps/ecosystem.production.cjs"

  tar -C "${payload_directory}" -czf "${artifact_path}" .
  (
    cd "${test_root}"
    sha256sum "$(basename "${artifact_path}")" >"$(basename "${artifact_path}").sha256"
  )
}

run_deploy() {
  local release_sha=$1

  APP_ROOT="${app_root}" \
  RELEASES_TO_KEEP=2 \
  HEALTH_ATTEMPTS=1 \
  HEALTH_INTERVAL_SECONDS=0 \
  bash scripts/deploy-production-release.sh \
    "${test_root}/release-${release_sha}.tar.gz" \
    "${test_root}/release-${release_sha}.tar.gz.sha256" \
    "${release_sha}"
}

sha_a="1111111111111111111111111111111111111111"
sha_b="2222222222222222222222222222222222222222"
sha_c="3333333333333333333333333333333333333333"
sha_d="4444444444444444444444444444444444444444"

create_release_artifact "${sha_a}"
run_deploy "${sha_a}"

[[ "$(readlink -f "${app_root}/current")" == "${app_root}/releases/${sha_a}" ]] \
  || fail "初回デプロイでcurrentが新リリースを指していません。"
[[ -L "${app_root}/releases/${sha_a}/.env.production" ]] \
  || fail ".env.productionが共有ファイルへのシンボリックリンクではありません。"
[[ "$(readlink -f "${app_root}/releases/${sha_a}/.env.production")" == "${app_root}/shared/.env.production" ]] \
  || fail ".env.productionの参照先が不正です。"

create_release_artifact "${sha_b}"
run_deploy "${sha_b}"

[[ "$(readlink -f "${app_root}/current")" == "${app_root}/releases/${sha_b}" ]] \
  || fail "更新デプロイでcurrentが新リリースを指していません。"
[[ -d "${app_root}/releases/${sha_a}" ]] \
  || fail "直前リリースが保持されていません。"

create_release_artifact "${sha_c}"
touch "${CURL_FAIL_FILE}"
if run_deploy "${sha_c}"; then
  fail "ヘルスチェック失敗時にデプロイが成功扱いになりました。"
fi
rm -f "${CURL_FAIL_FILE}"

[[ "$(readlink -f "${app_root}/current")" == "${app_root}/releases/${sha_b}" ]] \
  || fail "ヘルスチェック失敗時に直前リリースへ切り戻されていません。"
[[ ! -e "${app_root}/releases/${sha_c}" ]] \
  || fail "失敗した新リリースが残っています。"

malicious_artifact="${test_root}/release-${sha_d}.tar.gz"
python3 - "${malicious_artifact}" <<'PY'
import io
import sys
import tarfile

archive_path = sys.argv[1]
content = b"escape"
with tarfile.open(archive_path, "w:gz") as archive:
    info = tarfile.TarInfo(name="../escape")
    info.size = len(content)
    archive.addfile(info, io.BytesIO(content))
PY

(
  cd "${test_root}"
  sha256sum "$(basename "${malicious_artifact}")" >"$(basename "${malicious_artifact}").sha256"
)

if run_deploy "${sha_d}"; then
  fail "パストラバーサルを含むアーカイブが受理されました。"
fi
[[ ! -e "${test_root}/escape" ]] \
  || fail "アーカイブ外へファイルが展開されました。"

grep -Fq 'startOrReload' "${PM2_LOG}" \
  || fail "PM2再読込が実行されていません。"

echo "本番リリース切替・自動切り戻しテストに成功しました。"
