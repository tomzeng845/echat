#!/usr/bin/env bash
set -Eeuo pipefail

# E聊自建 Jitsi 一键部署脚本。
# 默认使用匿名入会，适合先完成移动端连通性验收；生产环境建议接入 JWT。

usage() {
  cat <<'EOF'
Usage:
  sudo bash deploy-jitsi-no-lobby.sh \
    --domain meet.example.com \
    --email admin@example.com \
    [--public-ip 203.0.113.10] \
    [--install-dir /opt/jitsi] \
    [--timezone Asia/Shanghai]

Required:
  --domain       已解析到本机公网 IPv4 的域名
  --email        Let's Encrypt 通知邮箱

Optional:
  --public-ip    JVB 对外公布的公网 IPv4；多网卡/NAT 环境建议填写
  --install-dir  安装目录，默认 /opt/jitsi
  --timezone     默认 Asia/Shanghai
EOF
}

DOMAIN=""
EMAIL=""
PUBLIC_IP=""
INSTALL_DIR="/opt/jitsi"
TIMEZONE="Asia/Shanghai"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?missing value for --domain}"; shift 2 ;;
    --email) EMAIL="${2:?missing value for --email}"; shift 2 ;;
    --public-ip) PUBLIC_IP="${2:?missing value for --public-ip}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:?missing value for --install-dir}"; shift 2 ;;
    --timezone) TIMEZONE="${2:?missing value for --timezone}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "ERROR: --domain and --email are required." >&2
  usage >&2
  exit 2
fi

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root, for example: sudo bash $0 ..." >&2
  exit 1
fi

if ! [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "ERROR: invalid domain: $DOMAIN" >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }

wait_for_package_manager() {
  local deadline=$((SECONDS + 900))
  while fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock \
      /var/cache/apt/archives/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "ERROR: apt/dpkg is still locked after 15 minutes. Check unattended-upgrades before retrying." >&2
      ps -ef | grep -E '[a]pt|[d]pkg|[u]nattended' >&2 || true
      exit 1
    fi
    log "apt/dpkg is busy; waiting for the system update to finish"
    sleep 10
  done
  dpkg --configure -a
}

log "Installing required packages"
wait_for_package_manager
apt-get update
apt-get install -y ca-certificates curl gnupg unzip jq ufw openssl dnsutils

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine and Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  printf '%s\n' \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  wait_for_package_manager
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

declare -r BASE_DIR="$INSTALL_DIR/docker-jitsi-meet"
declare -r CONFIG_DIR="$INSTALL_DIR/.jitsi-meet-cfg"
mkdir -p "$INSTALL_DIR"

if [[ ! -f "$BASE_DIR/docker-compose.yml" ]]; then
  log "Downloading latest official Jitsi Docker release"
  release_json="$(curl -fsSL https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest)"
  # Recent official releases may contain no uploaded zip asset. The release
  # source archive is still the official docker-jitsi-meet release tree and
  # includes docker-compose.yml, env.example and gen-passwords.sh.
  release_url="$(jq -r '(.assets[]? | select(.name | endswith(".zip")) | .browser_download_url), (.tarball_url // .zipball_url)' <<<"$release_json" | sed '/^null$/d' | head -n 1)"
  [[ -n "$release_url" && "$release_url" != "null" ]] || { echo "ERROR: cannot find official Jitsi release archive" >&2; exit 1; }
  tmp_archive="$(mktemp --suffix=.tar.gz)"
  curl -fL "$release_url" -o "$tmp_archive"
  tmp_dir="$(mktemp -d)"
  if [[ "$release_url" == *.zip ]]; then
    unzip -q "$tmp_archive" -d "$tmp_dir"
  else
    tar -xzf "$tmp_archive" -C "$tmp_dir"
  fi
  extracted="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "$extracted" ]] || { echo "ERROR: official Jitsi release archive is empty" >&2; exit 1; }
  rm -rf "$BASE_DIR"
  mv "$extracted" "$BASE_DIR"
  rm -rf "$tmp_dir" "$tmp_archive"
fi

