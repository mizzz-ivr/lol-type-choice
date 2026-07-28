# リリース可否判定

## 目的

本番公開の直前と公開直後に、コード品質、本番設定、SSH鍵、known_hosts、監視障害、公開URLを横断して確認し、リリース可否を`GO`または`NO-GO`で判定します。

判定Workflowは確認専用です。本番デプロイは実行しません。

## Workflow

```text
.github/workflows/release-readiness.yml
```

GitHub Actions画面から手動実行します。pushやscheduleでは起動しません。

## 判定モード

### pre_deploy

本番デプロイ前に使用します。

確認内容:

- 対象SHAが40桁の小文字16進数である
- 対象SHAが`main`に含まれる
- Lint・Test・Buildが成功する
- standaloneスモークテストが成功する
- `production` EnvironmentのVariableが設定済み
- デプロイ専用SSH秘密鍵が登録済みで読み取れる
- known_hostsに接続先ホスト鍵が登録されている
- 未解決の本番外形監視Issueがない

`pre_deploy`は本番サイトへ接続しません。コードと設定が公開操作へ進める状態かを判定します。

### post_deploy

本番デプロイ後に使用します。

`pre_deploy`の全確認に加えて、`PRODUCTION_SITE_URL`へ既存の本番スモークテストを実行します。

確認対象:

- `/`
- `/diagnosis`
- `/api/health`
- `/robots.txt`
- `/sitemap.xml`
- HTTPセキュリティヘッダー
- `X-Powered-By`が非公開であること

## 実行方法

GitHubで以下を開きます。

```text
Actions
  → Release Readiness
  → Run workflow
```

入力値:

| 項目 | 内容 |
|---|---|
| Use workflow from | `main` |
| `commit_sha` | 判定対象の40桁コミットSHA |
| `mode` | `pre_deploy`または`post_deploy` |
| `confirmation` | `CHECK` |

対象SHAは、GitHub Actionsの通常CIが成功した`main`上のコミットを指定します。

## 必要なRepository Variable

| 名前 | 内容 |
|---|---|
| `PRODUCTION_SITE_URL` | `https://`で始まる本番オリジン |

パス、クエリ、ハッシュ、認証情報は含めません。

## 必要なproduction Environment Variable

| 名前 | 推奨値 |
|---|---|
| `PRODUCTION_HOST` | VPSのIPv4アドレスまたはホスト名 |
| `PRODUCTION_USER` | `ubuntu` |
| `PRODUCTION_SSH_PORT` | `22` |
| `PRODUCTION_APP_ROOT` | `/var/www/lol-type-choice` |

## 必要なproduction Environment Secret

| 名前 | 内容 |
|---|---|
| `PRODUCTION_SSH_PRIVATE_KEY` | デプロイ専用SSH秘密鍵 |
| `PRODUCTION_SSH_KNOWN_HOSTS` | 事前確認済みの接続先ホスト鍵 |

WorkflowはSecretの値をMarkdown、JSON、ログへ出力しません。

秘密鍵は一時ファイルへ書き込み、`ssh-keygen -y`で読み取り可能かだけを確認します。known_hostsは`ssh-keygen -F`で接続先の登録有無だけを確認します。確認後の一時ファイルは削除します。

## 監視障害Issue

次の固定タイトルのIssueが開いている場合は`NO-GO`です。

```text
[監視] 本番サイトの外形監視で異常を検知
```

監視異常を解消し、Production Monitoringが復旧確認してIssueをクローズしてから再判定します。

## 判定結果

### GO

すべての必須条件を満たしています。

- `pre_deploy`: 本番手動デプロイへ進める
- `post_deploy`: 公開完了確認へ進める

GOはデプロイ成功そのものを保証するものではありません。実際の公開操作は`本番手動デプロイ`Workflowで別途実行します。

### NO-GO

1つ以上の必須条件を満たしていません。

GitHub Actions Summaryの`FAIL`項目を解消してから再実行します。NO-GOのまま本番公開または公開完了扱いにしません。

## レポート

Workflowは以下を7日間のArtifactとして保存します。

```text
release-readiness-report.json
release-readiness-report.md
```

JSONには以下を含みます。

- 判定日時
- 判定モード
- 対象SHA
- `GO`または`NO-GO`
- 各確認項目の結果と説明

SSH秘密鍵、known_hostsの内容、環境変数の実値は含めません。

## 権限と分離

Workflowの権限は以下だけです。

```yaml
permissions:
  contents: read
  issues: read
```

以下は実行しません。

- SSH接続
- SCP転送
- VPS上のコマンド
- PM2再起動
- DNS変更
- SSL変更
- 本番デプロイ
- Issue作成・更新・クローズ

品質確認ジョブは`production` Environment Secretを参照しません。本番設定確認ジョブだけがEnvironment到達後にSecretの形式を確認します。

## 推奨する公開手順

1. `main`のCI成功を確認
2. Release Readinessを`pre_deploy`で実行
3. `GO`を確認
4. 本番手動デプロイを実行
5. Release Readinessを`post_deploy`で実行
6. `GO`を確認
7. Production Monitoringの定期実行を確認

## トラブルシューティング

### SSH秘密鍵の形式がNO-GO

- Secretへ秘密鍵全文が登録されているか確認
- `BEGIN OPENSSH PRIVATE KEY`から`END OPENSSH PRIVATE KEY`まで含める
- 公開鍵ではなく秘密鍵を登録する
- 改行が失われていないか確認

### known_hostsがNO-GO

- `PRODUCTION_HOST`とknown_hostsのホスト表記を一致させる
- 22番以外の場合は`[host]:port`形式を使用する
- 既に信頼している接続経路でホスト鍵を確認する
- Workflow内で`ssh-keyscan`して自動信頼しない

### 未解決の監視障害がNO-GO

固定タイトルのIssueとProduction Monitoringの直近実行を確認し、VPS、Nginx、PM2、DNS、SSL、直近デプロイを順に調査します。

### post_deployスモークがNO-GO

```bash
SMOKE_BASE_URL=https://<公開ドメイン> npm run smoke
```

をローカルでも実行し、失敗したエンドポイントまたはヘッダーを確認します。
