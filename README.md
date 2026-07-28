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
  deployment-github-actions.md
  deployment-rental-server.md
  deployment-sakura-vps.md
  production-monitoring.md
  release-readiness.md
  security-headers.md
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
  check-production-deployment-files.sh
  check-production-monitoring-files.sh
  check-release-readiness-files.sh
  check-sakura-vps-files.sh
  deploy-production-release.sh
  prepare-standalone.mjs
  production-health-check.mjs
  release-readiness.mjs
  smoke-standalone.mjs
  smoke-test.mjs
  test-production-health-check.mjs
  test-production-release.sh
  test-release-readiness.mjs
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
bash scripts/test-production-release.sh
bash scripts/check-production-monitoring-files.sh
node scripts/test-production-health-check.mjs
bash scripts/check-release-readiness-files.sh
node scripts/test-release-readiness.mjs
npm run lint
npm run test
npm run build
npm run smoke:standalone
```

`npm run build` はNext.jsのstandalone成果物を生成し、`public` と `.next/static` を実行ディレクトリへ配置します。

`main` 向けPull Requestと `main` へのpushでは、以下をGitHub Actionsで分けて確認します。

- `CI`: さくらのVPS設定・セキュリティヘッダー・Lint・Test・Build・standalone起動スモークテスト
- `Deployment Checks`: 本番デプロイWorkflowの安全条件・リリース切替・ヘルスチェック失敗時の自動切り戻し
- `Monitoring Checks`: 外形監視Workflowの権限・URL制約・HTTP異常・内容異常・タイムアウト
- `Release Readiness Checks`: リリース判定Workflowの最小権限・GO／NO-GO判定・Secret非出力

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

公開後の外形監視・障害Issue・復旧確認は [本番サイトの外形監視](docs/production-monitoring.md) を参照してください。

HTTPセキュリティヘッダーの定義、CSPの制約、HSTSの運用は [HTTPセキュリティヘッダー運用](docs/security-headers.md) を参照してください。

事業者に依存しない構成説明は [レンタルサーバー向けデプロイ手順](docs/deployment-rental-server.md) に記載しています。

### 基本的な本番ビルド

```bash
cp .env.example .env.production
npm ci --no-audit --no-fund
npm run lint
npm run test
npm run build
npm run smoke:standalone
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
- `post_deploy`: `pre_deploy`の確認に加え、本番URLへスモークテストを実行

実行には次を入力します。

- mainに含まれる40桁のコミットSHA
- `pre_deploy`または`post_deploy`
- 確認文字列`CHECK`

判定結果は`GO`または`NO-GO`としてGitHub Actions SummaryとJSON／Markdown Artifactへ保存されます。このWorkflowはSSH接続、SCP、本番デプロイ、Issue更新を行いません。

### GitHub Actions本番手動デプロイ

`.github/workflows/deploy-production.yml` は、以下を満たす場合だけ実行します。

- Actions画面から手動実行
- mainブランチから実行
- mainに含まれる40桁のコミットSHAを指定
- 確認文字列として`DEPLOY`を入力
- `production` Environmentの接続設定・Secretが登録済み

デプロイ先では`releases/<SHA>`へ配置し、`current`シンボリックリンクを切り替えます。PM2再読込または内部ヘルスチェックに失敗した場合、直前リリースへ自動で戻します。

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
