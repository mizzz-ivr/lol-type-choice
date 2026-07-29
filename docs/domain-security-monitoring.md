# 本番ドメイン・TLS証明書監視

## 目的

本番ドメインのDNS解決結果とTLS証明書を日次で確認し、次の問題を公開停止前に検知します。

- DNSレコードが解決できない
- DNSがlocalhost、プライベートIP、リンクローカル、予約済みIPへ変更された
- TLS接続に失敗する
- 証明書を信頼できない
- 証明書のホスト名が公開ドメインと一致しない
- 証明書がまだ有効ではない、期限切れ、または期限切れが近い

この監視は問題を検知してIssueへ記録します。DNSレコードや証明書は自動更新しません。

## 監視Workflow

```text
.github/workflows/domain-security-monitoring.yml
```

以下の場合に実行します。

- 毎日1回のschedule
- GitHub Actions画面からの手動実行

監視先はRepository Variable `PRODUCTION_SITE_URL`だけです。Workflow入力から任意URLは受け付けません。

`PRODUCTION_SITE_URL`が未設定の場合は、Issueを作成せず安全にスキップします。

## 判定しきい値

| 証明書の残日数 | 判定 | 動作 |
|---|---|---|
| 31日以上 | 正常 | Workflow成功。既存Issueがあればクローズ |
| 15〜30日 | 警告 | Issue作成または追記。Workflow失敗 |
| 14日以下 | 重大 | Issue作成または追記。Workflow失敗 |
| 期限切れ・未有効 | 重大 | Issue作成または追記。Workflow失敗 |

警告は更新作業を開始するための予告です。重大は証明書更新を優先して対応する状態です。

## DNS検証

Node.jsの名前解決でA・AAAA相当の接続先を取得し、1件以上あることを確認します。

解決結果に次のアドレスが1件でも含まれる場合は重大判定にします。

- unspecified
- localhost・ループバック
- RFC1918プライベートIPv4
- CGNAT
- リンクローカル
- テスト・文書用アドレス
- ベンチマーク用アドレス
- multicast・予約済みアドレス
- IPv4-mapped IPv6
- IPv6 unique local・link local・documentation・multicast

DNS解決後、すべてのIPを検証します。TLS接続ではDNSを再解決せず、検証済みIPへ直接接続します。

IPv4とIPv6の両方がある場合は、GitHub-hosted runnerのIPv6到達性による誤検知を避けるため、TLS証明書確認にはIPv4を優先します。DNSのIPv6アドレス自体は公開アドレスか検証します。

## TLS検証

検証済みIPへ次の条件で接続します。

- `host`: 検証済みIP
- `servername`: `PRODUCTION_SITE_URL`のホスト名
- `rejectUnauthorized: true`
- `minVersion: TLSv1.2`

これにより、接続先IPを固定しながらSNI、証明書チェーン、証明書ホスト名の検証を維持します。

以下は禁止です。

- `NODE_TLS_REJECT_UNAUTHORIZED=0`
- `rejectUnauthorized: false`
- 実行時の証明書検証無効化
- DNS検証前の接続

## 監視レポート

以下をArtifactとして14日間保存します。

```text
domain-security-report.json
domain-security-report.md
```

レポートには次を記録します。

- 判定
- 確認日時
- 公開オリジン
- ホスト名
- DNS解決結果
- TLS接続先
- TLSプロトコル
- 暗号スイート
- 証明書CN
- 発行者
- 有効期限
- 残日数
- SAN

秘密鍵、証明書の生DER・PEM、HTTPレスポンス本文、環境変数の値は保存しません。

## 障害Issue

固定タイトルを使用します。

```text
[監視] 本番ドメインまたはTLS証明書に問題を検知
```

警告または重大判定時は、同じタイトルの開いているIssueへ結果を追記します。該当Issueがなければ新規作成します。

正常化した場合は、監視結果を追記して同Issueをクローズします。

## 対応手順

### DNS異常

1. `PRODUCTION_SITE_URL`のホスト名を確認
2. DNS管理画面でA・AAAA・CNAMEを確認
3. 意図しないプライベートIPや旧サーバーIPを削除
4. TTLと伝播状況を確認
5. Workflowを手動再実行

### 証明書期限警告

1. VPSへSSH接続
2. Certbotタイマーを確認
3. 更新テストを実行
4. Nginxが参照する証明書パスを確認
5. 必要に応じて証明書を更新してNginxをreload
6. Workflowを手動再実行

```bash
systemctl status certbot.timer
sudo certbot renew --dry-run
sudo nginx -t
sudo systemctl reload nginx
```

### TLS信頼・ホスト名異常

1. `PRODUCTION_SITE_URL`と証明書SANを確認
2. Nginxの`server_name`を確認
3. Nginxが別ドメインの証明書を参照していないか確認
4. 中間証明書を含む`fullchain.pem`を参照しているか確認
5. 修正後にNginx設定テストとreloadを実行

## Release Readinessとの関係

`Release Readiness`の`post_deploy`では、HTTPスモークテストに加えて同じDNS・TLS検証を実行します。

- 正常: 公開後判定を継続
- 警告: 判定サマリーへ記録するが、直ちに公開失敗とはしない
- 重大: `post_deploy`を失敗させ、公開完了扱いにしない

警告は日次監視でIssue化されるため、リリース作業とは分離して証明書更新を追跡します。

## 権限と責務

Workflowの権限は以下だけです。

- `contents: read`
- `issues: write`

次は行いません。

- GitHub Secretの参照
- SSH・SCP
- VPS操作
- DNS変更
- Certbot実行
- 証明書更新
- Nginx reload
- 本番デプロイ

## 制約

- GitHub Actionsのscheduleは実行時刻を保証しません
- GitHub-hosted runnerから見えるDNS・ネットワークを基準にします
- TLS接続はIPv4を優先するため、IPv6経路固有のTLS障害は検知対象外です
- 複数拠点監視ではありません
- 外部DNSプロバイダーの管理画面状態は確認しません
- Certbotの更新ジョブ自体は実行しません
