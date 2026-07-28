# HTTPセキュリティヘッダー運用

## 目的

公開レスポンスへ共通のセキュリティヘッダーを付与し、クリックジャッキング、MIME推測、不要なブラウザ機能利用、参照元情報の過剰送信を抑止します。

ヘッダーはNginxではなくNext.jsの`next.config.ts`で一元管理します。standaloneサーバーへ直接アクセスした場合と、Nginx経由でアクセスした場合の差を減らすためです。

## 現在の設定

定義は`config/securityHeaders.ts`にあります。

| ヘッダー | 値 | 目的 |
|---|---|---|
| `Content-Security-Policy` | `base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'` | base要素、iframe埋め込み、フォーム送信先、object埋め込みを制限 |
| `X-Frame-Options` | `DENY` | 旧ブラウザを含めiframe埋め込みを拒否 |
| `X-Content-Type-Options` | `nosniff` | Content-Typeの推測を抑止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 外部遷移時に送信する参照元情報を制限 |
| `Permissions-Policy` | カメラ・マイク・位置情報・決済・USB・Topics APIを無効化 | 使用しないブラウザ機能を拒否 |
| `Strict-Transport-Security` | `max-age=31536000` | HTTPS接続後、1年間HTTPSのみを利用 |
| `X-Permitted-Cross-Domain-Policies` | `none` | Adobe系クロスドメインポリシーを拒否 |

`poweredByHeader: false`により、`X-Powered-By`も出力しません。

## CSPを最小構成にしている理由

現時点では`script-src`、`style-src`、`default-src`を設定していません。

Next.js App Routerはhydrationやルーティングのためにスクリプトを出力します。nonceまたはhashを設計せずに厳格な`script-src`を追加すると、画面表示や操作を壊す可能性があります。

また、単純に`'unsafe-inline'`を追加すると、厳格に見えるだけでXSS耐性が十分に上がらない構成になり得ます。そのため今回は、既存機能へ影響しにくい以下だけを先行導入しています。

- `base-uri`
- `frame-ancestors`
- `form-action`
- `object-src`

将来、外部スクリプトやGoogle Analyticsを正式導入する場合は、利用ドメインを確認したうえでnonceベースCSPを別PRで設計します。

## HSTSの制約

現在は以下を意図的に付けていません。

- `includeSubDomains`
- `preload`

未確認のサブドメインまでHTTPSを強制すると、別用途のサブドメインが停止する可能性があります。全サブドメインのHTTPS化と証明書更新運用を確認するまでは追加しません。

HSTSはHTTPS応答で受信した場合に有効になります。初回公開前に、DNS、証明書、自動更新、HTTPからHTTPSへのリダイレクトを確認してください。

## 検証方法

ローカルでは以下を実行します。

```bash
npm run test
npm run build
npm run smoke:standalone
```

`smoke:standalone`は主要ページとAPIについて、以下を確認します。

- HTTP 200
- 期待する本文
- セキュリティヘッダーの値
- `X-Powered-By`が存在しないこと

本番公開後は以下を実行します。

```bash
SMOKE_BASE_URL=https://<公開ドメイン> npm run smoke
```

## 変更時のルール

- セキュリティヘッダーは`config/securityHeaders.ts`だけで変更する
- Nginxへ同じヘッダーを重複定義しない
- ヘッダー削除や緩和には理由をPR本文へ記載する
- CSPへ`script-src`または`style-src`を追加する場合は、診断開始、回答、結果表示、共有、計測をブラウザで確認する
- HSTSへ`includeSubDomains`または`preload`を追加する場合は、全サブドメインの棚卸しを先に行う
- CORSを一律で許可しない

## 参考

- [Next.js headers設定](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
