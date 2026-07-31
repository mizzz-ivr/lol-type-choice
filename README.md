# LoL Playstyle Type Finder (β)

League of Legends 向けの **MBTI風プレイスタイル診断サイト** です。  
β版では 48 問・8軸分析・8タイプ分類に拡張し、結果の納得感と共有しやすさを改善しています。

## β版での主な改善

- 設問を 12 問 → 48 問へ拡張（各軸6問・逆転項目あり）
- 結果タイプを 8 種に再整理し、強み / 注意点の説明を追加
- チャンプデータを 20体+ へ拡張
- 診断ページの進捗UX改善（残り問数表示、復元、離脱計測）
- 結果ページの情報設計改善（上位軸表示、注意点、共有文言）
- 軽量イベント計測（開始/回答/離脱/完了/共有/再診断）

## 全体構成

```txt
app/
  api/health/route.ts
  layout.tsx
  page.tsx
  diagnosis/page.tsx
  result/page.tsx
  robots.ts
  sitemap.ts
components/
  AxisBars.tsx
  ProgressBar.tsx
  QuestionCard.tsx
  ResultActions.tsx
config/
  securityHeaders.ts
data/
  champions.ts
  questions.ts
  resultTypes.ts
deploy/
  ecosystem.config.cjs
  nginx.conf.example
  sakura-vps/
    ecosystem.production.cjs
    nginx.conf.template
docs/
  dependency-security.md
  deployment-github-actions.md
  deployment-rental-server.md
  deployment-sakura-vps.md
  domain-security-monitoring.md
  production-monitoring.md
  release-artifact-attestation.md
  release-readiness.md
  security-headers.md
  supply-chain-inventory.md
lib/
  analytics.ts
  resultQuery.ts
  scoring.ts
  share.ts
  site.ts
  types.ts
  validation.ts
scripts/
  bootstrap-sakura-vps.sh
  check-dependency-security-files.sh
  check-domain-security-files.sh
  check-production-deployment-files.sh
  check-production-monitoring-files.sh
  check-release-attestation-files.sh
  check-release-readiness-files.sh
  check-sakura-vps-files.sh
  check-supply-chain-files.sh
  dependency-audit-report.mjs
  deploy-production-release.sh
  domain-security-check.mjs
  generate-supply-chain-artifacts.sh
  merge-domain-security-readiness.mjs
  prepare-standalone.mjs
  production-health-check.mjs
  release-attestation-policy.mjs
  release-readiness.mjs
  smoke-standalone.mjs
  smoke-test.mjs
  supply-chain-report.mjs
  test-dependency-audit-report.mjs
  test-domain-security-check.mjs
  test-merge-domain-security-readiness.mjs
  test-production-health-check.mjs
  test-production-release.sh
  test-release-attestation-policy.mjs
  test-release-readiness.mjs
  test-supply-chain-report.mjs
tests/
  health.test.ts
  scoring.test.ts
  securityHeaders.test.ts
  site.test.ts
```

## 使用技術

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Vitest

## 必要環境

- Node.js 22.x
- npm 10.x

Node.jsのバージョンは `.nvmrc` で固定しています。

## セットアップ

```bash
nvm use
npm install
```

## 開発起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いて確認します。

## 品質確認

```bash
bash scripts/check-sakura-vps-files.sh
bash scripts/check-production-deployment-files.sh
bash scripts/check-release-attestation-files.sh
node scripts/test-release-attestation-policy.mjs
bash scripts/test-production-release.sh
bash scripts/check-production-monitoring-files.sh
node scripts/test-production-health-check.mjs
bash scripts/check-release-readiness-files.sh
node scripts/test-release-readiness.mjs
bash scripts/check-domain-security-files.sh
node scripts/test-domain-security-check.mjs
node scripts/test-merge-domain-security-readiness.mjs
bash scripts/check-dependency-security-files.sh
node scripts/test-dependency-audit-report.mjs
bash scripts/check-supply-chain-files.sh
node scripts/test-supply-chain-report.mjs
npm run lint
npm run test
npm run build
npm run smoke:standalone
npm run supply-chain
```

`npm run build` はNext.jsのstandalone成果物を生成し、`public` と `.next/static` を実行ディレクトリへ配置します。

`main` 向けPull Requestと `main` へのpushでは、以下をGitHub Actionsで分けて確認します。

