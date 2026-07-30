#!/usr/bin/env bash
set -Eeuo pipefail

package_file="package.json"
dependabot_file=".github/dependabot.yml"
review_workflow=".github/workflows/dependency-review.yml"
audit_workflow=".github/workflows/dependency-audit.yml"
checks_workflow=".github/workflows/dependency-security-checks.yml"
exceptions_config="config/dependency-audit-exceptions.json"
report_file="scripts/dependency-audit-report.mjs"
exceptions_file="scripts/dependency-audit-exceptions.mjs"
fix_candidates_file="scripts/dependency-audit-fix-candidates.mjs"
test_file="scripts/test-dependency-audit-report.mjs"
exceptions_test_file="scripts/test-dependency-audit-exceptions.mjs"
doc_file="docs/dependency-security.md"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

for file in \
  "${package_file}" \
  "${dependabot_file}" \
  "${review_workflow}" \
  "${audit_workflow}" \
  "${checks_workflow}" \
  "${exceptions_config}" \
  "${report_file}" \
  "${exceptions_file}" \
  "${fix_candidates_file}" \
  "${test_file}" \
  "${exceptions_test_file}" \
  "${doc_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

node --check "${report_file}"
node --check "${exceptions_file}"
node --check "${fix_candidates_file}"
node --check "${test_file}"
node --check "${exceptions_test_file}"

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

require_text "${package_file}" '"next": "15.5.22"'
require_text "${package_file}" '"eslint-config-next": "15.5.22"'
require_text "${package_file}" '"postcss": "8.5.23"'
require_text "${package_file}" '"vitest": "3.2.7"'
require_text "${package_file}" '"overrides": {'
require_text "${package_file}" '"postcss": "$postcss"'
require_text "${package_file}" '"sharp": "0.35.3"'

require_text "${dependabot_file}" 'version: 2'
require_text "${dependabot_file}" 'package-ecosystem: "npm"'
require_text "${dependabot_file}" 'package-ecosystem: "github-actions"'
require_text "${dependabot_file}" 'interval: "weekly"'
require_text "${dependabot_file}" 'timezone: "Asia/Tokyo"'
require_text "${dependabot_file}" 'applies-to: "security-updates"'
require_text "${dependabot_file}" 'applies-to: "version-updates"'
require_text "${dependabot_file}" 'open-pull-requests-limit: 5'
require_text "${dependabot_file}" 'update-types:'
require_absent_text "${dependabot_file}" 'target-branch:'

require_text "${review_workflow}" 'pull_request:'
require_text "${review_workflow}" 'contents: read'
require_text "${review_workflow}" 'dependency-graph/sbom'
require_text "${review_workflow}" 'actions/dependency-review-action@v4'
require_text "${review_workflow}" 'fail-on-severity: high'
require_text "${review_workflow}" "steps.dependency_graph.outputs.enabled == 'true'"
require_text "${review_workflow}" "steps.dependency_graph.outputs.enabled != 'true'"
require_text "${review_workflow}" 'npm ci --ignore-scripts --no-audit --no-fund'
require_text "${review_workflow}" 'npm audit --json'
require_text "${review_workflow}" 'npm audit --omit=dev --json'
require_text "${review_workflow}" 'node scripts/dependency-audit-fix-candidates.mjs'
require_text "${review_workflow}" 'DEPENDENCY_AUDIT_FAIL_ON_WARNING: "false"'
require_text "${review_workflow}" 'node scripts/dependency-audit-report.mjs'
require_text "${review_workflow}" 'persist-credentials: false'
require_absent_text "${review_workflow}" 'issues: write'
require_absent_text "${review_workflow}" 'pull-requests: write'
require_absent_text "${review_workflow}" 'secrets.'
require_absent_text "${review_workflow}" 'schedule:'
require_absent_text "${review_workflow}" 'actions/upload-artifact'
require_absent_text "${review_workflow}" 'npm audit fix'
require_absent_text "${review_workflow}" 'ssh '
require_absent_text "${review_workflow}" 'scp '

if grep -Eq '^[[:space:]]+push:' "${review_workflow}"; then
  fail "Dependency Review Workflowにpushトリガーを追加しないでください。"
fi

