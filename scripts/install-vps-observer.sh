#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || fail "root権限で実行してください。"
[[ "$#" -eq 1 ]] || fail "監査用SSH公開鍵ファイルを1つ指定してください。"

public_key_file=$1
observer_user="${OBSERVER_USER:-ubuntu}"

[[ "${observer_user}" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "OBSERVER_USERの形式が不正です。"
[[ -f "${public_key_file}" ]] || fail "公開鍵ファイルが見つかりません: ${public_key_file}"
command -v getent >/dev/null 2>&1 || fail "getentが見つかりません。"
command -v ssh-keygen >/dev/null 2>&1 || fail "ssh-keygenが見つかりません。"
[[ -x /usr/bin/node ]] || fail "/usr/bin/nodeが見つかりません。"

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_directory}/.." && pwd)"
observer_source="${repository_root}/deploy/sakura-vps/vps-observer.mjs"
[[ -f "${observer_source}" ]] || fail "監査スクリプトが見つかりません: ${observer_source}"

passwd_entry="$(getent passwd "${observer_user}")"
[[ -n "${passwd_entry}" ]] || fail "監査ユーザーが存在しません: ${observer_user}"
observer_home="$(cut -d: -f6 <<<"${passwd_entry}")"
observer_group="$(id -gn "${observer_user}")"
[[ "${observer_home}" == /* ]] || fail "監査ユーザーのホームディレクトリが不正です。"

ssh-keygen -lf "${public_key_file}" >/dev/null 2>&1 || fail "SSH公開鍵として読み取れません。"
read -r key_type key_data _ <"${public_key_file}"
[[ "${key_type}" =~ ^ssh-(ed25519|rsa)$|^ecdsa-sha2-nistp(256|384|521)$ ]] \
  || fail "未対応のSSH公開鍵形式です: ${key_type}"
[[ "${key_data}" =~ ^[A-Za-z0-9+/=]+$ ]] || fail "SSH公開鍵データの形式が不正です。"

observer_library_directory="/usr/local/lib/lol-type-choice"
observer_library_path="${observer_library_directory}/vps-observer.mjs"
observer_command_path="/usr/local/bin/lol-type-choice-observer"

install -d -o root -g root -m 0755 "${observer_library_directory}"
install -o root -g root -m 0644 "${observer_source}" "${observer_library_path}"

wrapper_file="$(mktemp)"
authorized_keys_temp="$(mktemp)"
cleanup() {
  rm -f -- "${wrapper_file}" "${authorized_keys_temp}"
}
trap cleanup EXIT

cat >"${wrapper_file}" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
unset SSH_ORIGINAL_COMMAND
export HOME="${observer_home}"
export LANG="C.UTF-8"
export LC_ALL="C.UTF-8"
export PATH="/usr/local/bin:/usr/bin:/bin"
exec /usr/bin/node "${observer_library_path}"
EOF
install -o root -g root -m 0755 "${wrapper_file}" "${observer_command_path}"

ssh_directory="${observer_home}/.ssh"
authorized_keys_file="${ssh_directory}/authorized_keys"
install -d -o "${observer_user}" -g "${observer_group}" -m 0700 "${ssh_directory}"

if [[ -f "${authorized_keys_file}" ]]; then
  awk -v key_data="${key_data}" 'index($0, key_data) == 0 { print }' \
    "${authorized_keys_file}" >"${authorized_keys_temp}"
fi
printf 'restrict,command="%s" %s %s %s\n' \
  "${observer_command_path}" \
  "${key_type}" \
  "${key_data}" \
  "github-actions-lol-type-choice-observer" \
  >>"${authorized_keys_temp}"

install -o "${observer_user}" -g "${observer_group}" -m 0600 \
  "${authorized_keys_temp}" "${authorized_keys_file}"

self_test_report="$(runuser -u "${observer_user}" -- "${observer_command_path}")"
printf '%s' "${self_test_report}" | /usr/bin/node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const report = JSON.parse(input);
  if (report?.schemaVersion !== 1 || !Array.isArray(report?.checks)) process.exit(1);
});
' || fail "監査スクリプトのセルフテストに失敗しました。"

echo "VPS運用監査スクリプトと制限付きSSH公開鍵を設定しました。"
echo "observer_user=${observer_user}"
echo "observer_command=${observer_command_path}"
