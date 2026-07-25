#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/deploy-production.yml"
deploy_script="scripts/deploy-production-release.sh"
test_script="scripts/test-production-release.sh"
pm2_file="deploy/sakura-vps/ecosystem.production.cjs"

for file in "${workflow_file}" "${deploy_script}" "${test_script}" "${pm2_file}"; do
  if [[ ! -f "${file}" ]]; then
    echo "[ERROR] 必須ファイルがありません: ${file}" >&2
    exit 1
  fi
done

bash -n "${deploy_script}"
bash -n "${test_script}"

require_text() {
  local file=$1
  local text=$2

  if ! grep -Fq -- "${text}" "${file}"; then
    echo "[ERROR] ${file} に必須設定がありません: ${text}" >&2
    exit 1
  fi
}

require_absent_text() {
  local file=$1
  local text=$2

  if grep -Fq -- "${text}" "${file}"; then
    echo "[ERROR] ${file} に禁止設定が含まれています: ${text}" >&2
    exit 1
  fi
}

require_text "${workflow_file}" 'workflow_dispatch:'
require_text "${workflow_file}" 'contents: read'
require_text "${workflow_file}" 'group: production-deploy'
require_text "${workflow_file}" 'cancel-in-progress: false'
require_text "${workflow_file}" 'name: production'
require_text "${workflow_file}" 'needs: build'
require_text "${workflow_file}" 'persist-credentials: false'
require_text "${workflow_file}" 'StrictHostKeyChecking=yes'
require_text "${workflow_file}" 'PRODUCTION_SSH_PRIVATE_KEY'
require_text "${workflow_file}" 'PRODUCTION_SSH_KNOWN_HOSTS'
require_text "${workflow_file}" 'git merge-base --is-ancestor'
require_text "${workflow_file}" 'confirmationにはDEPLOYを入力してください'
require_absent_text "${workflow_file}" 'ssh-keyscan'

if grep -Eq '^[[:space:]]+push:' "${workflow_file}"; then
  echo "[ERROR] 本番デプロイWorkflowにpushトリガーを追加しないでください。" >&2
  exit 1
fi

build_section="$(awk '
  /^  build:$/ { in_build = 1 }
  /^  deploy:$/ { in_build = 0 }
  in_build { print }
' "${workflow_file}")"

if grep -Fq 'secrets.' <<<"${build_section}"; then
  echo "[ERROR] buildジョブから本番Secretを参照しないでください。" >&2
  exit 1
fi

require_text "${deploy_script}" 'sha256sum --check'
require_text "${deploy_script}" 'git作業ツリーです'
require_text "${deploy_script}" 'アーカイブに不正なパスが含まれています'
require_text "${deploy_script}" 'mv -Tf'
require_text "${deploy_script}" 'rollback_release'
require_text "${deploy_script}" 'pm2 startOrReload'
require_text "${deploy_script}" 'http://127.0.0.1:3000/api/health'
require_absent_text "${deploy_script}" 'sudo '

require_text "${pm2_file}" 'path.join(appRoot, "current")'
require_text "${pm2_file}" 'HOSTNAME: "127.0.0.1"'
require_text "${pm2_file}" 'PORT: "3000"'
require_text "${pm2_file}" 'max_memory_restart: "512M"'

node --check "${pm2_file}"

echo "本番手動デプロイ設定の静的検証に成功しました。"