require_text "${audit_workflow}" 'schedule:'
require_text "${audit_workflow}" 'workflow_dispatch:'
require_text "${audit_workflow}" 'contents: read'
require_text "${audit_workflow}" 'issues: write'
require_text "${audit_workflow}" 'persist-credentials: false'
require_text "${audit_workflow}" 'npm ci --ignore-scripts --no-audit --no-fund'
require_text "${audit_workflow}" 'npm audit --json'
require_text "${audit_workflow}" 'npm audit --omit=dev --json'
require_text "${audit_workflow}" '[監視] 依存関係監査で脆弱性または異常を検知'
require_text "${audit_workflow}" 'retention-days: 14'
require_absent_text "${audit_workflow}" 'npm audit fix'
require_absent_text "${audit_workflow}" 'secrets.'
require_absent_text "${audit_workflow}" 'ssh '
require_absent_text "${audit_workflow}" 'scp '
require_absent_text "${audit_workflow}" 'deploy-production-release'
require_absent_text "${audit_workflow}" 'gh pr merge'

if grep -Eq '^[[:space:]]+push:' "${audit_workflow}"; then
  fail "Dependency Audit Workflowにpushトリガーを追加しないでください。"
fi
if grep -Eq '^[[:space:]]+pull_request:' "${audit_workflow}"; then
  fail "Dependency Audit Workflowにpull_requestトリガーを追加しないでください。"
fi

require_text "${exceptions_config}" '"package": "next"'
require_text "${exceptions_config}" '"severity": "high"'
require_text "${exceptions_config}" '"scope": "production"'
require_text "${exceptions_config}" '"installedVersion": "15.5.22"'
require_text "${exceptions_config}" '"expiresOn": "2026-08-07"'
require_absent_text "${exceptions_config}" '"package": "*"'

require_text "${report_file}" 'auditReportVersion !== 2'
require_text "${report_file}" 'production.high > 0'
require_text "${report_file}" 'all.critical > 0'
require_text "${report_file}" 'DEPENDENCY_AUDIT_FAIL_ON_WARNING'
require_text "${report_file}" 'DEPENDENCY_AUDIT_EXCEPTIONS_PATH'
require_text "${report_file}" 'loadAndApplyDependencyAuditExceptions'
require_text "${report_file}" 'shouldFailDependencyAudit'
require_text "${report_file}" 'vulnerablePackages'
require_text "${report_file}" 'PACKAGE_NAME_PATTERN'
require_text "${report_file}" 'package.jsonとpackage-lock.jsonの整合性確認に失敗しました。'
require_text "${report_file}" 'npm auditの結果を安全に検証できませんでした。'
require_absent_text "${report_file}" 'node:child_process'
require_absent_text "${report_file}" 'exec('
require_absent_text "${report_file}" 'spawn('

require_text "${exceptions_file}" 'validateDependencyAuditExceptions'
require_text "${exceptions_file}" 'installedVersionFor'
require_text "${exceptions_file}" 'exception.expiresOn < today'
require_text "${exceptions_file}" '依存関係監査例外が重複しています。'
require_text "${exceptions_file}" 'acceptedExceptions'
require_absent_text "${exceptions_file}" 'node:child_process'
require_absent_text "${exceptions_file}" 'process.env.NPM_TOKEN'

require_text "${fix_candidates_file}" 'extractFixCandidates'
require_text "${fix_candidates_file}" 'PACKAGE_NAME_PATTERN'
require_text "${fix_candidates_file}" 'fix.version'
require_absent_text "${fix_candidates_file}" 'node:child_process'
require_absent_text "${fix_candidates_file}" 'process.env.NPM_TOKEN'

require_text "${checks_workflow}" 'node scripts/test-dependency-audit-exceptions.mjs'

require_text "${doc_file}" 'Dependabot'
require_text "${doc_file}" 'Dependency Review'
require_text "${doc_file}" 'Dependency Graph'
require_text "${doc_file}" 'フォールバック'
require_text "${doc_file}" '期限付き例外'
require_text "${doc_file}" '2026-08-07'
require_text "${doc_file}" 'npm audit'
require_text "${doc_file}" '自動マージしません'
require_text "${doc_file}" '`npm audit fix`を自動実行しません'

[[ ! -e .github/workflows/temporary-lockfile-update.yml ]] \
  || fail "一時lockfile生成Workflowを最終差分へ残さないでください。"

echo "依存関係セキュリティ設定の静的検証に成功しました。"
