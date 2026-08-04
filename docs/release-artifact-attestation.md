# 本番リリースArtifact Attestation運用

## 目的

本番手動デプロイで生成するリリースアーカイブに、GitHub Actionsが発行する暗号学的に検証可能な生成元証明を付与します。

対象:

```text
release-<DEPLOY_SHA>.tar.gz
```

次の2種類を生成します。

1. SLSA build provenance
2. CycloneDX SBOM Attestation

Artifact Attestationは、成果物のダイジェストとGitHub Actions Workflowの識別情報を結び付けます。ただし、成果物の安全性そのものを保証するものではありません。脆弱性、ライセンス可否、アプリケーションの正しさは、既存のCI・Dependency Review・npm audit・SBOMレビューで確認します。

## 対象Workflow

```text
.github/workflows/deploy-production.yml
```

`workflow_dispatch`で実行する本番手動デプロイの`build`ジョブだけがAttestationを生成します。

Pull Request用のCI、Supply Chain Inventory、監視Workflow、`deploy`ジョブでは生成しません。

## 付与する権限

`build`ジョブへ次だけを付与します。

```yaml
permissions:
  contents: read
  id-token: write
  attestations: write
```

- `contents: read`: リポジトリの読み取り
- `id-token: write`: GitHub OIDCトークンから短命の署名証明書を取得
- `attestations: write`: AttestationをGitHubへ保存

`packages: write`と`artifact-metadata: write`は付与しません。本プロジェクトはコンテナレジストリへpushせず、ファイルArtifactを対象にするためです。

`deploy`ジョブは従来どおりトップレベルの`contents: read`だけを継承し、OIDC・Attestation権限を持ちません。

## 生成順序

`build`ジョブでは、次の順序を固定します。

1. 指定SHAがmainに含まれることを確認
2. Lint・Test・Build・standaloneスモーク
3. 本番CycloneDX SBOMを生成
4. リリースアーカイブとSHA-256一覧を生成
5. リリースアーカイブのSLSA provenanceを生成
6. 本番SBOMをリリースアーカイブへ関連付け
7. GitHub Actions Artifactへ保存
8. `deploy`ジョブを開始

Attestation生成に失敗した場合は、Artifact保存とVPSデプロイへ進みません。

## Attestation対象

### SLSA provenance

```yaml
- name: リリースアーカイブの生成元証明を作成
  uses: actions/attest@v4
  with:
    subject-path: dist/release-${{ inputs.commit_sha }}.tar.gz
```

predicate type:

```text
https://slsa.dev/provenance/v1
```

### CycloneDX SBOM Attestation

```yaml
- name: 本番SBOMをリリースアーカイブへ関連付け
  uses: actions/attest@v4
  with:
    subject-path: dist/release-${{ inputs.commit_sha }}.tar.gz
    sbom-path: dist/supply-chain/sbom-production.cdx.json
```

CycloneDX predicate typeはSBOMの`specVersion`に対応します。

```text
https://cyclonedx.org/bom/v<specVersion>
```

現在のSBOMが`specVersion: 1.5`の場合:

```text
https://cyclonedx.org/bom/v1.5
```

## 履歴コミットを指定する場合の注意

本番手動デプロイは、mainからWorkflowを起動し、`commit_sha`入力でmain履歴内のコミットを指定できます。このため、次の2つが異なる場合があります。

- `DEPLOY_SHA`: 実際にcheckoutしてビルドした対象コミット
- `GITHUB_SHA`: 本番手動デプロイWorkflowを起動したmain上のコミット

Workflowは、`DEPLOY_SHA`について次を検証します。

- 40桁の小文字16進数
- checkout結果と一致
- mainの履歴に含まれる

生成した依存ライセンスレポートの`commitSha`にも、実際にcheckoutした`DEPLOY_SHA`を記録します。

一方、Attestationの署名証明書に含まれるWorkflow実行元情報は`GITHUB_SHA`側です。履歴コミットを再デプロイした場合に、`--source-digest`へ`DEPLOY_SHA`を指定しないでください。Workflow実行元まで固定して検証する場合は、Actions実行画面の`Workflow実行元コミット`を使用します。

この差を見落とさないよう、Actions Summaryへ両方のSHAを出力します。

## Artifactを取得

GitHub Actionsの本番手動デプロイ実行画面から、次をダウンロードして展開します。

```text
production-release-<DEPLOY_SHA>
```

展開後の主なファイル:

```text
release-<DEPLOY_SHA>.tar.gz
release-<DEPLOY_SHA>.tar.gz.sha256
deploy-production-release.sh
supply-chain/
  sbom-production.cdx.json
  dependency-license-report.json
  dependency-license-report.md
supply-chain.sha256
```

最初にローカルハッシュを確認します。

```bash
sha256sum --check release-<DEPLOY_SHA>.tar.gz.sha256
sha256sum --check supply-chain.sha256
```

## SLSA provenanceを検証

GitHub CLIへログイン済みであることを確認します。

```bash
gh auth status
```

