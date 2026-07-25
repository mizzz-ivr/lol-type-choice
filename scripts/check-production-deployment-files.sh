#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/deploy-production.yml"
deploy_script="scripts/deploy-production-release.sh"
test_script="scripts/test-production-release.sh"
pm2_file="deploy/sakura-vps/ecosystem.production.cjs"
mode="${1:-all}"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

require_files() {
  for file in "${workflow_file}" "${deploy_script}" "${test_script}" "${pm2_file}"; do
    [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
  done
}

require_text() {
  local file=$1
  local text=$2

  grep -Fq -- "${text}" "${file}" \
    || fail "${file} に必須設定がありません: ${text}"
}

require_absent_text() {
  local file=$1
  local text=$2

  if grep -Fq -- "${text}" "${file}"; then
    fail "${file} に禁止設定が含まれています: ${text}"
  fi
}

check_syntax() {
  bash -n "${deploy_script}"
  bash -n "${test_script}"
  echo "シェルスクリプト構文の検証に成功しました。"
}

check_workflow() {
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
    fail "本番デプロイWorkflowにpushトリガーを追加しないでください。"
  fi

  build_section="$(awk '
    /^  build:$/ { in_build = 1 }
    /^  deploy:$/ { in_build = 0 }
    in_build { print }
  ' "${workflow_file}")"

  if grep -Fq 'secrets.' <<<"${build_section}"; then
    fail "buildジョブから本番Secretを参照しないでください。"
  fi

  echo "本番Workflowの安全条件検証に成功しました。"
}

check_deploy_script() {
  require_text "${deploy_script}" 'sha256sum --check'
  require_text "${deploy_script}" 'git作業ツリーです'
  require_text "${deploy_script}" 'アーカイブに不正なパスが含まれています'
  require_text "${deploy_script}" 'mv -Tf'
  require_text "${deploy_script}" 'rollback_release'
  require_text "${deploy_script}" 'pm2 startOrReload'
  require_text "${deploy_script}" 'http://127.0.0.1:3000/api/health'
  require_absent_text "${deploy_script}" 'sudo '

  echo "リモートデプロイスクリプトの安全条件検証に成功しました。"
}

check_pm2() {
  require_text "${pm2_file}" 'path.join(appRoot, "current")'
  require_text "${pm2_file}" 'HOSTNAME: "127.0.0.1"'
  require_text "${pm2_file}" 'PORT: "3000"'
  require_text "${pm2_file}" 'max_memory_restart: "512M"'
  node --check "${pm2_file}"

  echo "PM2本番設定の検証に成功しました。"
}

require_files

case "${mode}" in
  syntax)
    check_syntax
    ;;
  workflow)
    check_workflow
    ;;
  deploy-script)
    check_deploy_script
    ;;
  pm2)
    check_pm2
    ;;
  all)
    check_syntax
    check_workflow
    check_deploy_script
    check_pm2
    echo "本番手動デプロイ設定の静的検証に成功しました。"
    ;;
  *)
    fail "未対応の検証モードです: ${mode}"
    ;;
esac