- `CI`: さくらのVPS設定・セキュリティヘッダー・Lint・Test・Build・standalone起動スモークテスト
- `Dependency Review`: PRで追加・更新される依存関係のhigh以上の既知脆弱性
- `Dependency Security Checks`: Dependabot・監査Workflowの安全条件とaudit判定ロジック
- `Supply Chain Inventory`: 全依存・本番依存のCycloneDX SBOM、ライセンス棚卸し、SHA-256
- `Deployment Checks`: 本番デプロイWorkflowの安全条件・Artifact Attestation権限・証明対象・リリース切替・自動切り戻し
- `Monitoring Checks`: 外形監視Workflowの権限・URL制約・HTTP異常・内容異常・タイムアウト
- `Release Readiness Checks`: リリース判定Workflowの最小権限・GO／NO-GO判定・Secret非出力
- `Domain Security Checks`: DNS・TLS監視の接続先制約・証明書期限判定・リリース判定連携

いずれかが失敗した場合、対象の品質ゲートは失敗として終了します。

## レンタルサーバーへの公開

初回公開先は **さくらのVPS 2GB・東京リージョン・Ubuntu 24.04** を推奨構成としています。

選定理由:

- Node.js常駐プロセス、Nginx、PM2を利用できる
- 2GB・3vCPU・SSD 100GBで、サーバー上のNext.jsビルドに必要な余裕がある
- Ubuntu 24.04の標準OSとSSH公開鍵を利用できる
- 将来必要になった場合にスケールアップできる

共有レンタルサーバーでNode.jsの常駐実行またはリバースプロキシが利用できない場合、この構成のままでは公開できません。

初期構築・契約設定・UFW・Fail2ban・Node.js・PM2・Nginx・DNS・SSLは [さくらのVPS向けデプロイ手順](docs/deployment-sakura-vps.md) を参照してください。

初期構築後の更新は、push時の自動公開ではなく、`production` Environmentを利用した [GitHub Actions本番手動デプロイ手順](docs/deployment-github-actions.md) を推奨します。

公開前後のGO／NO-GO判定は [リリース可否判定](docs/release-readiness.md) を参照してください。

公開後のHTTP外形監視・障害Issue・復旧確認は [本番サイトの外形監視](docs/production-monitoring.md) を参照してください。

DNS解決、TLS証明書の信頼性、有効期限の事前警告は [本番ドメイン・TLS証明書監視](docs/domain-security-monitoring.md) を参照してください。

HTTPセキュリティヘッダーの定義、CSPの制約、HSTSの運用は [HTTPセキュリティヘッダー運用](docs/security-headers.md) を参照してください。

依存関係の週次更新、PR差分レビュー、定期脆弱性監査は [依存関係セキュリティ運用](docs/dependency-security.md) を参照してください。

全依存・本番依存のSBOM、ライセンス情報、デプロイ成果物との対応付けは [SBOM・依存ライセンス棚卸し運用](docs/supply-chain-inventory.md) を参照してください。

本番リリースアーカイブの生成元とCycloneDX SBOMの関連付けは [本番リリースArtifact Attestation](docs/release-artifact-attestation.md) を参照してください。

事業者に依存しない構成説明は [レンタルサーバー向けデプロイ手順](docs/deployment-rental-server.md) に記載しています。

### 基本的な本番ビルド

```bash
cp .env.example .env.production
npm ci --no-audit --no-fund
npm run lint
npm run test
npm run build
npm run smoke:standalone
npm run supply-chain
npm run start
```

本番URLに対する公開後確認:

```bash
SMOKE_BASE_URL=https://example.com npm run smoke
```

スモークテストでは主要ページの内容に加え、共通セキュリティヘッダーと`X-Powered-By`非公開も確認します。

### リリース可否判定

`.github/workflows/release-readiness.yml` は、GitHub Actions画面から手動で実行します。

- `pre_deploy`: 本番デプロイ前のコード品質・Environment設定・SSH鍵・known_hosts・監視障害を確認
- `post_deploy`: `pre_deploy`の確認に加え、本番URLのHTTPスモーク、DNS解決、TLS証明書を確認

実行には次を入力します。

- mainに含まれる40桁のコミットSHA
- `pre_deploy`または`post_deploy`
- 確認文字列`CHECK`

判定結果は`GO`または`NO-GO`としてGitHub Actions SummaryとJSON／Markdown Artifactへ保存されます。このWorkflowはSSH接続、SCP、本番デプロイ、Issue更新を行いません。

TLS証明書は残日数15〜30日を警告、14日以下を重大として扱います。警告はGOを維持しますが、重大は`post_deploy`をNO-GOにします。

### GitHub Actions本番手動デプロイ

`.github/workflows/deploy-production.yml` は、以下を満たす場合だけ実行します。