リポジトリ・署名Workflow・GitHub-hosted runnerを固定して検証します。

```bash
gh attestation verify release-<DEPLOY_SHA>.tar.gz \
  --repo mizzz-ivr/lol-type-choice \
  --signer-workflow mizzz-ivr/lol-type-choice/.github/workflows/deploy-production.yml \
  --predicate-type https://slsa.dev/provenance/v1 \
  --deny-self-hosted-runners
```

期待結果:

- 成果物のSHA-256がAttestation subjectと一致
- Attestationが`mizzz-ivr/lol-type-choice`に関連付く
- 署名Workflowが`.github/workflows/deploy-production.yml`
- GitHub-hosted runnerで生成されている
- Sigstore署名とタイムスタンプが検証できる

## CycloneDX SBOM Attestationを検証

SBOMの仕様バージョンを読み取ります。

```bash
sbom_version="$(node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync("supply-chain/sbom-production.cdx.json", "utf8"));
if (!/^1\.[4-9]$/.test(value.specVersion ?? "")) process.exit(1);
process.stdout.write(value.specVersion);
')"
```

リリースアーカイブへ関連付けたSBOM Attestationを検証します。

```bash
gh attestation verify release-<DEPLOY_SHA>.tar.gz \
  --repo mizzz-ivr/lol-type-choice \
  --signer-workflow mizzz-ivr/lol-type-choice/.github/workflows/deploy-production.yml \
  --predicate-type "https://cyclonedx.org/bom/v${sbom_version}" \
  --deny-self-hosted-runners
```

SBOM内容も表示する場合:

```bash
gh attestation verify release-<DEPLOY_SHA>.tar.gz \
  --repo mizzz-ivr/lol-type-choice \
  --signer-workflow mizzz-ivr/lol-type-choice/.github/workflows/deploy-production.yml \
  --predicate-type "https://cyclonedx.org/bom/v${sbom_version}" \
  --deny-self-hosted-runners \
  --format json \
  --jq '.[].verificationResult.statement.predicate'
```

## デプロイ対象SHAを突合

依存ライセンスレポートに記録されたcheckout SHAを確認します。

```bash
node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync("supply-chain/dependency-license-report.json", "utf8"));
if (!/^[0-9a-f]{40}$/.test(value.commitSha ?? "")) process.exit(1);
console.log(value.commitSha);
'
```

出力が次と一致することを確認します。

- Artifact名の`<DEPLOY_SHA>`
- リリースアーカイブ名の`<DEPLOY_SHA>`
- デプロイ対象として指定したコミットSHA
- GitHub Actions Summaryの`デプロイ対象コミット`

## Workflow実行元まで固定する検証

Workflow起動時のmainコミットが判明している場合、次を追加できます。

```bash
--source-digest <GITHUB_SHA>
--source-ref refs/heads/main
```

例:

```bash
gh attestation verify release-<DEPLOY_SHA>.tar.gz \
  --repo mizzz-ivr/lol-type-choice \
  --signer-workflow mizzz-ivr/lol-type-choice/.github/workflows/deploy-production.yml \
  --source-digest <GITHUB_SHA> \
  --source-ref refs/heads/main \
  --deny-self-hosted-runners
```

`<GITHUB_SHA>`はActions Summaryの`Workflow実行元コミット`を使用します。

## 検証失敗時

次のいずれかが失敗した場合、そのArtifactを本番投入対象として扱いません。

- リリースアーカイブのSHA-256
- supply-chainファイルのSHA-256
- SLSA provenance検証
- CycloneDX SBOM Attestation検証
- デプロイ対象SHAの突合

対応:

1. 対象Actions runと入力値を確認
2. Artifactを再ダウンロード
3. 署名Workflow・predicate type・対象SHAを確認
4. 既存Attestationを上書きせず、新しい本番手動デプロイrunで再生成
5. 原因が不明な場合はデプロイしない

## 静的検証

```bash
bash scripts/check-release-attestation-files.sh
node scripts/test-release-attestation-policy.mjs
```

検証内容:

- `actions/attest@v4`を2回だけ使用
- subjectをリリースアーカイブ1ファイルへ固定
- SBOMを本番CycloneDXファイルへ固定
- glob・ディレクトリ・複数subjectを禁止
- `build`ジョブ以外のAttestation権限を禁止
- 他WorkflowへのOIDC・Attestation権限追加を禁止
- 成果物作成、provenance、SBOM関連付け、Artifact保存の順序を固定
- 不要な書き込み権限を禁止

## 対象外

- アプリケーションの安全性保証
- 脆弱性がないことの保証
- ライセンス利用可否の法的判断
- VPS側での自動Attestation検証
- GitHub Release作成
- コンテナイメージ署名
- 秘密鍵を用いた独自署名
- Attestationの自動削除

## 参考

- [GitHub Docs: Using artifact attestations to establish provenance for builds](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [actions/attest](https://github.com/actions/attest)
- [GitHub CLI: gh attestation verify](https://cli.github.com/manual/gh_attestation_verify)
