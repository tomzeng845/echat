#!/usr/bin/env bash
set -Eeuo pipefail

# E聊 OpenIM + LiveKit 部署脚本。
# 仅部署 LiveKit 媒体服务器；OpenIM 信令服务由 deploy-openim-docker.sh 部署。
# 不写入 EChat APK/iOS 包，不把 API Secret 暴露给客户端。

INSTALL_DIR="/opt/livekit"
DOMAIN=""
PUBLIC_IP=""
EMAIL=""
ENABLE_CADDY="false"
FORCE="false"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
用法：
  sudo bash deploy-livekit-openim.sh \
    --domain livekit.example.com \
    --public-ip 203.0.113.10 \
    [--email admin@example.com] \
    [--install-dir /opt/livekit] \
    [--enable-caddy] \
    [--force]

参数：
  --domain          LiveKit 公网域名；生产环境建议使用独立子域名。
  --public-ip       LiveKit 对外公布的公网 IPv4。
  --email           启用 Caddy 时用于 HTTPS 证书通知的邮箱。
  --install-dir     默认 /opt/livekit。
  --enable-caddy    安装并配置 Caddy，将 HTTPS/WSS 代理到 127.0.0.1:7880。
  --force           覆盖 livekit.yaml 和 compose 文件，但不会删除数据。

示例：
  sudo bash deploy-livekit-openim.sh \
    --domain livekit.superseller88.com \
    --public-ip 154.83.12.217 \
    --email tom88cloud@gmail.com \
    --enable-caddy
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?缺少 --domain 值}"; shift 2;;
    --public-ip) PUBLIC_IP="${2:?缺少 --public-ip 值}"; shift 2;;
    --email) EMAIL="${2:?缺少 --email 值}"; shift 2;;
    --install-dir) INSTALL_DIR="${2:?缺少 --install-dir 值}"; shift 2;;
    --enable-caddy) ENABLE_CADDY="true"; shift;;
    --force) FORCE="true"; shift;;
    -h|--help) usage; exit 0;;
    *) usage; fail "未知参数：$1";;
  esac
done

[[ $EUID -eq 0 ]] || fail "请使用 sudo 或 root 运行。"
[[ -n "$DOMAIN" ]] || { usage; fail "必须提供 --domain。"; }
[[ -n "$PUBLIC_IP" ]] || { usage; fail "必须提供 --public-ip。"; }
if [[ "$ENABLE_CADDY" == "true" && -z "$EMAIL" ]]; then
  fail "使用 --enable-caddy 时必须提供 --email。"
fi

wait_for_package_manager() {
  local deadline=$((SECONDS + 900))
  while fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do
    (( SECONDS < deadline )) || fail "apt/dpkg 锁等待超过 15 分钟。"
    log "等待系统包管理器释放锁..."
    sleep 10
  done
}

install_packages() {
  wait_for_package_manager
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl openssl ufw
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    docker compose version >/dev/null 2>&1 || fail "已安装 Docker，但缺少 Docker Compose 插件。"
    systemctl enable --now docker
    return
  fi
  log "安装 Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: amd64 arm64\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" >/etc/apt/sources.list.d/docker.sources
  wait_for_package_manager
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

random_secret() { openssl rand -hex 32; }

write_config() {
  mkdir -p "$INSTALL_DIR"
  if [[ -s "$INSTALL_DIR/livekit.yaml" && "$FORCE" != "true" ]]; then
    log "复用现有 $INSTALL_DIR/livekit.yaml；如需重写请添加 --force。"
  else
    local secret
    secret="$(random_secret)"
    umask 077
    cat > "$INSTALL_DIR/livekit.yaml" <<EOF
port: 7880
log_level: info

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
  node_ip: $PUBLIC_IP

keys:
  echat_livekit: $secret

room:
  auto_create: true
  empty_timeout: 300
  departure_timeout: 20
EOF
    chmod 600 "$INSTALL_DIR/livekit.yaml"
    printf '%s\n' "echat_livekit=$secret" > "$INSTALL_DIR/livekit-server-secret.txt"
    chmod 600 "$INSTALL_DIR/livekit-server-secret.txt"
  fi

  cat > "$INSTALL_DIR/compose.yaml" <<'EOF'
services:
  livekit:
    image: livekit/livekit-server:latest
    container_name: livekit
    restart: unless-stopped
    network_mode: host
    command: ["--config", "/livekit.yaml", "--bind", "0.0.0.0", "--node-ip", "PUBLIC_IP_PLACEHOLDER"]
    volumes:
      - ./livekit.yaml:/livekit.yaml:ro
EOF
  sed -i "s/PUBLIC_IP_PLACEHOLDER/$PUBLIC_IP/g" "$INSTALL_DIR/compose.yaml"
  chmod 600 "$INSTALL_DIR/compose.yaml"
}

configure_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp >/dev/null || true
    ufw allow 443/tcp >/dev/null || true
    ufw allow 7880/tcp >/dev/null || true
    ufw allow 7881/tcp >/dev/null || true
    ufw allow 50000:60000/udp >/dev/null || true
  fi
}

configure_caddy() {
  [[ "$ENABLE_CADDY" == "true" ]] || return 0
  if ss -lnt '( sport = :80 or sport = :443 )' | grep -q LISTEN; then
    fail "80/443 已被其他服务占用；请将 LiveKit 域名加入现有反向代理，或停止冲突服务后重新运行。"
  fi
  wait_for_package_manager
  apt-get install -y caddy
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy 127.0.0.1:7880
}
EOF
  systemctl enable --now caddy
  systemctl reload caddy
  log "Caddy 已为 $DOMAIN 配置 HTTPS/WSS；证书由 Caddy 自动申请。"
}

start_livekit() {
  cd "$INSTALL_DIR"
  docker compose pull
  docker compose up -d
  sleep 5
  docker compose ps
  docker logs --tail=80 livekit || true
}

print_summary() {
  cat <<EOF

LiveKit 部署配置完成
====================
安装目录：$INSTALL_DIR
LiveKit 内部地址：ws://127.0.0.1:7880
客户端地址：$([[ "$ENABLE_CADDY" == "true" ]] && echo "wss://$DOMAIN" || echo "ws://$PUBLIC_IP:7880")

OpenIM Chat 配置：
  CHATENV_CHAT_RPC_CHAT_LIVEKIT_URL=$([[ "$ENABLE_CADDY" == "true" ]] && echo "wss://$DOMAIN" || echo "ws://$PUBLIC_IP:7880")

API Secret 文件（仅服务端可读）：
  $INSTALL_DIR/livekit-server-secret.txt

验收命令：
  cd $INSTALL_DIR && docker compose ps
  docker logs --tail=200 livekit
  ss -lntup | grep -E ':(7880|7881)\\b|:500[0-9]{2,3}\\b'

注意：
1. OpenIM SDK 负责通话信令，LiveKit 负责音视频媒体；两者都必须正常运行。
2. 不要把 livekit-server-secret.txt 放入 Git、网页、APK 或 IPA。
3. 生产环境优先使用 wss://；如果未启用 Caddy，请先配置现有反向代理和可信证书。
4. 现有 Jitsi 占用 80/443 时，不能再启动本脚本的 Caddy；请在现有代理中新增 $DOMAIN 路由。
EOF
}

install_packages
install_docker
write_config
configure_firewall
configure_caddy
start_livekit
print_summary
