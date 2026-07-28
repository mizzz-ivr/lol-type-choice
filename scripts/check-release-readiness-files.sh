#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/release-readiness.yml"
logic_file="scripts/release-readiness.mjs"
test_file="scripts/test-release-readiness.mjs"
doc_file="docs/release-readiness.md"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

for file in "${workflow_file}" "${logic_file}" "${test_file}" "${doc_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

node --check "${logic_file}"
node --check "${test_file}"

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

require_text "${workflow_file}" 'workflow_dispatch:'
require_text "${workflow_file}" 'type: choice'
require_text "${workflow_file}" 'pre_deploy'
require_text "${workflow_file}" 'post_deploy'
require_text "${workflow_file}" 'contents: read'
require_text "${workflow_file}" 'issues: read'
require_text "${workflow_file}" 'group: release-readiness'
require_text "${workflow_file}" 'cancel-in-progress: false'
require_text "${workflow_file}" 'name: production'
require_text "${workflow_file}" 'needs: quality'
require_text "${workflow_file}" 'persist-credentials: false'
require_text "${workflow_file}" 'git merge-base --is-ancestor'
require_text "${workflow_file}" 'confirmationにはCHECKを入力してください'
require_text "${workflow_file}" 'PRODUCTION_SSH_PRIVATE_KEY'
require_text "${workflow_file}" 'PRODUCTION_SSH_KNOWN_HOSTS'
require_text "${workflow_file}" 'ssh-keygen -y'
require_text "${workflow_file}" 'ssh-keygen -F'
require_text "${workflow_file}" 'trap cleanup EXIT'
require_text "${workflow_file}" '[監視] 本番サイトの外形監視で異常を検知'
require_text "${workflow_file}" 'node scripts/smoke-test.mjs'
require_text "${workflow_file}" 'actions/upload-artifact@v4'
require_text "${workflow_file}" 'retention-days: 7'
require_absent_text "${workflow_file}" 'ssh-keyscan'
require_absent_text "${workflow_file}" 'scripts/deploy-production-release.sh'
require_absent_text "${workflow_file}" 'scp '

if grep -Eq '^[[:space:]]+push:' "${workflow_file}"; then
  fail "リリース可否Workflowにpushトリガーを追加しないでください。"
fi
if grep -Eq '^[[:space:]]+schedule:' "${workflow_file}"; then
  fail "リリース可否Workflowにscheduleトリガーを追加しないでください。"
fi
if grep -Eq '^[[:space:]]+ssh[[:space:]]' "${workflow_file}"; then
  fail "リリース可否WorkflowからSSH接続を実行しないでください。"
fi

quality_section="$(awk '
  /^  quality:$/ { in_quality = 1 }
  /^  readiness:$/ { in_quality = 0 }
  in_quality { print }
' "${workflow_file}")"

if grep -Fq 'secrets.' <<<"${quality_section}"; then
  fail "qualityジョブから本番Secretを参照しないでください。"
fi

readiness_header="$(awk '
  /^  readiness:$/ { in_readiness = 1 }
  in_readiness && /^    steps:$/ { exit }
  in_readiness { print }
' "${workflow_file}")"

if grep -Fq 'secrets.' <<<"${readiness_header}"; then
  fail "readinessジョブ全体へ本番Secretを設定しないでください。"
fi

ssh_step_section="$(awk '
  /^      - name: 本番SSH設定を値を出力せず検証$/ { in_ssh_step = 1; print; next }
  in_ssh_step && /^      - name:/ { exit }
  in_ssh_step { print }
' "${workflow_file}")"

for secret_name in PRODUCTION_SSH_PRIVATE_KEY PRODUCTION_SSH_KNOWN_HOSTS; do
  grep -Fq "secrets.${secret_name}" <<<"${ssh_step_section}" \
    || fail "${secret_name}はSSH設定検証ステップだけで参照してください。"
done

secret_reference_count="$(grep -c 'secrets\.' "${workflow_file}")"
[[ "${secret_reference_count}" == "2" ]] \
  || fail "本番Secret参照はSSH設定検証ステップの2件だけにしてください。"

require_text "${logic_file}" 'status = checks.every'
require_text "${logic_file}" '"GO" : "NO-GO"'
require_text "${logic_file}" 'private_key_configured'
require_text "${logic_file}" 'known_hosts_match'
require_text "${logic_file}" 'open_incidents'
require_text "${logic_file}" 'post_deploy_smoke'
require_absent_text "${logic_file}" 'process.env.PRODUCTION_SSH_PRIVATE_KEY'
require_absent_text "${logic_file}" 'process.env.PRODUCTION_SSH_KNOWN_HOSTS'

require_text "${doc_file}" 'pre_deploy'
require_text "${doc_file}" 'post_deploy'
require_text "${doc_file}" 'NO-GO'
require_text "${doc_file}" '本番デプロイは実行しません'

echo "リリース可否Workflowの安全条件検証に成功しました。"
