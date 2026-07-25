# さくらのVPS向けデプロイ手順

## 採用構成

初回公開先は以下を推奨します。

- サービス: さくらのVPS
- プラン: 2GB
- リージョン: 東京
- OS: Ubuntu 24.04 LTS
- アプリ待受: `127.0.0.1:3000`
- 外部公開: Nginx
- プロセス管理: PM2
- SSL: Certbot + Let's Encrypt

2GBプランは、サーバー上で依存関係の導入とNext.jsビルドを行う現在の運用に必要な余裕を確保するために選択します。1GBプランでもstandalone実行自体は可能ですが、ビルド時のメモリ不足や将来の更新作業を考慮して初回本番では採用しません。

このアプリはNode.jsの常駐プロセスとリバースプロキシを必要とするため、共有レンタルサーバーではなくVPSを使用します。

## 1. 契約時の設定

さくらの会員メニューからVPSを追加します。

- Linuxから選ぶ
- 2GBプラン
- 東京リージョン
- Ubuntu 24.04
- ストレージ変更オプションなし
- 毎月払いで開始

初回公開と安定稼働を確認した後、長期利用する場合のみ12か月払いへの変更を検討します。

OSインストール時にSSH公開鍵を登録してください。標準OSの初回ログインユーザーは `ubuntu` です。

## 2. DNS変更前の初期ログイン

```bash
ssh ubuntu@<VPSのIPv4アドレス>
```

ログイン後、OSとリソースを確認します。

```bash
cat /etc/os-release
uname -m
free -h
df -h
```

期待値:

- Ubuntu 24.04
- `x86_64`
- メモリ約2GB
- ルートディスク約100GB

## 3. 初期セットアップ

一時作業ディレクトリへリポジトリを取得し、スクリプトを確認してから実行します。

```bash
git clone https://github.com/mizzz-dev/lol-type-choice.git ~/lol-type-choice-setup
cd ~/lol-type-choice-setup
less scripts/bootstrap-sakura-vps.sh
sudo bash scripts/bootstrap-sakura-vps.sh
```

スクリプトは以下を行います。

- OSパッケージ更新
- Nginx、Git、UFW、Fail2ban、unattended-upgradesの導入
- NodeSource署名鍵とNode.js 22リポジトリの登録
- Node.js 22とPM2 7の導入
- UFWでOpenSSH、HTTP、HTTPSのみ許可
- Fail2banと自動セキュリティ更新の有効化
- `/var/www/lol-type-choice` と `/var/log/lol-type-choice` の作成

SSHポートや認証方式は自動変更しません。公開鍵ログイン確認前のロックアウトを防ぐためです。

## 4. SSH公開鍵ログインを再確認

現在の接続を維持したまま、別ターミナルから新規接続できることを確認します。

```bash
ssh ubuntu@<VPSのIPv4アドレス>
```

公開鍵ログインに成功するまでは、SSHパスワード認証を無効化しないでください。

## 5. アプリ配置

配置先が空であることを確認します。

```bash
sudo find /var/www/lol-type-choice -mindepth 1 -maxdepth 1 -print
```

何も表示されない場合だけcloneします。

```bash
sudo -u ubuntu git clone https://github.com/mizzz-dev/lol-type-choice.git /var/www/lol-type-choice
cd /var/www/lol-type-choice
```

既にGit作業ツリーが存在する場合は削除せず、状態を確認します。

```bash
cd /var/www/lol-type-choice
git status --short
git remote -v
git fetch origin
```

サーバー上で直接編集した未コミット差分がある場合、デプロイを中止して差分の扱いを決めてください。

## 6. 本番環境変数

```bash
cp .env.example .env.production
chmod 600 .env.production
```

`.env.production` を編集します。

```env
NEXT_PUBLIC_SITE_URL=https://<公開ドメイン>
HOSTNAME=127.0.0.1
PORT=3000
```

`NEXT_PUBLIC_SITE_URL` はビルド成果物にも使用されるため、ビルド前に設定してください。

## 7. ビルドと起動前確認

```bash
node --version
npm --version
npm ci --no-audit --no-fund
npm run lint
npm run test
npm run build
npm run smoke:standalone
```

期待値:

- Node.js 22.x
- npm 10.x
- lint・test・build・standaloneスモークテストが成功

## 8. PM2で常駐起動

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

`pm2 startup` が表示した `sudo env ...` コマンドを実行した後、再度保存します。

```bash
pm2 save
pm2 status
curl --fail http://127.0.0.1:3000/api/health
```

