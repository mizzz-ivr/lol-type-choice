# 依存関係セキュリティ運用

## 目的

npm依存関係とGitHub Actionsについて、更新漏れ、新規脆弱性、既存依存関係の重大な脆弱性を継続的に検知します。

この運用は次の3層で構成します。

1. Dependabotによる週次更新
2. Pull RequestでのDependency Review
3. `npm audit`による既存依存関係の週次監査

## 1. Dependabot

設定ファイル:

```text
.github/dependabot.yml
```

### npm

- 毎週月曜日9:30（Asia/Tokyo）
- security updatesを1グループへ集約
- version updatesのminor・patchを1グループへ集約
- major updateは個別PR
- 同時オープンPRは最大5件

### GitHub Actions

- 毎週火曜日9:30（Asia/Tokyo）
- minor・patchを1グループへ集約
- major updateは個別PR
- 同時オープンPRは最大5件

Dependabot PRも通常のCI、Dependency Review、各種専用品質ゲートを通します。

### リポジトリ設定

GitHubの以下を確認します。

```text
Settings
  → Advanced Security
  → Dependabot
```

推奨設定:

- Dependency graph: 有効
- Dependabot alerts: 有効
- Dependabot security updates: 有効
- Dependabot version updates: `.github/dependabot.yml`で管理

Dependabot security updatesを有効にしない場合でも、version updatesと定期`npm audit`は動作しますが、advisory発生時の修正PR作成が遅れる可能性があります。

## 2. Dependency Review

Workflow:

```text
.github/workflows/dependency-review.yml
```

`main`向けPull Requestで、追加・更新される依存関係を確認します。

- high以上の既知の脆弱性を導入するPRを失敗させる
- GitHub Tokenは`contents: read`のみ
- Secretを参照しない
- PRへの自動コメントや書き込みは行わない

### Dependency Graphが有効な場合

GitHubのSBOM APIを事前確認し、利用可能であれば公式の`actions/dependency-review-action@v4`を実行します。

この経路では、PRが追加・更新する依存関係差分にhigh以上の既知脆弱性があれば失敗します。

### Dependency Graphが未設定または利用できない場合

公式Dependency Reviewを無条件に失敗させず、次のフォールバックへ切り替えます。

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. 全依存関係の`npm audit --json`
3. 本番依存関係の`npm audit --omit=dev --json`
4. 定期監査と同じ正規化ロジックで判定

フォールバックでは、以下をPRブロック条件とします。

- 本番依存関係にhighまたはcriticalがある
- 全依存関係にcriticalがある
- lockfile整合性またはauditレポート検証に失敗する

moderateと開発依存関係のhighはSummaryへ警告として表示しますが、フォールバックではPRを停止しません。Dependency Graphを有効化すると、Workflow変更なしで公式Dependency Reviewへ自動移行します。

フォールバックは既存依存関係全体を監査するため、公式Dependency Reviewの「PR差分だけを確認する」挙動とは異なります。恒久運用ではDependency Graphを有効にしてください。

## 3. 定期npm audit

Workflow:

```text
.github/workflows/dependency-audit.yml
```

毎週月曜日9:17（Asia/Tokyo）と手動実行で確認します。

### 実行順序

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. 全依存関係の`npm audit --json`
3. `--omit=dev`を付けた本番依存関係の`npm audit --json`
4. 2つのJSONを正規化
5. GitHub Actions SummaryとArtifactへ保存
6. 警告・重大時は固定タイトルのIssueへ集約
7. 正常化時は同Issueをクローズ

`--ignore-scripts`により、定期監査経路では依存パッケージのinstall scriptを実行しません。

### 判定

| 条件 | 判定 |
|---|---|
| 本番依存関係にhighまたはcritical | 重大 |
| 全依存関係にcritical | 重大 |
| 本番依存関係にmoderate | 警告 |
| 開発依存関係にhighまたはmoderate | 警告 |
| lowのみ | 正常 |
| package.jsonとpackage-lock.jsonの不整合 | 重大 |
| npm audit失敗・不正JSON・スキーマ不一致 | 重大 |

固定Issueタイトル:

```text
[監視] 依存関係監査で脆弱性または異常を検知
```

## 4. レポート

保存するファイル:

```text
dependency-audit-report.json
dependency-audit-report.md
```

保存期間は14日です。

レポートへ記録する内容:

- 全依存関係の重大度別件数
- 本番依存関係の重大度別件数
- 開発依存関係のみの重大度別件数
- 全体判定

次の内容はIssue・Summary・Artifactへ保存しません。

- npm auditの生JSON
- npm registryのエラー全文
- 未検証の標準エラー出力
- 認証情報

## 5. 警告・重大時の対応

1. 監査IssueとArtifactを確認
2. Dependabot alertsを確認
3. 修正可能なDependabot PRがあるか確認
4. `package-lock.json`だけでなく`package.json`の変更も確認
5. ローカルまたは検証ブランチで以下を実行

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm audit --omit=dev
npm audit
npm run lint
npm run test
npm run build
npm run smoke:standalone
```

6. 互換性を確認して通常PRとしてマージ
7. 次回監査または手動実行でIssueがクローズされることを確認

## 6. 更新PRのレビュー観点

- major updateか
- Next.js、React、eslint-config-nextのバージョン整合性
- Node.js 22・npm 10の対応範囲
- package-lock.jsonに想定外のregistryがないか
- install scriptや新規native dependencyが追加されていないか
- 既存のLint・Test・Build・standaloneスモークが成功するか
- 本番デプロイと監視Workflowに影響がないか

## 7. 自動化しないこと

- Dependabot PRを自動マージしません
- `npm audit fix`を自動実行しません
- `npm audit fix --force`を使用しません
- major updateを自動適用しません
- ライセンスの自動拒否を行いません
- 本番デプロイを自動実行しません

脆弱性修正であっても、既存機能への影響をCIとレビューで確認してからマージします。

## 8. ローカル検証

静的設定と判定ロジック:

```bash
bash scripts/check-dependency-security-files.sh
node scripts/test-dependency-audit-report.mjs
```

実際のaudit:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm audit --json > dependency-audit-all.raw.json || true
npm audit --omit=dev --json > dependency-audit-production.raw.json || true
node scripts/dependency-audit-report.mjs
```

PRフォールバックと同じ重大のみ停止する場合:

```bash
DEPENDENCY_AUDIT_FAIL_ON_WARNING=false \
node scripts/dependency-audit-report.mjs
```

rawファイルはGitへ追加しないでください。

## 9. 制約

- npm registryやGitHub Advisory Databaseへの到達性に依存する
- advisory公開前の脆弱性は検知できない
- `npm audit`の重大度はadvisory提供元の評価に依存する
- Dependency ReviewはPRで導入する差分を対象とし、既存依存関係の監査は定期`npm audit`が担当する
- Dependency Graph未設定時のフォールバックはPR差分ではなく現在の依存関係全体を対象とする
- 自動修正ではないため、検知後の修正PRとレビューが必要

## 参考

- [GitHub Docs: Configuring Dependabot version updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates)
- [GitHub Docs: Configuring the dependency review action](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action)
- [npm Docs: npm audit](https://docs.npmjs.com/cli/using-npm/config/)
