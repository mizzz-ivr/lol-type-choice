# SBOM・依存ライセンス棚卸し運用

## 目的

本番デプロイに含まれるOSSコンポーネントをコミット単位で追跡し、依存関係の構成・バージョン・PURL・ライセンス情報をレビュー可能にします。

脆弱性の有無は`npm audit`とDependency Reviewが担当し、この運用は次を担当します。

- CycloneDX SBOMの生成
- 全依存関係と本番依存関係の分離
- ライセンス情報の棚卸し
- 情報欠落や複数バージョンの可視化
- 本番デプロイ成果物との対応付け

## 生成方法

Node.js 22とリポジトリで固定したnpm 10を使用します。新しいSBOM生成パッケージは追加せず、npm標準の`npm sbom`を利用します。

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run supply-chain
```

生成スクリプト:

```text
scripts/generate-supply-chain-artifacts.sh
```

生成先:

```text
supply-chain/
```

## npm生成SBOMの正規化

npm 10.9.8の`npm sbom`は、依存ツリー内に同一パッケージ・同一バージョンが複数配置されている場合、同じ`bom-ref`のコンポーネントを複数出力することがあります。依存関係の`ref`も同じ内容で重複する場合があります。

実際の出力では、同じコンポーネントでも次のnpm配置メタデータだけが配置ごとに異なりました。

- `cdx:npm:package:path`
- `cdx:npm:package:development`

`path`はnode_modules内の配置場所、`development`はその配置がdev依存として扱われたかを示します。ライセンス棚卸しの本番・開発区分は、別途生成する`--omit=dev`の本番SBOMとの包含関係で判定するため、この2項目へ依存しません。

そのままではCycloneDX参照を一意に検証できないため、`scripts/normalize-npm-cyclonedx.mjs`で次の順に正規化します。

1. 各コンポーネントから上記2種類のnpm配置メタデータだけを除外
2. `bom-ref`が同じコンポーネントについて、残る全項目をキー順に正規化して比較
3. 残る全項目が一致する場合だけ1件へ統合
4. 依存関係の`ref`が同じ場合は、`dependsOn`を重複除去・ソートして完全一致を確認

名前、バージョン、PURL、ライセンス、外部参照、上記以外のproperty、依存先などが少しでも異なる重複は統合せず、内容競合としてCIを失敗させます。

正規化後のSBOMに重複した`bom-ref`または`ref`が残っている場合も、後段の検証で失敗します。正規化時は削除した重複件数とnpm配置プロパティ件数だけをログへ出し、配置パスや元SBOMの任意文字列はログへ出しません。

## 生成物

| ファイル | 内容 |
|---|---|
| `sbom-all.cdx.json` | 開発依存を含む正規化済みCycloneDX SBOM |
| `sbom-production.cdx.json` | `--omit=dev`を適用した正規化済み本番依存関係SBOM |
| `dependency-license-report.json` | 機械処理用の正規化レポート |
| `dependency-license-report.md` | GitHub Actions Summary・レビュー用の集計 |
| `supply-chain.sha256` | 上記4ファイルのSHA-256 |

生成済みの`supply-chain/`はGit管理しません。Pull Request・main・本番デプロイ対象コミットごとに再生成します。

## CI Workflow

Workflow:

```text
.github/workflows/supply-chain-inventory.yml
```

`main`向けPull Requestと`main`へのpushで次を実行します。

1. 静的安全性チェック
2. npm配置メタデータ除外・重複正規化テスト
3. レポート生成ロジックの正常・警告・異常系テスト
4. `npm ci --ignore-scripts`
5. 全依存関係SBOM生成・正規化
6. 本番依存関係SBOM生成・正規化
7. SBOM検証とライセンスレポート生成
8. MarkdownをGitHub Actions Summaryへ追加
9. 生成物を14日間Artifactとして保存

Workflowは`contents: read`のみを使用します。Secret、SSH、SCP、VPS、本番Environment、OIDC、Attestation権限にはアクセスしません。

## 本番デプロイ成果物

`.github/workflows/deploy-production.yml`のbuildジョブでも、Lint・Test・Build・standaloneスモーク成功後に同じ生成処理を実行します。

`production-release-<SHA>` Artifactには次を含めます。

```text
release-<SHA>.tar.gz
release-<SHA>.tar.gz.sha256
deploy-production-release.sh
supply-chain/
supply-chain.sha256
```

SBOMとライセンスレポートはVPSへ転送せず、GitHub Actionsのデプロイ証跡として保存します。ランタイムへ不要なファイルを追加しないためです。

本番手動デプロイでは、リリースアーカイブにSLSA provenanceを付与し、`sbom-production.cdx.json`をCycloneDX SBOM Attestationとして同じアーカイブへ関連付けます。検証方法と履歴コミット指定時の注意点は[本番リリースArtifact Attestation運用](release-artifact-attestation.md)を参照してください。

Pull Requestとmainの`Supply Chain Inventory`は棚卸し専用であり、OIDC・Attestation権限を持たせません。

## CIを失敗させる条件

- SBOMがJSONとして読み取れない
- `bomFormat`が`CycloneDX`ではない
- 対応外の仕様バージョン
- ルートコンポーネントがない
- コンポーネントが空または上限を超える
- npm配置メタデータを除外しても同じ`bom-ref`を持つコンポーネントの内容が競合する
- 同じ`ref`を持つ依存関係の`dependsOn`が競合する
- 正規化後に`bom-ref`または依存関係`ref`が重複している
- 依存関係の`ref`・`dependsOn`が存在しないコンポーネントを参照する
- ルート依存関係がない
- package.jsonの直接本番依存が本番SBOMに存在しない
- 本番SBOMに全依存関係SBOMへ存在しないコンポーネントがある
- 全依存関係SBOMより本番SBOMの構成が多い
- 正規化レポートを安全に生成できない

これらは生成物の信頼性がない状態なので、警告ではなく失敗として扱います。

## レビュー対象として可視化する条件

次は自動拒否しません。Markdownを警告状態にし、JSONで対象コンポーネントを確認します。

- ライセンス情報がない
- SPDX IDではなく名称だけで記録されている
- 複合ライセンス式がある
- PURLがない
- 同じパッケージの複数バージョンが存在する

ライセンス名や式だけで利用可否を断定すると、例外条項・リンク・NOTICE・配布形態を考慮できません。禁止ライセンスの自動判定は、運用方針と法務確認を定義した別タスクで扱います。

## セキュリティ設計

- npm 10標準の`npm sbom`を使用する
- PR用生成経路ではinstall scriptを実行しない
- 一時ファイルを`mktemp`配下へ作り、終了時に削除する
- 除外対象を2種類のnpm配置メタデータへ限定する
- 除外後に全項目が一致する重複だけを統合し、内容競合を拒否する
- 出力ファイルを0600、生成時のumaskを077にする
- npmの標準エラー全文をArtifactへ保存しない
- レポートへ環境変数や認証情報を含めない
- PURLはnpm形式だけを許可する
- パッケージ名・バージョン・文字列長を検証する
- 生成物にSHA-256一覧を付ける
- 外部サービスへSBOMを自動送信しない
- Attestation権限を本番手動デプロイのbuildジョブへ限定する

## 確認方法

ローカル検証:

```bash
bash scripts/check-supply-chain-files.sh
node scripts/test-normalize-npm-cyclonedx.mjs
node scripts/test-supply-chain-report.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm run supply-chain
cat supply-chain/dependency-license-report.md
sha256sum --check supply-chain/supply-chain.sha256
```

本番デプロイArtifactでは、`dist`相当の展開先で次を確認します。

```bash
sha256sum --check supply-chain.sha256
```

生成元とSBOMの関連付けは次の文書に従って`gh attestation verify`で確認します。

```text
docs/release-artifact-attestation.md
```

## レビュー観点

- 正規化された重複件数やnpm配置プロパティ件数が急増していないか
- 本番コンポーネント数が不自然に増減していないか
- 新しい直接依存が追加されていないか
- `UNKNOWN`ライセンスが増えていないか
- SPDX IDではない名称表記の根拠を確認できるか
- 複合ライセンス式の選択条件を確認したか
- 同一パッケージの複数バージョンが必要か
- PURL欠落がツール制約か、依存情報欠落か
- package-lock.jsonに想定外のregistryがないか
- 本番リリースアーカイブのAttestation検証が成功するか

## 対象外

- ライセンスの法的判断
- 許可・拒否リストによる自動ブロック
- SBOMの外部公開
- Dependency-Track等への自動送信
- コンテナ・OSパッケージのSBOM
- VPS側での自動Attestation検証
- 秘密鍵を用いた独自署名

本番リリースアーカイブのGitHub Artifact Attestationは、[本番リリースArtifact Attestation運用](release-artifact-attestation.md)で管理します。
