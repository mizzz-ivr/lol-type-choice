# SNS共有プレビュー運用

## 目的

SNSやチャットへURLを共有した際に、診断内容が一目で伝わるOGP・Xカード画像を表示します。

## 実装

Next.js App Routerのメタデータファイル規約を利用しています。

- `app/opengraph-image.tsx`: Open Graph向け画像
- `app/twitter-image.tsx`: Xカード向け画像
- `components/SocialPreviewImage.tsx`: 共通レイアウト
- `config/socialPreview.ts`: サイズ・文言・配色・alt

画像は`ImageResponse`でコード生成されます。ファイルベースメタデータとして自動的に`og:image`、`twitter:image`、alt、画像サイズがHTMLへ追加されます。

## 画像仕様

- 形式: PNG
- サイズ: 1200×630
- Xカード: `summary_large_image`
- 配色: 既存Tailwind設定のbase、card、accent、text、mutedに合わせる
- 表示内容: サービス名、48問、8軸、8タイプ、非公式ファン診断

## 権利・外部依存

画像生成では次を使用しません。

- Riot Games公式ロゴ
- チャンピオン画像
- Data Dragon等の公式アセット
- 外部画像URL
- 外部フォントURL
- 外部API

CSS相当の図形、文字、既存サービス配色だけで構成します。

## 確認方法

```bash
bash scripts/check-social-preview-files.sh
npm run test
npm run build
npm run smoke:standalone
```

standaloneスモークではトップページからメタタグを読み取り、OGP画像とXカード画像について次を検証します。

- メタタグが存在する
- `twitter:card`が`summary_large_image`
- 画像URLがHTTPまたはHTTPS
- 画像がHTTP 200
- Content-Typeが`image/png`
- PNGシグネチャが正しい
- 画像サイズが1200×630
- 共通セキュリティヘッダーが維持される

本番公開後は次を実行します。

```bash
SMOKE_BASE_URL=https://<公開ドメイン> npm run smoke
```

SNS側にはキャッシュがあるため、画像や文言変更が即時反映されない場合があります。アプリ側では本番HTMLのメタタグと画像URLを先に確認してください。

## 対象外

- 診断結果タイプごとの動的OGP
- SNS APIへの自動投稿
- SNSキャッシュの自動削除
- 共有ボタン文言の変更
