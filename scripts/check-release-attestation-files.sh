#!/usr/bin/env bash
set -Eeuo pipefail

workflow_file=".github/workflows/deploy-production.yml"
deployment_checks_file=".github/workflows/deployment-checks.yml"
policy_file="scripts/release-attestation-policy.mjs"
test_file="scripts/test-release-attestation-policy.mjs"
doc_file="docs/release-artifact-attestation.md"
deployment_doc="docs/deployment-github-actions.md"
readme_file="README.md"

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

for file in \
  "${workflow_file}" \
  "${deployment_checks_file}" \
  "${policy_file}" \
  "${test_file}" \
  "${doc_file}" \
  "${deployment_doc}" \
  "${readme_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

node --check "${policy_file}"
node --check "${test_file}"

require_text "${workflow_file}" 'permissions:'
require_text "${workflow_file}" 'id-token: write'
require_text "${workflow_file}" 'attestations: write'
require_text "${workflow_file}" 'uses: actions/attest@v4'
require_text "${workflow_file}" 'name: リリースアーカイブの生成元証明を作成'
require_text "${workflow_file}" 'name: 本番SBOMをリリースアーカイブへ関連付け'
require_text "${workflow_file}" 'subject-path: dist/release-${{ inputs.commit_sha }}.tar.gz'
require_text "${workflow_file}" 'sbom-path: dist/supply-chain/sbom-production.cdx.json'
require_text "${workflow_file}" 'name: リリース成果物を保存'
require_absent_text "${workflow_file}" 'subject-path: dist/**'
require_absent_text "${workflow_file}" 'subject-path: dist/*'
require_absent_text "${workflow_file}" 'artifact-metadata: write'
require_absent_text "${workflow_file}" 'packages: write'

require_text "${deployment_checks_file}" 'bash scripts/check-release-attestation-files.sh'
require_text "${deployment_checks_file}" 'node scripts/test-release-attestation-policy.mjs'
require_text "${policy_file}" 'actions/attest@v4'
require_text "${policy_file}" '本番デプロイ以外へid-token: writeを付与しないでください'
require_text "${policy_file}" '成果物作成→provenance→SBOM関連付け→Artifact保存'
require_text "${test_file}" 'subject-path: dist/**'
require_text "${test_file}" 'packages: write'

require_text "${doc_file}" 'gh attestation verify'
require_text "${doc_file}" 'https://slsa.dev/provenance/v1'
require_text "${doc_file}" 'https://cyclonedx.org/bom/v'
require_text "${doc_file}" '安全性そのものを保証するものではありません'
require_text "${deployment_doc}" 'リリースArtifactの生成元証明'
require_text "${readme_file}" '本番リリースArtifact Attestation'

node "${policy_file}"

echo "本番リリースArtifact Attestation設定の静的検証に成功しました。"
