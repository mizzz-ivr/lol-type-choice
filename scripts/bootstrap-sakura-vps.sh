#!/usr/bin/env bash
set -Eeuo pipefail

on_error() {
  local exit_code=$?
  echo "[ERROR] 初期セットアップに失敗しました（終了コード: ${exit_code}、行: ${BASH_LINENO[0]}）。" >&2
  exit "${exit_code}"
}
trap on_error ERR

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] sudo bash scripts/bootstrap-sakura-vps.sh で実行してください。" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "[ERROR] /etc/os-release を読み込めません。" >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  echo "[ERROR] Ubuntu 24.04のみを対象としています。現在: ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

APP_USER="${APP_USER:-${SUDO_USER:-ubuntu}}"
APP_DIR="${APP_DIR:-/var/www/lol-type-choice}"
LOG_DIR="${LOG_DIR:-/var/log/lol-type-choice}"
NODE_MAJOR="22"
NPM_VERSION="10.9.8"
PM2_VERSION="7.0.3"

if ! id "${APP_USER}" >/dev/null 2>&1; then
  echo "[ERROR] 実行ユーザー ${APP_USER} が存在しません。APP_USERを指定してください。" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "[1/8] OSパッケージを更新します。"
apt-get update -y
apt-get upgrade -y

echo "[2/8] 基本パッケージを導入します。"
apt-get install -y \
  ca-certificates \
  curl \
  fail2ban \
  git \
  gnupg \
  nginx \
  rsync \
  snapd \
  ufw \
  unattended-upgrades

echo "[3/8] NodeSource署名鍵とNode.js ${NODE_MAJOR}リポジトリを登録します。"
install -d -m 0755 /usr/share/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
chmod 0644 /usr/share/keyrings/nodesource.gpg

architecture="$(dpkg --print-architecture)"
case "${architecture}" in
  amd64|arm64) ;;
  *)
    echo "[ERROR] 未対応アーキテクチャです: ${architecture}" >&2
    exit 1
    ;;
esac

cat >/etc/apt/sources.list.d/nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_${NODE_MAJOR}.x
Suites: nodistro
Components: main
Architectures: ${architecture}
Signed-By: /usr/share/keyrings/nodesource.gpg
EOF

cat >/etc/apt/preferences.d/nodejs <<'EOF'
Package: nodejs
Pin: origin deb.nodesource.com
Pin-Priority: 600
EOF

apt-get update -y
apt-get install -y nodejs

echo "[4/8] npmとPM2を固定バージョンで導入します。"
npm install --global "npm@${NPM_VERSION}" "pm2@${PM2_VERSION}"

echo "[5/8] UFWを設定します。"
ufw default deny incoming
ufw default allow outgoing
ufw limit OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "[6/8] Fail2banと自動セキュリティ更新を有効化します。"
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF

systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "[7/8] Nginxの基本設定と配置ディレクトリを作成します。"
cat >/etc/nginx/conf.d/security.conf <<'EOF'
server_tokens off;
EOF

install -d -o "${APP_USER}" -g "${APP_USER}" -m 0755 "${APP_DIR}"
install -d -o "${APP_USER}" -g "${APP_USER}" -m 0750 "${LOG_DIR}"

nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "[8/8] 設定結果を確認します。"
node --version
npm --version
pm2 --version
ufw status verbose
systemctl --no-pager --full status nginx | sed -n '1,8p'
systemctl --no-pager --full status fail2ban | sed -n '1,8p'

echo
cat <<EOF
セットアップが完了しました。

次の作業:
1. 別ターミナルからSSH公開鍵ログインを再確認
2. ${APP_DIR} へアプリを配置
3. .env.production を作成
4. npm ci / lint / test / build / smoke:standalone を実行
5. PM2とNginxを設定
6. DNS反映後にCertbotでSSLを有効化

注意:
- SSH設定とSSHポートは変更していません。
- 3000/tcpは外部公開していません。
- 再起動が必要かどうかは /var/run/reboot-required を確認してください。
EOF
