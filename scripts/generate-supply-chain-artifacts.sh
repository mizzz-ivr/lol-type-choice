#!/usr/bin/env bash
set -Eeuo pipefail

output_dir="${SUPPLY_CHAIN_OUTPUT_DIR:-supply-chain}"
mkdir -p "${output_dir}"
umask 077

temporary_directory="$(mktemp -d)"
cleanup() {
  rm -rf -- "${temporary_directory}"
}
trap cleanup EXIT

all_sbom="${temporary_directory}/sbom-all.cdx.json"
production_sbom="${temporary_directory}/sbom-production.cdx.json"

if ! npm sbom \
  --sbom-format=cyclonedx \
  --sbom-type=application \
  >"${all_sbom}" \
  2>"${temporary_directory}/sbom-all.stderr.log"; then
  echo "全依存関係SBOMの生成に失敗しました。npmとlockfileの整合性を確認してください。" >&2
  exit 1
fi

if ! npm sbom \
  --sbom-format=cyclonedx \
  --sbom-type=application \
  --omit=dev \
  >"${production_sbom}" \
  2>"${temporary_directory}/sbom-production.stderr.log"; then
  echo "本番依存関係SBOMの生成に失敗しました。npmとlockfileの整合性を確認してください。" >&2
  exit 1
fi

install -m 0600 "${all_sbom}" "${output_dir}/sbom-all.cdx.json"
install -m 0600 "${production_sbom}" "${output_dir}/sbom-production.cdx.json"

SUPPLY_CHAIN_ALL_SBOM_PATH="${output_dir}/sbom-all.cdx.json" \
SUPPLY_CHAIN_PRODUCTION_SBOM_PATH="${output_dir}/sbom-production.cdx.json" \
SUPPLY_CHAIN_REPORT_PATH="${output_dir}/dependency-license-report.json" \
SUPPLY_CHAIN_MARKDOWN_PATH="${output_dir}/dependency-license-report.md" \
node scripts/supply-chain-report.mjs

(
  cd "${output_dir}"
  sha256sum \
    sbom-all.cdx.json \
    sbom-production.cdx.json \
    dependency-license-report.json \
    dependency-license-report.md \
    > supply-chain.sha256
  chmod 0600 supply-chain.sha256
)

echo "SBOM・依存ライセンス成果物の生成に成功しました。"
