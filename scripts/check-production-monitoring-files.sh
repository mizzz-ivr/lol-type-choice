#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/production-monitoring.yml"
monitor_script="scripts/production-health-check.mjs"
test_script="scripts/test-production-health-check.mjs"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
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

for file in "${workflow_file}" "${monitor_script}" "${test_script}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

node --check "${monitor_script}"
node --check "${test_script}"

require_text "${workflow_file}" 'schedule:'
require_text "${workflow_file}" 'cron: "7,22,37,52 * * * *"'
require_text "${workflow_file}" 'workflow_dispatch:'
require_text "${workflow_file}" 'contents: read'
require_text "${workflow_file}" 'issues: write'
require_text "${workflow_file}" 'group: production-health-monitoring'
require_text "${workflow_file}" 'cancel-in-progress: true'
require_text "${workflow_file}" 'persist-credentials: false'
require_text "${workflow_file}" 'PRODUCTION_SITE_URL: ${{ vars.PRODUCTION_SITE_URL }}'
require_text "${workflow_file}" 'continue-on-error: true'
require_text "${workflow_file}" 'gh issue create'
require_text "${workflow_file}" 'gh issue comment'
require_text "${workflow_file}" 'gh issue close'
require_text "${workflow_file}" 'steps.health.outcome == '\''failure'\'''
require_text "${workflow_file}" 'steps.health.outcome == '\''success'\'''

require_absent_text "${workflow_file}" 'secrets.'
require_absent_text "${workflow_file}" 'ssh '
require_absent_text "${workflow_file}" 'scp '
require_absent_text "${workflow_file}" 'deploy-production-release.sh'
require_absent_text "${workflow_file}" 'permissions: write-all'

require_text "${monitor_script}" 'https:'
require_text "${monitor_script}" 'localhostは本番監視先に指定できません'
require_text "${monitor_script}" 'プライベートまたはループバックIPは本番監視先に指定できません'
require_text "${monitor_script}" '"/api/health"'
require_text "${monitor_script}" '"/robots.txt"'
require_text "${monitor_script}" '"/sitemap.xml"'
require_text "${monitor_script}" 'AbortController'
require_text "${monitor_script}" 'HEALTH_REPORT_PATH'

if grep -Eq 'cron:[[:space:]]*["'"']?0[[:space:]]' "${workflow_file}"; then
  fail "毎時0分開始はGitHub Actionsの混雑を避けるため使用しないでください。"
fi

echo "本番外形監視設定の静的検証に成功しました。"
