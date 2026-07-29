#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/domain-security-monitoring.yml"
readiness_workflow=".github/workflows/release-readiness.yml"
logic_file="scripts/domain-security-check.mjs"
test_file="scripts/test-domain-security-check.mjs"
merge_file="scripts/merge-domain-security-readiness.mjs"
merge_test_file="scripts/test-merge-domain-security-readiness.mjs"
doc_file="docs/domain-security-monitoring.md"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

for file in \
  "${workflow_file}" \
  "${readiness_workflow}" \
  "${logic_file}" \
  "${test_file}" \
  "${merge_file}" \
  "${merge_test_file}" \
  "${doc_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

node --check "${logic_file}"
node --check "${test_file}"
node --check "${merge_file}"
node --check "${merge_test_file}"

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
require_text "${workflow_file}" 'PRODUCTION_SITE_URL: ${{ vars.PRODUCTION_SITE_URL }}'
require_text "${workflow_file}" 'TLS_WARNING_DAYS: "30"'
require_text "${workflow_file}" 'TLS_CRITICAL_DAYS: "14"'
require_text "${workflow_file}" 'persist-credentials: false'
require_text "${workflow_file}" 'scripts/domain-security-check.mjs'
require_text "${workflow_file}" 'actions/upload-artifact@v4'
require_text "${workflow_file}" 'retention-days: 14'
require_text "${workflow_file}" '[監視] 本番ドメインまたはTLS証明書に問題を検知'
require_absent_text "${workflow_file}" 'secrets.'
require_absent_text "${workflow_file}" 'ssh-keyscan'
require_absent_text "${workflow_file}" 'scp '
require_absent_text "${workflow_file}" 'scripts/deploy-production-release.sh'

if grep -Eq '^[[:space:]]+push:' "${workflow_file}"; then
  fail "DNS・TLS監視Workflowにpushトリガーを追加しないでください。"
fi
if grep -Eq '^[[:space:]]+pull_request:' "${workflow_file}"; then
  fail "DNS・TLS監視Workflowにpull_requestトリガーを追加しないでください。"
fi
if grep -Eq '^[[:space:]]+ssh[[:space:]]' "${workflow_file}"; then
  fail "DNS・TLS監視WorkflowからSSH接続を実行しないでください。"
fi

require_text "${logic_file}" 'rejectUnauthorized: true'
require_text "${logic_file}" 'minVersion: "TLSv1.2"'
require_text "${logic_file}" 'host: address'
require_text "${logic_file}" 'servername: hostname'
require_text "${logic_file}" 'resolvePublicAddresses'
require_text "${logic_file}" 'isPublicIpAddress'
require_text "${logic_file}" 'status: "warning"'
require_text "${logic_file}" 'status: "critical"'
require_absent_text "${logic_file}" 'NODE_TLS_REJECT_UNAUTHORIZED'
require_absent_text "${logic_file}" 'rejectUnauthorized: false'
require_absent_text "${logic_file}" 'process.env.PRODUCTION_SSH'

require_text "${readiness_workflow}" '公開後DNS・TLS証明書を確認'
require_text "${readiness_workflow}" 'scripts/domain-security-check.mjs'
require_text "${readiness_workflow}" 'scripts/merge-domain-security-readiness.mjs'
require_text "${readiness_workflow}" 'id: merged_report'
require_text "${readiness_workflow}" "if: inputs.mode == 'post_deploy'"
require_text "${readiness_workflow}" "if: steps.merged_report.outcome != 'success'"

require_text "${merge_file}" 'domainStatus === "healthy" || domainStatus === "warning"'
require_text "${merge_file}" 'domainStatus === "critical"'
require_text "${merge_file}" 'id: "domain_security"'
require_absent_text "${merge_file}" 'secrets.'
require_absent_text "${merge_file}" 'PRODUCTION_SSH_PRIVATE_KEY'

require_text "${doc_file}" '30日'
require_text "${doc_file}" '14日'
require_text "${doc_file}" '自動更新しません'
require_text "${doc_file}" '検証済みIP'
require_text "${doc_file}" 'post_deploy'

echo "DNS・TLS証明書監視の安全条件検証に成功しました。"
