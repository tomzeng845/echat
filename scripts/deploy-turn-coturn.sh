#!/usr/bin/env bash
set -Eeuo pipefail

# E聊 WebRTC coturn 一键部署脚本。
# 作用：安装 coturn、生成 TURN REST API 密钥、配置 IPv4 中继、TLS（可选）和 UFW。
# 不会修改 EChat API、OpenIM、LiveKit 或 Jitsi 服务。

INSTALL_DIR="/etc/turnserver"
DOMAIN=""
PUBLIC_IP=""
EMAIL=""
REALM=""
ENABLE_TLS="false"
MIN_PORT="50000"
MAX_PORT="55000"
FORCE="false"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
用法：
  sudo bash deploy-turn-coturn.sh \
    --domain turn.example.com \
    --public-ip 203.0.113.10 \
    [--realm turn.example.com] \
    [--email admin@example.com --enable-tls] \
    [--min-port 50000] [--max-port 55000] [--force]

参数：
  --domain       TURN 公网域名；无 TLS 时也可使用主机名。
  --public-ip    TURN 对外公布的公网 IPv4，必须与 DNS/端口映射一致。
  --realm        默认使用 --domain。
  --email        启用 Let's Encrypt TLS 时的通知邮箱。
  --enable-tls   使用 certbot standalone 申请/续期 5349 TLS 证书。
  --min-port     中继 UDP 起始端口，默认 50000。
  --max-port     中继 UDP 结束端口，默认 55000。
  --force        覆盖 turnserver.conf；会保留原配置备份和现有密钥。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?缺少 --domain 值}"; shift 2;;
    --public-ip) PUBLIC_IP="${2:?缺少 --public-ip 值}"; shift 2;;
    --realm) REALM="${2:?缺少 --realm 值}"; shift 2;;
    --email) EMAIL="${2:?缺少 --email 值}"; shift 2;;
    --enable-tls) ENABLE_TLS="true"; shift;;
    --enable-tl)
      usage
      fail "参数写成了 --enable-tl；正确参数是 --enable-tls。";;
    --min-port) MIN_PORT="${2:?缺少 --min-port 值}"; shift 2;;
    --max-port) MAX_PORT="${2:?缺少 --max-port 值}"; shift 2;;
    --force) FORCE="true"; shift;;
    -h|--help) usage; exit 0;;
    *) usage; fail "未知参数：$1";;
  esac
done

[[ $EUID -eq 0 ]] || fail "请使用 sudo 或 root 运行。"
[[ -n "$DOMAIN" ]] || { usage; fail "必须提供 --domain。"; }
[[ -n "$PUBLIC_IP" ]] || { usage; fail "必须提供 --public-ip。"; }
[[ -n "$REALM" ]] || REALM="$DOMAIN"
[[ "$MIN_PORT" =~ ^[0-9]+$ && "$MAX_PORT" =~ ^[0-9]+$ && "$MIN_PORT" -lt "$MAX_PORT" ]] || fail "中继端口范围无效。"
if [[ "$ENABLE_TLS" == "true" && -z "$EMAIL" ]]; then
  fail "使用 --enable-tls 时必须提供 --email。"
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
  local apt_options=(-o Acquire::ForceIPv4=true)
  apt-get "${apt_options[@]}" update
  apt-get "${apt_options[@]}" install -y ca-certificates openssl coturn ufw
  if [[ "$ENABLE_TLS" == "true" ]]; then
    apt-get "${apt_options[@]}" install -y certbot
  fi
}

random_secret() { openssl rand -hex 32; }

write_secret() {
  mkdir -p "$INSTALL_DIR"
  chmod 700 "$INSTALL_DIR"
  if [[ ! -s "$INSTALL_DIR/static-auth-secret" ]]; then
    umask 077
    random_secret > "$INSTALL_DIR/static-auth-secret"
  fi
  chmod 600 "$INSTALL_DIR/static-auth-secret"
}