cd "$BASE_DIR"
[[ -f env.example && -f docker-compose.yml ]] || {
  echo "ERROR: official Jitsi release files are incomplete in $BASE_DIR" >&2
  exit 1
}

if [[ ! -f .env ]]; then
  cp env.example .env
fi

# Keep the official env.example as the source of defaults, then override only
# values needed by this deployment. No private key is written to the project.
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env "CONFIG" "$CONFIG_DIR"
set_env "TZ" "$TIMEZONE"
set_env "PUBLIC_URL" "https://${DOMAIN}"
set_env "ENABLE_HTTP_REDIRECT" "1"
set_env "ENABLE_LETSENCRYPT" "1"
set_env "LETSENCRYPT_DOMAIN" "$DOMAIN"
set_env "LETSENCRYPT_EMAIL" "$EMAIL"
set_env "ENABLE_AUTH" "0"
set_env "ENABLE_GUESTS" "1"
set_env "RESTART_POLICY" "unless-stopped"
if [[ -n "$PUBLIC_IP" ]]; then
  set_env "JVB_ADVERTISE_IPS" "$PUBLIC_IP"
fi

if [[ -x ./gen-passwords.sh ]]; then
  log "Generating unique internal Jitsi passwords"
  ./gen-passwords.sh
fi

log "Creating writable rootless container directories"
mkdir -p \
  "$CONFIG_DIR/web" \
  "$CONFIG_DIR/prosody/config" \
  "$CONFIG_DIR/prosody/prosody-plugins-custom" \
  "$CONFIG_DIR/jicofo" \
  "$CONFIG_DIR/jvb" \
  "$CONFIG_DIR/jigasi" \
  "$CONFIG_DIR/jibri" \
  "$CONFIG_DIR/transcriber" \
  "$CONFIG_DIR/storage"/{jibri,prosody,transcripts,web} \
  "$CONFIG_DIR/tmp"/{web-crontabs,web-load-test}
chmod 777 \
  "$CONFIG_DIR/storage"/{jibri,prosody,transcripts,web} \
  "$CONFIG_DIR/tmp"/{web-crontabs,web-load-test}

log "Writing Jitsi web configuration with Lobby disabled"
cat > "$CONFIG_DIR/web/custom-config.js" <<'JITSI_CONFIG'
// E聊 self-hosted Jitsi policy.
// The E聊 SignalR layer selects an authorized room; Jitsi must not place
// participants into a public lobby or require a moderator approval.
config.autoKnockLobby = false;
config.lobby = {
  autoKnock: false,
  enableChat: false
};
config.securityUi = {
  hideLobbyButton: true,
  disableLobbyPassword: true
};
config.requireDisplayName = false;
JITSI_CONFIG

log "Checking DNS and rendering Docker Compose configuration"
resolved_ip="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')" || true
if [[ -z "$resolved_ip" ]]; then
  echo "ERROR: $DOMAIN does not resolve to an IPv4 address. Configure DNS before starting." >&2
  exit 1
fi
if [[ -n "$PUBLIC_IP" && "$resolved_ip" != "$PUBLIC_IP" ]]; then
  echo "WARNING: $DOMAIN resolves to $resolved_ip, but --public-ip is $PUBLIC_IP" >&2
fi

docker compose config >/tmp/echat-jitsi-compose-rendered.yml

log "Opening required firewall ports"
ufw allow OpenSSH >/dev/null || true
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 10000/udp >/dev/null
ufw --force enable >/dev/null

log "Pulling and starting Jitsi"
docker compose pull
docker compose up -d
sleep 10
docker compose ps

cat <<EOF

Jitsi deployment completed.

URL: https://${DOMAIN}
Install directory: ${BASE_DIR}
Config directory: ${CONFIG_DIR}
Lobby: disabled in custom-config.js
Public anonymous rooms: enabled for initial testing

Important:
1. Ensure the cloud-provider security group also allows TCP 80/443 and UDP 10000.
2. For production, integrate EChat-issued short-lived JWT instead of anonymous rooms.
3. The EChat mobile SDK must use https://${DOMAIN} as serverUrl.
4. Diagnostics: cd ${BASE_DIR} && docker compose logs --tail=100 web prosody jicofo jvb
EOF