- Actions画面から手動実行
- mainブランチから実行
- mainに含まれる40桁のコミットSHAを指定
- 確認文字列として`DEPLOY`を入力
- `production` Environmentの接続設定・Secretが登録済み

デプロイ先では`releases/<SHA>`へ配置し、`current`シンボリックリンクを切り替えます。PM2再読込または内部ヘルスチェックに失敗した場合、直前リリースへ自動で戻します。

デプロイArtifactには同一コミットから生成した本番SBOM・ライセンスレポート・SHA-256一覧を含めます。これらはVPSへ転送せず、GitHub Actions上のデプロイ証跡として保存します。

リリースアーカイブにはSLSA provenanceとCycloneDX SBOM Attestationを付与します。Attestation生成に失敗した場合はArtifact保存・productionデプロイへ進みません。履歴コミットを再デプロイする場合は、デプロイ対象SHAとWorkflow実行元SHAを区別して確認します。

### 本番外形監視

`.github/workflows/production-monitoring.yml` は、Repository Variable `PRODUCTION_SITE_URL` が設定されている場合に、15分間隔で以下を確認します。

- `/`
- `/api/health`
- `/robots.txt`
- `/sitemap.xml`

異常時は固定タイトルの障害Issueを作成または更新し、復旧時は監視結果を記録してクローズします。監視からSSH Secret、VPS、デプロイWorkflowへはアクセスしません。

ローカルから同じ監視を実行できます。

```bash
PRODUCTION_SITE_URL=https://example.com \
HEALTH_REPORT_PATH=production-health-report.json \
node scripts/production-health-check.mjs
```

### DNS・TLS証明書監視

`.github/workflows/domain-security-monitoring.yml` は、Repository Variable `PRODUCTION_SITE_URL` が設定されている場合に毎日実行します。

- A・AAAA相当のDNS解決結果があること
- 解決先が公開IPであること
- 検証済みIPへTLS 1.2以上で接続できること
- 証明書チェーンとホスト名が有効であること
- 証明書の残日数がしきい値を超えていること

警告または重大判定時は固定タイトルのIssueを作成または更新し、正常化時にクローズします。DNS変更、Certbot実行、証明書更新、Nginx reloadは自動実行しません。

ローカルから実行する場合:

```bash
PRODUCTION_SITE_URL=https://example.com \
TLS_WARNING_DAYS=30 \
TLS_CRITICAL_DAYS=14 \
node scripts/domain-security-check.mjs
```

### 依存関係セキュリティ

`.github/dependabot.yml`でnpmとGitHub Actionsの更新を週次確認し、minor・patch更新をグループ化します。

`main`向けPRではDependency Reviewがhigh以上の新規脆弱性を確認します。既存依存関係は`.github/workflows/dependency-audit.yml`が週次監査し、警告・重大時は固定タイトルのIssueへ結果を集約します。

ローカルで判定ロジックを確認できます。

```bash
bash scripts/check-dependency-security-files.sh
node scripts/test-dependency-audit-report.mjs
```

Dependabot PRは自動マージせず、`npm audit fix`も自動実行しません。

### SBOM・依存ライセンス棚卸し

`.github/workflows/supply-chain-inventory.yml`は、`main`向けPRと`main`へのpushで全依存関係・本番依存関係のCycloneDX SBOMを生成します。

ライセンス情報がない依存、SPDX IDではなく名称だけの表記、複合式、PURL欠落、複数バージョンをレビュー対象として可視化します。ライセンスの許可・拒否は自動判定しません。

```bash
bash scripts/check-supply-chain-files.sh
node scripts/test-supply-chain-report.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm run supply-chain
sha256sum --check supply-chain/supply-chain.sha256
```

## ヘルスチェック

```text
GET /api/health
```

正常時はHTTP 200と以下を返します。

```json
{"status":"ok"}
```

内部情報、環境変数、ホスト名、秘密情報は返しません。

## 計測イベント（最小実装）

`lib/analytics.ts` の `trackEvent` で `dataLayer` / `gtag` に送信します。

- `diagnosis_started`
- `question_answered`
- `diagnosis_abandoned`
- `diagnosis_completed`
- `result_shared`
- `retake_clicked`

> TODO: 本番運用時はイベントの重複除去・セッションID採番・同意バナー連携を追加。

## Riot非公式表記に関する注意

本プロジェクトは Riot Games とは関係のない **非公式ファンプロジェクト** です。  
League of Legends および関連名称・アセットの権利は Riot Games に帰属します。