期待するレスポンス:

```json
{"status":"ok"}
```

## 9. Nginx設定

既存の同名設定がないことを確認してから配置します。

```bash
sudo test ! -e /etc/nginx/sites-available/lol-type-choice
sudo cp deploy/sakura-vps/nginx.conf.template /etc/nginx/sites-available/lol-type-choice
sudo sed -i 's/__DOMAIN__/<公開ドメイン>/g' /etc/nginx/sites-available/lol-type-choice
sudo ln -s /etc/nginx/sites-available/lol-type-choice /etc/nginx/sites-enabled/lol-type-choice
sudo nginx -t
sudo systemctl reload nginx
```

動作確認後にデフォルトサイトを無効化します。

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

DNS変更前はHostヘッダーを指定して確認できます。

```bash
curl --fail -H 'Host: <公開ドメイン>' http://<VPSのIPv4アドレス>/api/health
```

## 10. DNS設定

ドメイン管理側でAレコードを設定します。

```text
種別: A
名前: 利用するホスト名
値: VPSのIPv4アドレス
TTL: 300（切替作業中の目安）
```

DNS反映を確認します。

```bash
dig +short <公開ドメイン>
curl --fail http://<公開ドメイン>/api/health
```

VPSのIPv4アドレスが返るまでSSL証明書発行へ進まないでください。

## 11. SSL証明書

```bash
sudo apt remove -y certbot || true
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d <公開ドメイン>
```

自動更新テスト:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

## 12. 公開後確認

```bash
cd /var/www/lol-type-choice
SMOKE_BASE_URL=https://<公開ドメイン> npm run smoke
```

手動でも確認します。

- `/`
- `/diagnosis`
- `/api/health`
- `/robots.txt`
- `/sitemap.xml`
- 診断完了と結果表示
- 共有URLが本番ドメインになること
- HTTPからHTTPSへのリダイレクト

## 13. さくらのVPS側パケットフィルター

コントロールパネル側でも以下のみ許可します。

- SSH: 22/tcp
- HTTP: 80/tcp
- HTTPS: 443/tcp

3000/tcpは外部公開しません。OS側のUFWとVPS側パケットフィルターを併用する場合、両方に同じ許可ポートが必要です。

## 14. 更新デプロイ

GitHub Actionsが成功したコミットSHAへ固定します。未コミット差分がある場合は中止します。

```bash
cd /var/www/lol-type-choice
test -z "$(git status --porcelain)"
git fetch origin
git checkout <デプロイ対象コミットSHA>
npm ci --no-audit --no-fund
npm run lint
npm run test
npm run build
npm run smoke:standalone
pm2 reload deploy/ecosystem.config.cjs --update-env
SMOKE_BASE_URL=https://<公開ドメイン> npm run smoke
```

## 15. 切り戻し

```bash
cd /var/www/lol-type-choice
test -z "$(git status --porcelain)"
git checkout <直前の正常コミットSHA>
npm ci --no-audit --no-fund
npm run build
npm run smoke:standalone
pm2 reload deploy/ecosystem.config.cjs --update-env
SMOKE_BASE_URL=https://<公開ドメイン> npm run smoke
```

## 16. 運用確認

```bash
pm2 status
pm2 logs lol-type-choice --lines 100
sudo journalctl -u nginx --since '30 minutes ago'
sudo tail -n 100 /var/log/nginx/error.log
sudo ufw status verbose
sudo fail2ban-client status
free -h
df -h
```

## 17. バックアップ対象

現時点ではユーザーデータやDBを持たないため、必須バックアップ対象は限定的です。

- `.env.production`
- Nginx設定
- デプロイ中のコミットSHA
- 将来追加する永続データ

ソースコードはGitHubを正とし、サーバー上で直接編集しません。

## 18. 未対応事項

- 実際のVPS契約
- 実際のDNS変更
- 本番SSL証明書発行
- 外形監視サービス
- 自動デプロイ
- アプリケーションデータのバックアップ

## 参考資料

- [さくらのVPS 料金・仕様](https://vps.sakura.ad.jp/specification/)
- [さくらのVPS Ubuntu 24.04](https://manual.sakura.ad.jp/vps/os-packages/ubuntu-24.04.html)
- [さくらのVPS 新規追加](https://manual.sakura.ad.jp/vps/support/service/apply-cp-vps.html)
- [NodeSource Node.js 22 setup](https://github.com/nodesource/distributions/blob/master/scripts/deb/setup_22.x)
- [Certbot Nginx instructions](https://certbot.eff.org/instructions)
