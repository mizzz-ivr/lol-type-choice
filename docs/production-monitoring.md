# 本番サイトの外形監視

## 目的

GitHub Actionsから本番サイトの主要エンドポイントを定期確認し、異常をGitHub Issueへ集約します。

この監視は初期公開時の簡易監視です。厳密なSLA監視、複数リージョン監視、電話・SMS通知を提供するものではありません。

## 監視対象

Repository Variable `PRODUCTION_SITE_URL`を基準に、以下を確認します。

| 対象 | パス | 確認内容 |
|---|---|---|
| トップページ | `/` | HTTP 200とサイト識別文字列 |
| ヘルスチェック | `/api/health` | HTTP 200と`{"status":"ok"}` |
| robots.txt | `/robots.txt` | HTTP 200と`User-Agent` |
| sitemap.xml | `/sitemap.xml` | HTTP 200と`urlset` |

各対象は最大3回確認し、1回あたり8秒でタイムアウトします。

## 実行間隔

`.github/workflows/production-monitoring.yml`は以下の時刻に実行します。

```cron
7,22,37,52 * * * *
```

15分間隔ですが、GitHub Actionsのscheduleは正確な時刻を保証しません。混雑時は遅延または実行されない可能性があります。毎時0分を避けて、7分・22分・37分・52分に設定しています。

公開リポジトリでは、リポジトリ活動が60日間ない場合にscheduled workflowが無効化されることがあります。Actions画面で定期実行履歴を確認してください。

参考:

- [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Docs: Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## 1. Repository Variableを設定

GitHubリポジトリで以下を開きます。

```text
Settings
  → Secrets and variables
  → Actions
  → Variables
```

以下を追加します。

| 名前 | 値の例 |
|---|---|
| `PRODUCTION_SITE_URL` | `https://lol.example.com` |

制約:

- HTTPS必須
- URLのユーザー名・パスワードは禁止
- パス・クエリ・ハッシュは禁止
- `localhost`は禁止
- ループバック・プライベートIPの直接指定は禁止

値が未設定の場合、監視WorkflowはIssueを作らず正常終了します。VPS契約前やDNS設定前でもmainへマージできます。

## 2. 手動実行

GitHubで以下を開きます。

```text
Actions
  → Production Monitoring
  → Run workflow
```

初回公開後は、定期実行を待たず手動実行して設定を確認します。

## 3. 正常時の動作

全対象が正常な場合:

- Workflow Summaryへ結果を出力
- 新しいIssueは作成しない
- 未解決の監視障害Issueがある場合、復旧結果をコメント
- 対象Issueを`completed`としてクローズ

## 4. 異常時の動作

以下を異常として扱います。

- HTTP 400以上
- タイムアウト
- 接続失敗
- リダイレクト後の異常
- 期待するJSON・文字列・XML要素がない
- `PRODUCTION_SITE_URL`の形式が不正

異常時は、次の固定タイトルでIssueを検索します。

```text
[監視] 本番サイトの外形監視で異常を検知
```

未解決Issueがない場合は新規作成し、既にある場合は同Issueへ監視結果を追記します。異常が継続しても同名Issueを重複作成しません。

Issueへ記録する内容:

- 確認日時
- 監視先オリジン
- 対象パス
- HTTPステータス
- 応答時間
- 試行回数
- サニタイズ済みエラー
- GitHub Actions実行URL

レスポンス本文全文、Cookie、認証情報、SSH情報、Secretは記録しません。

## 5. 障害対応手順

Issueが作成された場合は次の順で確認します。

1. GitHub Actionsの監視結果
2. DNS解決
3. SSL証明書期限とHTTPS応答
4. Nginx状態とエラーログ
5. PM2状態とアプリログ
6. `current`が指すリリースSHA
7. VPSのメモリ・ディスク
8. 直近デプロイ履歴

VPS上の確認例:

```bash
pm2 status
pm2 logs lol-type-choice --lines 100
curl --fail http://127.0.0.1:3000/api/health
curl --fail https://<公開ドメイン>/api/health
readlink -f /var/www/lol-type-choice/current
cat /var/www/lol-type-choice/current/RELEASE_SHA
sudo nginx -t
sudo systemctl status nginx
free -h
df -h
```

監視Workflowは異常を検知するだけで、PM2再起動、VPS再起動、再デプロイを自動実行しません。誤検知や障害の拡大を防ぐため、復旧操作は運用担当が原因を確認して実行します。

## 6. 権限

監視WorkflowのGitHub Token権限は以下だけです。

```yaml
permissions:
  contents: read
  issues: write
```

以下にはアクセスしません。

- GitHub Actions Secret
- `production` Environment Secret
- VPS用SSH秘密鍵
- デプロイWorkflow
- サーバー再起動操作

## 7. ローカル確認

静的検査:

```bash
bash scripts/check-production-monitoring-files.sh
```

統合テスト:

```bash
node scripts/test-production-health-check.mjs
```

実際の公開URLを手元から確認:

```bash
PRODUCTION_SITE_URL=https://<公開ドメイン> \
HEALTH_REPORT_PATH=production-health-report.json \
node scripts/production-health-check.mjs
```

`production-health-report.json`には監視結果だけを保存し、レスポンス本文は保存しません。

## 8. 外部監視サービスへの移行基準

以下のいずれかが必要になった場合、GitHub Actionsだけの監視から外部監視サービスへ移行します。

- 5分未満の検知間隔
- 実行時刻の保証
- 複数地域からの確認
- SMS・電話・Slack通知
- SSL期限の専用通知
- 応答時間の長期グラフ
- SLA・稼働率レポート
- GitHubの障害中にも独立して監視

外部サービスへ移行した後も、このWorkflowは手動スモークテスト用途として残すか、重複通知を避けるためscheduleだけを削除します。

## 未対応事項

- 実本番URLでの監視
- 外部監視サービス
- Slack・メール・SMS通知
- SSL証明書の期限日監視
- VPS内部のCPU・メモリ・ディスクメトリクス
- アプリケーション例外追跡
