#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/vps-operations-monitoring.yml"
observer_file="deploy/sakura-vps/vps-observer.mjs"
report_file="scripts/vps-operations-report.mjs"
install_file="scripts/install-vps-observer.sh"
observer_test_file="scripts/test-vps-observer.mjs"
report_test_file="scripts/test-vps-operations-report.mjs"
doc_file="docs/vps-operations-monitoring.md"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

for file in \
  "${workflow_file}" \
  "${observer_file}" \
  "${report_file}" \
  "${install_file}" \
  "${observer_test_file}" \
  "${report_test_file}" \
  "${doc_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

node --check "${observer_file}"
node --check "${report_file}"
node --check "${observer_test_file}"
node --check "${report_test_file}"
bash -n "${install_file}"

require_text() {
  local file=$1
  local text=$2
  grep -Fq -- "${text}" "${file}" || fail "${file} に必須設定がありません: ${text}"
}

require_absent_text() {
  local file=$1
  local text=$2
  if grep -Fq -- "${text}" "${file}"; then
    fail "${file} に禁止設定が含まれています: ${text}"
  fi
}

require_text "${workflow_file}" 'schedule:'
require_text "${workflow_file}" 'workflow_dispatch:'
require_text "${workflow_file}" 'contents: read'
require_text "${workflow_file}" 'issues: write'
require_text "${workflow_file}" 'name: production-observability'
require_text "${workflow_file}" 'OBSERVABILITY_SSH_PRIVATE_KEY'
require_text "${workflow_file}" 'OBSERVABILITY_SSH_KNOWN_HOSTS'
require_text "${workflow_file}" 'persist-credentials: false'
require_text "${workflow_file}" 'StrictHostKeyChecking=yes'
require_text "${workflow_file}" 'IdentitiesOnly=yes'
require_text "${workflow_file}" '"${target}" observe'
require_text "${workflow_file}" '[監視] VPS運用監査で異常を検知'
require_text "${workflow_file}" 'actions/upload-artifact@v4'
require_text "${workflow_file}" 'retention-days: 14'
require_absent_text "${workflow_file}" 'ssh-keyscan'
require_absent_text "${workflow_file}" 'scp '
require_absent_text "${workflow_file}" 'scripts/deploy-production-release.sh'
require_absent_text "${workflow_file}" 'sudo '

if grep -Eq '^[[:space:]]+push:' "${workflow_file}"; then
  fail "VPS運用監査Workflowにpushトリガーを追加しないでください。"
fi
if grep -Eq '^[[:space:]]+pull_request:' "${workflow_file}"; then
  fail "VPS運用監査Workflowにpull_requestトリガーを追加しないでください。"
fi

job_header="$(awk '
  /^  observe:$/ { in_job = 1 }
  in_job && /^    steps:$/ { exit }
  in_job { print }
' "${workflow_file}")"
if grep -Fq 'secrets.' <<<"${job_header}"; then
  fail "VPS運用監査ジョブ全体へSecretを設定しないでください。"
fi

ssh_setup_section="$(awk '
  /^      - name: 監査専用SSH鍵とknown_hostsを設定$/ { in_step = 1; print; next }
  in_step && /^      - name:/ { exit }
  in_step { print }
' "${workflow_file}")"
for secret_name in OBSERVABILITY_SSH_PRIVATE_KEY OBSERVABILITY_SSH_KNOWN_HOSTS; do
  grep -Fq "secrets.${secret_name}" <<<"${ssh_setup_section}" \
    || fail "${secret_name}はSSH設定ステップだけで参照してください。"
done
secret_reference_count="$(grep -c 'secrets\.' "${workflow_file}")"
[[ "${secret_reference_count}" == "2" ]] \
  || fail "監査Secret参照はSSH設定ステップの2件だけにしてください。"

ssh_command_count="$(grep -Ec '^[[:space:]]+ssh \\' "${workflow_file}")"
[[ "${ssh_command_count}" == "1" ]] \
  || fail "VPS運用監査WorkflowのSSH実行は固定監査の1回だけにしてください。"

require_text "${observer_file}" 'execFile'
require_text "${observer_file}" '"/usr/bin/systemctl"'
require_text "${observer_file}" '"/usr/bin/curl"'
require_text "${observer_file}" '"/usr/bin/df"'
require_text "${observer_file}" '["jlist"]'
require_text "${observer_file}" 'http://127.0.0.1:3000/api/health'
require_text "${observer_file}" 'includes("certbot")'
require_absent_text "${observer_file}" 'shell: true'
require_absent_text "${observer_file}" 'sudo '
require_absent_text "${observer_file}" 'certbot renew'
require_absent_text "${observer_file}" 'systemctl restart'
require_absent_text "${observer_file}" 'pm2 restart'
require_absent_text "${observer_file}" 'pm2 reload'

require_text "${install_file}" 'restrict,command="%s"'
require_text "${install_file}" '/usr/local/bin/lol-type-choice-observer'
require_text "${install_file}" 'install -o root -g root -m 0644'
require_text "${install_file}" 'unset SSH_ORIGINAL_COMMAND'
require_absent_text "${install_file}" '/etc/ssh/sshd_config'
require_absent_text "${install_file}" 'rm -rf'

require_text "${report_file}" 'REQUIRED_CHECKS'
require_text "${report_file}" 'report_validation'
require_text "${report_file}" 'VPS_OBSERVATION_SSH_SUCCEEDED'

require_text "${doc_file}" 'production-observability'
require_text "${doc_file}" 'restrict'
require_text "${doc_file}" 'forced command'
require_text "${doc_file}" 'Certbot'
require_text "${doc_file}" '自動復旧しません'

echo "VPS運用監査の安全条件検証に成功しました。"