configure_tls() {
  [[ "$ENABLE_TLS" == "true" ]] || return 0
  if ss -lnt '( sport = :80 )' | grep -q LISTEN; then
    fail "80 端口已被占用；请暂时停止反向代理后运行 certbot，或改用现有证书路径。"
  fi
  certbot certonly --standalone --non-interactive --agree-tos \
    --email "$EMAIL" --domain "$DOMAIN" --keep-until-expiring
  install -d -m 750 "$INSTALL_DIR/certs"
  ln -sfn "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$INSTALL_DIR/certs/fullchain.pem"
  ln -sfn "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$INSTALL_DIR/certs/privkey.pem"
}

write_config() {
  local config=/etc/turnserver.conf
  if [[ -s "$config" && "$FORCE" != "true" ]]; then
    cp -a "$config" "$config.backup.$(date +%Y%m%d%H%M%S)"
  fi
  local secret
  secret="$(cat "$INSTALL_DIR/static-auth-secret")"
  umask 077
  cat > "$config" <<EOF
listening-ip=$PUBLIC_IP
relay-ip=$PUBLIC_IP
listening-port=3478
tls-listening-port=5349
min-port=$MIN_PORT
max-port=$MAX_PORT
fingerprint
use-auth-secret
static-auth-secret=$secret
realm=$REALM
stale-nonce
no-cli
no-loopback-peers
no-multicast-peers
no-tlsv1
no-tlsv1_1
simple-log
log-file=/var/log/turnserver/turnserver.log
EOF
  if [[ "$ENABLE_TLS" == "true" ]]; then
    cat >> "$config" <<EOF
cert=$INSTALL_DIR/certs/fullchain.pem
pkey=$INSTALL_DIR/certs/privkey.pem
EOF
  else
    cat >> "$config" <<'EOF'
no-tls
no-dtls
EOF
  fi
  chmod 600 "$config"
  install -d -m 750 /var/log/turnserver
}

configure_service() {
  sed -i 's/^TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
  systemctl enable coturn
  systemctl restart coturn
  sleep 2
  systemctl --no-pager --full status coturn || true
}

configure_firewall() {
  ufw allow 3478/udp >/dev/null || true
  ufw allow 3478/tcp >/dev/null || true
  if [[ "$ENABLE_TLS" == "true" ]]; then
    ufw allow 5349/tcp >/dev/null || true
    ufw allow 5349/udp >/dev/null || true
  fi
  ufw allow "$MIN_PORT:$MAX_PORT/udp" >/dev/null || true
  ufw reload >/dev/null 2>&1 || true
}

print_summary() {
  local secret
  secret="$(cat "$INSTALL_DIR/static-auth-secret")"
  cat <<EOF

coturn 部署完成
====================
TURN 域名：$DOMAIN
公网 IPv4：$PUBLIC_IP
Realm：$REALM
UDP/TCP：turn:$DOMAIN:3478
TLS：$([[ "$ENABLE_TLS" == "true" ]] && echo "turns:$DOMAIN:5349" || echo "未启用")
中继 UDP 端口：$MIN_PORT-$MAX_PORT

TURN REST 临时凭据：
  static-auth-secret 文件：$INSTALL_DIR/static-auth-secret
  服务端使用 secret 生成短期 username/credential；不要把 secret 放入客户端。

客户端 ICE URL 示例：
  turn:$DOMAIN:3478?transport=udp
  turn:$DOMAIN:3478?transport=tcp
$([[ "$ENABLE_TLS" == "true" ]] && echo "  turns:$DOMAIN:5349?transport=tcp")

验收命令：
  systemctl is-active coturn
  ss -lntup | grep -E ':(3478|5349)\\b'
  journalctl -u coturn -n 80 --no-pager

注意：
1. 防火墙和云安全组必须同时放行 3478、可选 5349 以及 $MIN_PORT-$MAX_PORT/udp。
2. 如果服务器位于 NAT 后面，需要改用 external-ip=公网IP/内网IP，并进行端口一一映射。
3. TURN 会中继媒体流，带宽通常是实际媒体码率的约 2 倍；请监控公网出口流量。
4. 修改配置后执行：systemctl restart coturn。
EOF
}

install_packages
write_secret
configure_tls
write_config
configure_firewall
configure_service
print_summary
