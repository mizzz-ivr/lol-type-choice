# GitHub Actionsからの本番手動デプロイ

## 目的

GitHub Actionsで品質確認済みのコミットをビルドし、`production` Environmentの承認後に、さくらのVPSへリリース単位で配置します。

本Workflowはpush時に自動実行されません。GitHub Actions画面から40桁のコミットSHAと確認文字列 `DEPLOY` を入力した場合だけ実行します。

## 構成

```text
GitHub Actions build job
  ├─ main所属SHAの検証
  ├─ npm ci / lint / test / build
  ├─ standaloneスモークテスト
  ├─ tar.gz + SHA-256 + 本番SBOM作成
  ├─ SLSA provenance生成
  └─ CycloneDX SBOM Attestation生成

production Environment承認

GitHub Actions deploy job
  ├─ Environment SecretからSSH鍵を取得
  ├─ known_hostsを固定してSSH接続
  ├─ VPSのreleases/<SHA>へ配置
  ├─ currentシンボリックリンクを切替
  ├─ PM2再読込
  ├─ 内部・外部ヘルスチェック
  └─ 失敗時は直前リリースへ切り戻し
```

ビルドジョブは本番SSH Secretを参照しません。Secretを利用するのは`production` Environmentを参照するデプロイジョブだけです。

リリースArtifactの生成元証明に必要なOIDC・Attestation権限もビルドジョブだけへ付与し、デプロイジョブには付与しません。

## 1. 前提

- PR #16のさくらのVPS初期構築が完了している
- Node.js 22、npm 10、PM2 7、Nginxが導入されている
- Nginxが`127.0.0.1:3000`へ転送している
- 公開ドメインのDNSとSSLが設定済みである
- VPSのアプリ配置先をリリース方式へ移行できる

既存の`/var/www/lol-type-choice`がGit作業ツリーの場合、Workflowは安全のため停止します。リリース配置への移行前に実行しないでください。

## 2. VPSのディレクトリを準備

VPSへ`ubuntu`ユーザーで接続し、以下を実行します。

```bash
sudo mkdir -p \
  /var/www/lol-type-choice/releases \
  /var/www/lol-type-choice/shared \
  /var/log/lol-type-choice
sudo chown -R ubuntu:ubuntu \
  /var/www/lol-type-choice \
  /var/log/lol-type-choice
chmod 750 /var/www/lol-type-choice/shared
```

本番環境変数を共有ディレクトリへ配置します。

```bash
cat > /var/www/lol-type-choice/shared/.env.production <<'ENV'
NEXT_PUBLIC_SITE_URL=https://<公開ドメイン>
HOSTNAME=127.0.0.1
PORT=3000
ENV
chmod 600 /var/www/lol-type-choice/shared/.env.production
```

`NEXT_PUBLIC_SITE_URL`はGitHubのRepository Variableにも同じ値を設定します。

## 3. GitHub Actions専用SSH鍵を作成

開発端末で、デプロイ専用鍵を作成します。個人用SSH鍵を流用しません。

```bash
ssh-keygen \
  -t ed25519 \
  -f ./lol-type-choice-production-deploy \
  -C github-actions-lol-type-choice \
  -N ''
```

公開鍵をVPSへ追加します。

```bash
cat ./lol-type-choice-production-deploy.pub \
  | ssh ubuntu@<VPSのIPv4アドレス> \
    'umask 077; mkdir -p ~/.ssh; { printf "restrict "; cat; } >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys'
```

`restrict`により、ポート転送、X11転送、agent転送、PTYなどを禁止します。デプロイ用の通常コマンド実行は許可されます。

別ターミナルから専用鍵で接続できることを確認します。

```bash
ssh -i ./lol-type-choice-production-deploy ubuntu@<VPSのIPv4アドレス> 'whoami && pwd'
```

期待値は`ubuntu`です。

## 4. SSHホスト鍵を確認

