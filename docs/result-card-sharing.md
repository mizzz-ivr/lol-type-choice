# 診断結果カード画像・共有

## 目的

診断結果をSNS・チャットで共有した際に、結果タイプ・上位3軸・おすすめロールが画像で伝わるようにします。

同じ画像を次の用途で利用します。

- 結果ページのOpen Graph画像
- Xの大画像カード
- ユーザーによるPNG保存
- Web Share API対応端末での共有

## 画像生成API

```text
GET /api/result-card?r=<回答トークン>
```

`ImageResponse`を利用し、1200×630のPNGをリクエスト時に生成します。

表示内容:

- LoL Playstyle Type Finder β
- 診断結果タイプ名
- 一言説明
- 上位3軸とスコア
- おすすめロール上位2件
- 48問・8軸の診断であること
- 非公式ファン診断であること

## 入力検証

画像APIは以下をすべて満たす場合だけ画像を生成します。

- クエリキーが`r`だけ
- `r`が1件だけ
- 回答トークンのバージョンが有効
- 回答数が現在の設問数と一致
- 各回答が-2〜2
- チェックサムが一致
- 回答Mapの既存バリデーションに成功

以下はHTTP 400とします。

- `r`欠落
- 不正トークン
- `r`が複数
- `theme`などの追加クエリ

不正レスポンスはJSON・`Cache-Control: no-store`で返します。

## 画像応答

正常時:

```text
Content-Type: image/png
Content-Disposition: inline; filename="lol-playstyle-<type-id>.png"
Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
X-Content-Type-Options: nosniff
```

- ブラウザキャッシュ: 1時間
- 共有キャッシュ: 1日
- stale-while-revalidate: 7日

診断ロジックやカードレイアウトを変更した場合でも、古い結果URLが長期間固定表示され続けないよう、`immutable`は付与しません。

## 結果ページのメタデータ

有効な結果ページでは、`generateMetadata`から次を設定します。

- `og:image`
- `og:image:alt`
- `twitter:image`
- `twitter:image:alt`
- `twitter:card=summary_large_image`

画像URLには表示中の回答トークンを含めます。

結果ページは引き続き`noindex`・`nofollow`です。

## ユーザー操作

### 画像を保存

結果カードAPIからPNGを取得し、Blob URLを生成して次の形式で保存します。

```text
lol-playstyle-<type-id>.png
```

### ネイティブ共有

`navigator.share`が利用可能な端末だけ「共有する」を表示します。

`navigator.canShare({ files })`が利用可能な場合はPNGファイルも共有します。画像ファイル共有に対応しない場合は、診断結果テキストと結果URLだけを共有します。

ユーザーが共有ダイアログをキャンセルした場合はエラー表示しません。

### URLコピー

Clipboard APIを優先し、利用できない場合は一時的なtextareaを利用したコピーへフォールバックします。

### X共有

既存のX Intent URLを維持します。

## エラー時の挙動

- 画像取得失敗: 結果画面は維持し、保存・共有だけエラー表示
- Clipboard失敗: 権限確認を案内
- ネイティブ共有失敗: X共有・URLコピー・画像保存を案内
- 共有キャンセル: エラー扱いしない
- 画像API内部エラー: HTTP 500・JSON・`no-store`

## 権利・外部依存

カード画像では以下を使用しません。

- Riot Games公式ロゴ
- チャンピオン画像
- Data Dragon
- 外部画像URL
- 外部フォントURL
- 外部API

既存サービスの配色、CSS相当の図形、文字だけで構成します。

## Analyticsイベント

- `result_shared`（`native` / `x`）
- `result_link_copied`
- `result_card_downloaded`
- `result_share_failed`

画像URLや回答トークン、8軸スコアはAnalyticsへ送信しません。

## 確認方法

```bash
bash scripts/check-result-card-files.sh
npm run lint
npm run test
npm run build
npm run smoke:standalone
```

手動確認:

1. 診断を完了する
2. 結果ページのXカードが`summary_large_image`であることを確認する
3. `og:image`と`twitter:image`が`/api/result-card?r=...`を参照することを確認する
4. 「画像を保存」で1200×630のPNGが保存されることを確認する
5. 対応端末で「共有する」が表示されることを確認する
6. ファイル共有対応端末では画像付き共有になることを確認する
7. 非対応端末ではテキストとURLだけ共有されることを確認する
8. URLコピー・X共有を確認する
9. 共有ダイアログをキャンセルしてもエラーにならないことを確認する
10. 不正トークン・複数`r`・追加クエリがHTTP 400になることを確認する

## 対象外

- 生成画像のサーバー永続保存
- カードデザインのユーザー編集
- チャンピオン画像入りカード
- SNSキャッシュの自動削除
- 外部画像生成サービス
