import assert from "node:assert/strict";
import { validateReleaseAttestationPolicy } from "./release-attestation-policy.mjs";

const releaseSubject = "dist/release-${{ inputs.commit_sha }}.tar.gz";

const validWorkflow = `name: 本番手動デプロイ
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  build:
    permissions:
      contents: read
      id-token: write
      attestations: write
    steps:
      - name: リリース成果物を作成
        run: touch dist/release
      - name: リリースアーカイブの生成元証明を作成
        id: attest-provenance
        uses: actions/attest@v4
        with:
          subject-path: ${releaseSubject}
      - name: 本番SBOMをリリースアーカイブへ関連付け
        id: attest-sbom
        uses: actions/attest@v4
        with:
          subject-path: ${releaseSubject}
          sbom-path: dist/supply-chain/sbom-production.cdx.json
      - name: リリース成果物を保存
        uses: actions/upload-artifact@v4
  deploy:
    needs: build
    steps:
      - name: deploy
        run: true
`;

assert.deepEqual(validateReleaseAttestationPolicy({ workflow: validWorkflow }), []);

const expectError = (workflow, pattern, otherWorkflows = []) => {
  const errors = validateReleaseAttestationPolicy({ workflow, otherWorkflows });
  assert.ok(errors.some((error) => pattern.test(error)), `想定エラーがありません: ${errors.join(" / ")}`);
};

expectError(validWorkflow.replace("      id-token: write\n", ""), /id-token権限/);
expectError(
  validWorkflow.replace("  deploy:\n", "  deploy:\n    permissions:\n      attestations: write\n"),
  /deployジョブへAttestation用権限/
);
expectError(
  validWorkflow.replace(`subject-path: ${releaseSubject}`, "subject-path: dist/**"),
  /glob・ディレクトリ/
);
expectError(
  validWorkflow.replace(
    "      - name: リリース成果物を作成\n        run: touch dist/release\n",
    ""
  ),
  /順序/
);
expectError(
  validWorkflow.replace("          sbom-path: dist/supply-chain/sbom-production.cdx.json\n", ""),
  /本番CycloneDX SBOM/
);
expectError(
  validWorkflow,
  /本番デプロイ以外でAttestation/,
  [{ name: "ci.yml", content: "steps:\n  - uses: actions/attest@v4\n" }]
);
expectError(
  validWorkflow.replace(
    "      - name: リリース成果物を保存",
    "      - name: 余分な証明\n        uses: actions/attest@v4\n        with:\n          subject-path: dist/extra.bin\n      - name: リリース成果物を保存"
  ),
  /2回に固定/
);
expectError(
  validWorkflow.replace(
    "      attestations: write\n",
    "      attestations: write\n      packages: write\n"
  ),
  /不要な書き込み権限/
);

console.log("本番リリースArtifact Attestationポリシーの正常・異常系テストに成功しました。");
