#!/usr/bin/env bash
set -Eeuo pipefail

# OpenIM 官方 Docker 一键部署脚本。
# 说明：脚本使用官方 openimsdk/openim-docker 稳定 Release，不使用 main 分支。
# 生产环境请将 OpenIM API、消息网关和 MinIO 放在 HTTPS/WSS 反向代理之后。

INSTALL_DIR="/opt/openim-docker"
DOMAIN=""
PUBLIC_IP=""
MINIO_SCHEME="http"
TIMEZONE="Asia/Shanghai"
START_MONITORING="false"
FORCE="false"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
用法：
  sudo bash deploy-openim-docker.sh \
    --domain im.example.com \
    [--public-ip 203.0.113.10] \
    [--install-dir /opt/openim-docker] \
    [--https] \
    [--timezone Asia/Shanghai] \
    [--with-monitoring] \
    [--force]

参数：
  --domain             OpenIM 对外访问域名或公网 IP。用于 MinIO 外部地址。
  --public-ip          JVB/MinIO 对外公布的公网 IPv4；未填写时使用 domain。
  --install-dir        安装目录，默认 /opt/openim-docker。
  --https              将 MinIO 外部地址设置为 https://；需提前配置反向代理和证书。
  --timezone           时区，默认 Asia/Shanghai。
  --with-monitoring    同时启动 Prometheus、Alertmanager、Grafana。
  --force              已存在安装目录时重新生成配置，但不删除数据卷。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?缺少 --domain 值}"; shift 2;;
    --public-ip) PUBLIC_IP="${2:?缺少 --public-ip 值}"; shift 2;;
    --install-dir) INSTALL_DIR="${2:?缺少 --install-dir 值}"; shift 2;;
    --https) MINIO_SCHEME="https"; shift;;
    --timezone) TIMEZONE="${2:?缺少 --timezone 值}"; shift 2;;
    --with-monitoring) START_MONITORING="true"; shift;;
    --force) FORCE="true"; shift;;
    -h|--help) usage; exit 0;;
    *) usage; fail "未知参数：$1";;
  esac
done

[[ $EUID -eq 0 ]] || fail "请使用 sudo 或 root 运行。"
[[ -n "$DOMAIN" ]] || { usage; fail "必须提供 --domain。"; }
PUBLIC_IP="${PUBLIC_IP:-$DOMAIN}"

wait_for_package_manager() {
  local deadline=$((SECONDS + 900))
  while fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do
    (( SECONDS < deadline )) || fail "apt/dpkg 锁等待超过 15 分钟，请确认 unattended-upgrades 已完成后重试。"
    log "等待系统包管理器释放锁..."
    sleep 10
  done
}

install_packages() {
  wait_for_package_manager
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git jq openssl python3 rsync unzip
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker Compose 已存在：$(docker compose version --short 2>/dev/null || true)"
    return
  fi
  log "安装 Docker Engine 和 Compose 插件"
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  . /etc/os-release
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: amd64 arm64\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" >/etc/apt/sources.list.d/docker.sources
  wait_for_package_manager
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

random_secret() { openssl rand -hex 24; }

clone_official_release() {
  if [[ -d "$INSTALL_DIR/.git" && "$FORCE" != "true" ]]; then
    log "复用已有官方 OpenIM Docker 目录：$INSTALL_DIR"
    return
  fi
  if [[ -e "$INSTALL_DIR" && "$FORCE" == "true" ]]; then
    mkdir -p "$INSTALL_DIR.backup-$(date +%Y%m%d%H%M%S)"
    rsync -a --exclude='components/' --exclude='.env' "$INSTALL_DIR/" "$INSTALL_DIR.backup-$(date +%Y%m%d%H%M%S)/" 2>/dev/null || true
  elif [[ -e "$INSTALL_DIR" ]]; then
    fail "$INSTALL_DIR 已存在；如需重配请添加 --force。脚本不会删除数据卷。"
  fi
  log "获取 OpenIM 官方 Docker 稳定 Release"
  local repo_dir
  repo_dir="$(dirname "$INSTALL_DIR")"
  mkdir -p "$repo_dir"
  git clone https://github.com/openimsdk/openim-docker.git "$INSTALL_DIR"
  pushd "$INSTALL_DIR" >/dev/null
  git fetch --tags --force
  local tag
  tag="$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/openimsdk/openim-docker/releases/latest)")"
  [[ -n "$tag" && "$tag" != "latest" ]] || fail "无法识别 OpenIM 官方稳定 Release 标签。"
  git checkout "$tag"
  log "使用 OpenIM Docker 稳定版本：$tag"
  popd >/dev/null
}