初回SSH接続時に、さくらのVPSコンソールまたは既に信頼している接続経路でサーバーのホスト鍵フィンガープリントを確認します。

確認済みの`known_hosts`行を取得します。

```bash
ssh-keygen -F <VPSのIPv4アドレス> -f ~/.ssh/known_hosts
```

SSHポートを22以外に変更している場合:

```bash
ssh-keygen -F '[<VPSのIPv4アドレス>]:<SSHポート>' -f ~/.ssh/known_hosts
```

表示されたホスト鍵の行を`PRODUCTION_SSH_KNOWN_HOSTS`へ登録します。

Workflow内で`ssh-keyscan`を実行して、その場で取得した鍵を無条件に信頼する運用は禁止しています。

## 5. Repository Variableを設定

GitHubリポジトリの以下を開きます。

```text
Settings
  → Secrets and variables
  → Actions
  → Variables
```

Repository Variableとして以下を追加します。

| 名前 | 値の例 | 用途 |
|---|---|---|
| `PRODUCTION_SITE_URL` | `https://lol.example.com` | 本番ビルド、Environment URL、外部ヘルスチェック |

値はHTTPSのオリジンだけにし、末尾以外のパス・クエリ・ハッシュを含めません。

## 6. production Environmentを設定

GitHubリポジトリで以下を開きます。

```text
Settings
  → Environments
  → New environment
  → production
```

### Environment Variables

| 名前 | 推奨値 |
|---|---|
| `PRODUCTION_HOST` | VPSのIPv4アドレスまたはホスト名 |
| `PRODUCTION_USER` | `ubuntu` |
| `PRODUCTION_SSH_PORT` | `22` |
| `PRODUCTION_APP_ROOT` | `/var/www/lol-type-choice` |

### Environment Secrets

| 名前 | 内容 |
|---|---|
| `PRODUCTION_SSH_PRIVATE_KEY` | `lol-type-choice-production-deploy`秘密鍵の全文 |
| `PRODUCTION_SSH_KNOWN_HOSTS` | 独立確認済みのknown_hosts行 |

Environment Secretは、Workflowのデプロイジョブが`production` Environmentへ到達するまで利用されません。

### Protection Rules

複数人で管理する場合はRequired reviewersを設定します。

1人運用で承認者を別に用意できない場合は、以下を最低限維持します。

- Workflowをmainブランチからのみ実行
- 40桁のコミットSHAを明示
- `DEPLOY`の確認入力
- 対象SHAがmainに含まれることを検証
- push時の自動デプロイを禁止

EnvironmentのDeployment branchesは`main`のみに制限します。

## 7. Workflowを実行

デプロイ対象のコミットSHAを確認します。

```bash
git fetch origin
git rev-parse origin/main
```

GitHubで以下を開きます。

```text
Actions
  → 本番手動デプロイ
  → Run workflow
```

入力値:

- Use workflow from: `main`
- `commit_sha`: GitHub Actions成功済みの40桁SHA
- `confirmation`: `DEPLOY`

Environment承認を設定している場合、ビルド・Artifact Attestation生成完了後に承認操作を行います。

## 8. デプロイ後の配置

VPSには以下の構成で配置されます。

```text
/var/www/lol-type-choice/
  current -> releases/<現在のSHA>
  releases/
    <現在のSHA>/
    <直前のSHA>/
  shared/
    .env.production
```

各リリースの`.env.production`は`shared/.env.production`へのシンボリックリンクです。

最新5世代を基本として保持し、現在と直前のリリースは削除対象から除外します。

## 9. デプロイ時の検証

Workflowは以下を実行します。

