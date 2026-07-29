# VPS運用監査

## 目的

外部HTTP監視とDNS・TLS監視だけでは確認できないVPS内部の状態を、専用の制限付きSSH鍵で日次監査します。

監査対象:

- Nginxサービス
- PM2の`lol-type-choice`プロセス
- `127.0.0.1:3000/api/health`
- `current/RELEASE_SHA`
- `/var/www/lol-type-choice`を含むファイルシステムの使用率
- Certbot関連systemd timer

監査は状態確認だけを行い、自動復旧しません。

## 構成

```text
GitHub Actions
  └─ production-observability Environment
       ├─ 監査専用SSH秘密鍵
       └─ known_hosts
             ↓ 固定文字列 observe
VPS authorized_keys
  └─ restrict + forced command
       └─ /usr/local/bin/lol-type-choice-observer
            └─ 固定コマンドで状態取得
                 └─ JSONレポート
```

GitHub Actionsから送る元コマンドは`observe`だけです。`authorized_keys`のforced commandにより元コマンドは無視され、監査スクリプトだけが実行されます。

`restrict`により、PTY、TCP転送、agent forwarding、X11転送などを禁止します。

## 判定基準

| 項目 | 正常 | 警告 | 重大 |
|---|---|---|---|
| Nginx | `active` | - | inactive・取得失敗 |
| PM2 | `lol-type-choice`が`online` | - | 停止・未登録・取得失敗 |
| ローカルhealth | `status: ok` | - | HTTP・内容・JSON異常 |
| リリース | 40桁SHA | - | 未配置・形式不正 |
| ディスク | 79%以下 | 80〜89% | 90%以上・取得失敗 |
| Certbot timer | 1件以上が`active` | - | 未検出・inactive・取得失敗 |

1件でも重大があれば全体を`critical`、重大がなく警告があれば`warning`、すべて正常なら`healthy`とします。

警告と重大はどちらもGitHub Issueへ記録し、Workflowを失敗として終了します。

## 1. 監査専用SSH鍵を作成

開発端末で、デプロイ鍵や個人鍵とは別に作成します。

```bash
ssh-keygen \
  -t ed25519 \
  -f ./lol-type-choice-vps-observer \
  -C github-actions-lol-type-choice-observer \
  -N ''
```

生成物:

- 秘密鍵: `lol-type-choice-vps-observer`
- 公開鍵: `lol-type-choice-vps-observer.pub`

## 2. 公開鍵をVPSへ転送

信頼済みの管理用SSH接続を使用します。

```bash
scp ./lol-type-choice-vps-observer.pub \
  ubuntu@<VPSのIPv4アドレス>:/home/ubuntu/lol-type-choice-vps-observer.pub
```

公開鍵だけを転送します。秘密鍵はVPSへ置きません。

## 3. 監査スクリプトをインストール

VPSのリポジトリを最新のマージ済みコミットへ更新してから実行します。

```bash
cd /var/www/lol-type-choice/current
sudo bash scripts/install-vps-observer.sh \
  /home/ubuntu/lol-type-choice-vps-observer.pub
```

Git作業ツリーを本番に置かないリリース構成では、一時的にリポジトリを取得してスクリプトを実行してください。

インストール内容:

```text
/usr/local/lib/lol-type-choice/vps-observer.mjs
/usr/local/bin/lol-type-choice-observer
/home/ubuntu/.ssh/authorized_keys
```

`authorized_keys`には次の形式で登録されます。

```text
restrict,command="/usr/local/bin/lol-type-choice-observer" ssh-ed25519 <公開鍵> github-actions-lol-type-choice-observer
```

既に同じ公開鍵が登録されている場合は、同じ鍵を一度除去して制限付きエントリとして入れ直します。

インストーラーは`sshd_config`を変更しません。

## 4. forced commandを確認

専用秘密鍵で接続します。

```bash
ssh \
  -T \
  -i ./lol-type-choice-vps-observer \
  ubuntu@<VPSのIPv4アドレス> \
  observe
```

標準出力にJSONレポートが返ることを確認します。

任意コマンドが実行されないことも確認します。

```bash
ssh \
  -T \
  -i ./lol-type-choice-vps-observer \
  ubuntu@<VPSのIPv4アドレス> \
  'uname -a'
```

`uname`の結果ではなく、同じ監査JSONが返ればforced commandが機能しています。

## 5. known_hostsを確認

