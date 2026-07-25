#!/usr/bin/env bash
set -Eeuo pipefail

bootstrap_file="scripts/bootstrap-sakura-vps.sh"
nginx_file="deploy/sakura-vps/nginx.conf.template"
doc_file="docs/deployment-sakura-vps.md"

for file in "${bootstrap_file}" "${nginx_file}" "${doc_file}"; do
  if [[ ! -f "${file}" ]]; then
    echo "[ERROR] 必須ファイルがありません: ${file}" >&2
    exit 1
  fi
done

bash -n "${bootstrap_file}"

require_text() {
  local file=$1
  local text=$2

  if ! grep -Fq -- "${text}" "${file}"; then
    echo "[ERROR] ${file} に必須設定がありません: ${text}" >&2
    exit 1
  fi
}

require_text "${bootstrap_file}" 'ufw limit OpenSSH'
require_text "${bootstrap_file}" "ufw allow 'Nginx Full'"
require_text "${bootstrap_file}" 'ufw --force enable'
require_text "${bootstrap_file}" 'NODE_MAJOR="22"'
require_text "${bootstrap_file}" 'deb.nodesource.com/node_${NODE_MAJOR}.x'
require_text "${bootstrap_file}" 'NPM_VERSION="10.9.8"'
require_text "${bootstrap_file}" 'PM2_VERSION="7.0.3"'

ssh_rule_line="$(grep -nF 'ufw limit OpenSSH' "${bootstrap_file}" | head -n 1 | cut -d: -f1)"
ufw_enable_line="$(grep -nF 'ufw --force enable' "${bootstrap_file}" | head -n 1 | cut -d: -f1)"

if (( ssh_rule_line >= ufw_enable_line )); then
  echo "[ERROR] UFW有効化より前にOpenSSH許可ルールを設定してください。" >&2
  exit 1
fi

require_text "${nginx_file}" 'server_name __DOMAIN__;'
require_text "${nginx_file}" 'proxy_pass http://127.0.0.1:3000;'
require_text "${nginx_file}" 'listen 80;'

if grep -Eq 'listen[[:space:]]+3000([[:space:]]|;)' "${nginx_file}"; then
  echo "[ERROR] Nginxで3000番ポートを外部公開しないでください。" >&2
  exit 1
fi

require_text "${doc_file}" 'さくらのVPS'
require_text "${doc_file}" 'Ubuntu 24.04'
require_text "${doc_file}" '3000/tcpは外部公開しません'

echo "さくらのVPS向け設定ファイルの検証に成功しました。"
