#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/supply-chain-inventory.yml"
generator_file="scripts/generate-supply-chain-artifacts.sh"
normalizer_file="scripts/normalize-npm-cyclonedx.mjs"
normalizer_test_file="scripts/test-normalize-npm-cyclonedx.mjs"
report_file="scripts/supply-chain-report.mjs"
test_file="scripts/test-supply-chain-report.mjs"
doc_file="docs/supply-chain-inventory.md"
package_file="package.json"
deploy_workflow=".github/workflows/deploy-production.yml"
deploy_check="scripts/check-production-deployment-files.sh"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

for file in \
  "${workflow_file}" \
  "${generator_file}" \
  "${normalizer_file}" \
  "${normalizer_test_file}" \
  "${report_file}" \
  "${test_file}" \
  "${doc_file}" \
  "${package_file}" \
  "${deploy_workflow}" \
  "${deploy_check}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

bash -n "${generator_file}"
node --check "${normalizer_file}"
node --check "${normalizer_test_file}"
node --check "${report_file}"
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

require_text "${workflow_file}" 'pull_request:'
require_text "${workflow_file}" 'push:'
require_text "${workflow_file}" 'contents: read'
require_text "${workflow_file}" 'persist-credentials: false'
require_text "${workflow_file}" 'node scripts/test-normalize-npm-cyclonedx.mjs'
require_text "${workflow_file}" 'npm ci --ignore-scripts --no-audit --no-fund'
require_text "${workflow_file}" 'npm run supply-chain'
require_text "${workflow_file}" 'actions/upload-artifact@v4'
require_text "${workflow_file}" 'if-no-files-found: error'
require_text "${workflow_file}" 'retention-days: 14'
require_absent_text "${workflow_file}" 'secrets.'
require_absent_text "${workflow_file}" 'issues: write'
require_absent_text "${workflow_file}" 'pull-requests: write'
require_absent_text "${workflow_file}" 'id-token: write'
require_absent_text "${workflow_file}" 'attestations: write'
require_absent_text "${workflow_file}" 'ssh '
require_absent_text "${workflow_file}" 'scp '
require_absent_text "${workflow_file}" 'curl '

require_text "${generator_file}" 'npm sbom'
require_text "${generator_file}" '--sbom-format=cyclonedx'
require_text "${generator_file}" '--sbom-type=application'
require_text "${generator_file}" '--omit=dev'
require_text "${generator_file}" 'node scripts/normalize-npm-cyclonedx.mjs'
require_text "${generator_file}" 'git rev-parse HEAD'
require_text "${generator_file}" 'GITHUB_SHA="${checkout_commit_sha}"'
require_text "${generator_file}" 'sha256sum'
require_text "${generator_file}" 'umask 077'
require_absent_text "${generator_file}" 'npm install'
require_absent_text "${generator_file}" 'npx '
require_absent_text "${generator_file}" 'curl '
require_absent_text "${generator_file}" 'wget '
require_absent_text "${generator_file}" 'diagnose-sbom-refs'

require_text "${normalizer_file}" 'cdx:npm:package:path'
require_text "${normalizer_file}" 'cdx:npm:package:development'
require_text "${normalizer_file}" 'removeNpmPlacementProperties'
require_text "${normalizer_file}" 'stableJson(existing) !== stableJson(component)'
require_text "${normalizer_file}" 'の内容が競合しています。差分項目:'
require_text "${normalizer_file}" '依存関係の内容が競合しています'
require_text "${normalizer_file}" 'removedDuplicateComponents'
require_text "${normalizer_file}" 'removedDuplicateDependencies'
require_text "${normalizer_file}" 'removedNpmPlacementProperties'
require_absent_text "${normalizer_file}" 'node:child_process'
require_absent_text "${normalizer_file}" 'process.env.NPM_TOKEN'

require_text "${report_file}" 'input.bomFormat !== "CycloneDX"'
require_text "${report_file}" '重複したbom-ref'
require_text "${report_file}" '本番SBOMに直接依存'
require_text "${report_file}" 'review_required'
require_text "${report_file}" '自動拒否はせず'
require_absent_text "${report_file}" 'node:child_process'
require_absent_text "${report_file}" 'process.env.NPM_TOKEN'

require_text "${package_file}" '"supply-chain": "bash scripts/generate-supply-chain-artifacts.sh"'
require_text "${deploy_workflow}" 'npm run supply-chain'
require_text "${deploy_workflow}" 'dist/supply-chain/'
require_text "${deploy_workflow}" 'supply-chain.sha256'
require_text "${deploy_check}" 'npm run supply-chain'
require_text "${deploy_check}" 'supply-chain.sha256'

require_text "${doc_file}" 'npm sbom'
require_text "${doc_file}" 'npm配置メタデータ'
require_text "${doc_file}" 'cdx:npm:package:path'
require_text "${doc_file}" 'cdx:npm:package:development'
require_text "${doc_file}" 'CycloneDX'
require_text "${doc_file}" '自動拒否しません'
require_text "${doc_file}" 'Artifact Attestation'

if [[ -e ".github/workflows/temporary-lockfile-update.yml" ]]; then
  fail "一時的なlockfile更新Workflowを残さないでください。"
fi
if [[ -e "scripts/diagnose-sbom-refs.mjs" ]]; then
  fail "一時的なSBOM診断スクリプトを残さないでください。"
fi

if git ls-files --error-unmatch supply-chain >/dev/null 2>&1; then
  fail "生成済みsupply-chainディレクトリをGit管理しないでください。"
fi

echo "SBOM・依存ライセンス棚卸し設定の静的検証に成功しました。"