既に信頼している管理端末の`known_hosts`から取得します。

SSHポートが22の場合:

```bash
ssh-keygen -F <VPSのIPv4アドレス> -f ~/.ssh/known_hosts
```

22以外の場合:

```bash
ssh-keygen -F '[<VPSのIPv4アドレス>]:<SSHポート>' -f ~/.ssh/known_hosts
```

Workflow内で`ssh-keyscan`して、その場で取得した鍵を自動信頼しません。

## 6. production-observability Environmentを作成

GitHubで以下を開きます。

```text
Settings
  → Environments
  → New environment
  → production-observability
```

このEnvironmentは監査専用です。`production`デプロイEnvironmentのSSH鍵を流用しません。

### Environment Variables

| 名前 | 値の例 |
|---|---|
| `OBSERVABILITY_HOST` | VPSのIPv4アドレスまたはホスト名 |
| `OBSERVABILITY_USER` | `ubuntu` |
| `OBSERVABILITY_SSH_PORT` | `22` |

### Environment Secrets

| 名前 | 内容 |
|---|---|
| `OBSERVABILITY_SSH_PRIVATE_KEY` | 監査専用秘密鍵の全文 |
| `OBSERVABILITY_SSH_KNOWN_HOSTS` | 事前確認済みknown_hosts行 |

定期実行に利用するため、Environment保護ルールを設定する場合は、schedule実行が継続的に承認待ちにならない運用を選択してください。

## 7. Workflowを実行

```text
Actions
  → VPS Operations Monitoring
  → Run workflow
```

初回手動実行で以下を確認します。

- SSH鍵形式が正常
- known_hostsが接続先と一致
- forced commandからJSONを取得
- 6項目がすべて表示される
- Artifactが保存される
- 正常時に不要なIssueを作成しない

## 8. 定期実行

`.github/workflows/vps-operations-monitoring.yml`は日次で実行します。

接続先Variableが未設定の場合は安全にスキップします。Variable設定後にSecret不足や接続失敗がある場合は重大異常として扱います。

## 9. 障害Issue

警告または重大時は、次の固定タイトルでIssueを作成または更新します。

```text
[監視] VPS運用監査で異常を検知
```

正常化した場合、同じIssueへ復旧レポートを追記してクローズします。

Issueには以下を記録しません。

- SSH秘密鍵
- known_hostsの内容
- 環境変数
- プロセス引数
- ホスト名
- SSHエラーの生ログ

## 10. Certbot timerについて

Certbotは通常、`certbot renew`を定期実行するscheduled taskを利用します。Linuxではsystemd timerまたはcronが利用されます。

本プロジェクトのさくらのVPS手順はsnap版Certbotを前提とするため、監査では名前に`certbot`を含むsystemd timerが1件以上存在し、少なくとも1件が`active`であることを要求します。

監査は`certbot renew`や`certbot renew --dry-run`を実行しません。証明書の実際の期限・信頼・ホスト名は`Domain Security Monitoring`で別途確認します。

## 11. 鍵ローテーション

1. 新しい監査専用鍵を作成
2. 新公開鍵でインストーラーを実行
3. GitHub Environment Secretを新秘密鍵へ更新
4. Workflowを手動実行
5. 旧鍵のコメントまたは鍵データを確認して`authorized_keys`から削除
6. 旧秘密鍵を安全に破棄

## 12. アンインストール

管理用SSH接続から実施します。

1. `/home/ubuntu/.ssh/authorized_keys`から`github-actions-lol-type-choice-observer`の行だけを削除
2. 次の2ファイルを削除

```bash
sudo rm -f \
  /usr/local/bin/lol-type-choice-observer \
  /usr/local/lib/lol-type-choice/vps-observer.mjs
```

ディレクトリ全体を破壊的に削除しません。

## 制約

- VPSが完全停止している場合はSSH監査も失敗します
- GitHub-hosted runnerからSSH接続できる必要があります
- Certbotがcron方式の場合は現在のtimer必須判定に適合しません
- PM2は`ubuntu`ユーザーのHOMEで管理されている前提です
- 監査は状態を変更せず、自動復旧しません

## 参考

- [Certbot User Guide - Automated Renewals](https://eff-certbot.readthedocs.io/en/stable/using.html#automated-renewals)
- [OpenSSH sshd manual - authorized_keys command and restrict](https://man.openbsd.org/sshd.8)
