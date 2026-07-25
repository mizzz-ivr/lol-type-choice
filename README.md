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
data/
  champions.ts
  questions.ts
  resultTypes.ts
deploy/
  ecosystem.config.cjs
  nginx.conf.example
  sakura-vps/nginx.conf.template
docs/
  deployment-rental-server.md
  deployment-sakura-vps.md
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
  check-sakura-vps-files.sh
  prepare-standalone.mjs
  smoke-standalone.mjs
  smoke-test.mjs
tests/
  health.test.ts
  scoring.test.ts
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
npm run lint
npm run test
npm run build
npm run smoke:standalone
```

`npm run build` はNext.jsのstandalone成果物を生成し、`public` と `.next/static` を実行ディレクトリへ配置します。

`main` 向けPull Requestと `main` へのpushでは、GitHub ActionsがさくらのVPS設定検証・Lint・Test・Build・standalone起動スモークテストを順番に実行します。いずれかが失敗した場合、CIは失敗として終了します。

## レンタルサーバーへの公開

初回公開先は **さくらのVPS 2GB・東京リージョン・Ubuntu 24.04** を推奨構成としています。

選定理由:

- Node.js常駐プロセス、Nginx、PM2を利用できる
- 2GB・3vCPU・SSD 100GBで、サーバー上のNext.jsビルドに必要な余裕がある
- Ubuntu 24.04の標準OSとSSH公開鍵を利用できる
- 将来必要になった場合にスケールアップできる

共有レンタルサーバーでNode.jsの常駐実行またはリバースプロキシが利用できない場合、この構成のままでは公開できません。

初期構築・契約設定・UFW・Fail2ban・Node.js・PM2・Nginx・DNS・SSL・更新・切り戻しは [さくらのVPS向けデプロイ手順](docs/deployment-sakura-vps.md) を参照してください。

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