configure_env() {
  pushd "$INSTALL_DIR" >/dev/null
  [[ -f .env ]] || fail "官方仓库缺少 .env。"
  cp -n .env .env.original 2>/dev/null || true
  local mongo_secret redis_secret minio_secret openim_secret
  mongo_secret="$(random_secret)"
  redis_secret="$(random_secret)"
  minio_secret="$(random_secret)"
  openim_secret="$(random_secret)"
  local external="${MINIO_SCHEME}://${PUBLIC_IP}:10005"
  python3 - "$DOMAIN" "$PUBLIC_IP" "$TIMEZONE" "$external" "$mongo_secret" "$redis_secret" "$minio_secret" "$openim_secret" <<'PY'
from pathlib import Path
import re, sys
path = Path('.env')
domain, public_ip, timezone, external, mongo, redis, minio, openim = sys.argv[1:]
text = path.read_text()
values = {
    'DATA_DIR': str(Path.cwd()) + '/',
    'MONGO_PASSWORD': mongo,
    'REDIS_PASSWORD': redis,
    'MINIO_EXTERNAL_ADDRESS': external,
    'MINIO_SECRET_ACCESS_KEY': minio,
    'OPENIM_SECRET': openim,
    'API_URL': 'http://openim-server:10002',
    'GRAFANA_URL': f'http://{domain}:13000/',
}
for key, value in values.items():
    pattern = rf'(?m)^{re.escape(key)}=.*$'
    replacement = f'{key}={value}'
    if re.search(pattern, text):
        text = re.sub(pattern, replacement, text)
    else:
        text += f'\n{replacement}\n'
path.write_text(text)
PY
  chmod 600 .env
  mkdir -p components/backup/mongo
  popd >/dev/null
}

start_services() {
  pushd "$INSTALL_DIR" >/dev/null
  log "拉取 OpenIM 镜像并启动服务"
  if [[ "$START_MONITORING" == "true" ]]; then
    docker compose --profile m pull
    docker compose --profile m up -d
  else
    docker compose pull
    docker compose up -d
  fi
  popd >/dev/null
}

wait_for_health() {
  pushd "$INSTALL_DIR" >/dev/null
  log "等待容器初始化（首次启动通常需要 30-120 秒）"
  local deadline=$((SECONDS + 300))
  while (( SECONDS < deadline )); do
    local running
    running="$(docker compose ps --status running -q | wc -l | tr -d ' ')"
    if [[ "$running" -ge 8 ]]; then
      log "OpenIM 核心容器已运行：$running 个"
      docker compose ps
      popd >/dev/null
      return 0
    fi
    sleep 10
  done
  docker compose ps -a
  docker compose logs --tail=80 openim-server openim-chat || true
  popd >/dev/null
  fail "OpenIM 容器未在规定时间内全部启动。"
}

print_summary() {
  cat <<EOF

OpenIM Docker 部署完成
=====================
安装目录：$INSTALL_DIR
版本来源：官方 openimsdk/openim-docker 稳定 Release
MinIO 外部地址：${MINIO_SCHEME}://${PUBLIC_IP}:10005
OpenIM API： http://${DOMAIN}:10002
消息网关：   ws://${DOMAIN}:10001
Chat API：   http://${DOMAIN}:10008
Admin API：  http://${DOMAIN}:10009

重要安全事项：
1. .env 已保存随机数据库、Redis、MinIO 和 OpenIM 密钥，请立即备份并限制权限。
2. 生产环境不要直接暴露 10001/10002/10008/10009；请使用 Nginx/Caddy 配置 HTTPS/WSS。
3. 若启用 --https，脚本只会把 MinIO 外部地址写成 https，不会自动签发证书。
4. 查看状态：cd "$INSTALL_DIR" && docker compose ps
5. 查看日志：cd "$INSTALL_DIR" && docker compose logs -f openim-server openim-chat
6. 停止服务：cd "$INSTALL_DIR" && docker compose down
EOF
}

install_packages
install_docker
clone_official_release
configure_env
start_services
wait_for_health
print_summary