- confirmationが`DEPLOY`であること
- コミットSHAが40桁の小文字16進数であること
- Workflowをmainから実行していること
- 対象SHAがmainに含まれること
- `PRODUCTION_SITE_URL`がHTTPSオリジンであること
- Lint・Test・Build・standaloneスモークテスト
- 本番CycloneDX SBOMとライセンスレポート生成
- リリースアーカイブのSHA-256確認
- SLSA provenance生成
- CycloneDX SBOM Attestation生成
- アーカイブ内の絶対パス・`../`拒否
- PM2再読込
- `http://127.0.0.1:3000/api/health`
- 公開URLの`/api/health`

Attestation生成に失敗した場合、Artifact保存と`production`デプロイジョブへ進みません。

## 10. リリースArtifactの生成元証明を確認

本番手動デプロイのActions Summaryには、次を表示します。

- デプロイ対象コミット（`DEPLOY_SHA`）
- Workflow実行元コミット（`GITHUB_SHA`）
- SLSA provenanceのURL
- CycloneDX SBOM AttestationのURL

履歴コミットを指定した場合、`DEPLOY_SHA`と`GITHUB_SHA`は異なることがあります。AttestationはWorkflow実行元を暗号学的に検証し、デプロイ対象SHAはArtifact名・リリース名・依存ライセンスレポートの`commitSha`で突合します。

Artifactをダウンロードした後、次を確認します。

```bash
sha256sum --check release-<DEPLOY_SHA>.tar.gz.sha256
sha256sum --check supply-chain.sha256

gh attestation verify release-<DEPLOY_SHA>.tar.gz \
  --repo mizzz-ivr/lol-type-choice \
  --signer-workflow mizzz-ivr/lol-type-choice/.github/workflows/deploy-production.yml \
  --predicate-type https://slsa.dev/provenance/v1 \
  --deny-self-hosted-runners
```

CycloneDX SBOM Attestation、Workflow実行元SHAの固定、検証失敗時の対応は[本番リリースArtifact Attestation運用](release-artifact-attestation.md)を参照してください。

## 11. 自動切り戻し

PM2再読込または内部ヘルスチェックに失敗した場合、デプロイスクリプトは以下を行います。

1. `current`を直前のリリースへ戻す
2. PM2を直前リリースで再読込する
3. 失敗した新リリースを削除する
4. Workflowを失敗として終了する

初回デプロイで直前リリースがない場合は、`current`を削除してPM2アプリを停止します。

## 12. 明示的な切り戻し

過去の正常コミットを再デプロイします。

1. 過去のGitHub Actions成功済みSHAを確認
2. `本番手動デプロイ`をmainから実行
3. 過去SHAと`DEPLOY`を入力
4. Actions Summaryで`DEPLOY_SHA`と`GITHUB_SHA`を確認
5. Artifact Attestationとデプロイ対象SHAを確認
6. 公開後スモークテストを確認

対象SHAがmainの履歴に含まれていれば、リリースディレクトリが削除済みでも再作成できます。

## 13. ログ確認

```bash
pm2 status
pm2 logs lol-type-choice --lines 100
cat /var/www/lol-type-choice/current/RELEASE_SHA
readlink -f /var/www/lol-type-choice/current
sudo tail -n 100 /var/log/nginx/lol-type-choice.error.log
```

## 14. SSH鍵のローテーション

1. 新しい専用鍵を作成
2. 新公開鍵をVPSへ追加
3. GitHub Environment Secretを新秘密鍵へ更新
4. 手動デプロイを1回実行
5. 旧公開鍵を`authorized_keys`から削除
6. 旧秘密鍵を安全に破棄

## 未対応事項

- VPS契約と実機上での初回デプロイ
- Environment Variable・Secretの実登録
- 本番手動デプロイを実行したAttestationの実地検証
- 複数インスタンスへの無停止切替
- DBマイグレーション
- 外形監視サービス
- デプロイ通知
- VPS側での自動Attestation検証

## 参考

- [本番リリースArtifact Attestation運用](release-artifact-attestation.md)
- [GitHub Docs: Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub Docs: Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)
- [GitHub Docs: Using artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [GitHub Docs: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
