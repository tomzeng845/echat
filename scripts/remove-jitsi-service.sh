#!/usr/bin/env bash
set -Eeuo pipefail

# E聊 Jitsi 清理脚本
# 作用：备份 Jitsi 配置后，停止并删除 Jitsi Docker 服务、卷、网络和目录。
# 不删除 EChat API、MongoDB、OpenIM 或 LiveKit。

JITSI_DIR="/opt/jitsi/docker-jitsi-meet"
BACKUP_DIR="/root/jitsi-backups"
FORCE="false"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
usage() {
  cat <<'EOF'
用法：
  sudo bash remove-jitsi-service.sh [--jitsi-dir /opt/jitsi/docker-jitsi-meet] [--force]

行为：
  1. 将 .env、docker-compose 配置和 Jitsi 数据备份到 /root/jitsi-backups；
  2. 执行 docker compose down --volumes --remove-orphans；
  3. 删除 Jitsi Docker 项目目录；
  4. 不删除 EChat、MongoDB、OpenIM 或 LiveKit。

--force：跳过二次确认，仅适合自动化执行。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --jitsi-dir) JITSI_DIR="${2:?缺少 --jitsi-dir 值}"; shift 2;;
    --force) FORCE="true"; shift;;
    -h|--help) usage; exit 0;;
    *) usage; fail "未知参数：$1";;
  esac
done

[[ $EUID -eq 0 ]] || fail "请使用 sudo 或 root 运行。"
[[ -d "$JITSI_DIR" ]] || fail "Jitsi 目录不存在：$JITSI_DIR"

if [[ "$FORCE" != "true" ]]; then
  cat <<EOF
即将删除：
  $JITSI_DIR
  Jitsi Docker 容器、网络和卷

不会删除：
  EChat API、MongoDB、OpenIM、LiveKit
EOF
  read -r -p "确认继续删除 Jitsi？输入 DELETE-JITSI： " confirmation
  [[ "$confirmation" == "DELETE-JITSI" ]] || fail "确认字符串不匹配，已取消。"
fi

stamp="$(date +%Y%m%d-%H%M%S)"
backup="$BACKUP_DIR/$stamp"
mkdir -p "$backup"
chmod 700 "$BACKUP_DIR" "$backup"

log "备份 Jitsi 配置和环境文件"
for file in .env docker-compose.yml docker-compose.yaml; do
  [[ -f "$JITSI_DIR/$file" ]] && cp -a "$JITSI_DIR/$file" "$backup/"
done
if [[ -d "$JITSI_DIR/config" ]]; then
  cp -a "$JITSI_DIR/config" "$backup/"
fi
if [[ -d "$JITSI_DIR/envs" ]]; then
  cp -a "$JITSI_DIR/envs" "$backup/"
fi
cat > "$backup/README.txt" <<EOF
Jitsi 删除备份
时间：$(date -Is)
原目录：$JITSI_DIR
说明：该目录用于回滚参考，不会自动恢复服务。
EOF
chmod -R go-rwx "$backup"

if [[ -f "$JITSI_DIR/docker-compose.yml" || -f "$JITSI_DIR/docker-compose.yaml" ]]; then
  log "停止并删除 Jitsi Docker 容器、卷和网络"
  cd "$JITSI_DIR"
  docker compose down --volumes --remove-orphans || true
fi

log "清理残留的 Jitsi 项目容器和网络"
docker ps -a --format '{{.ID}} {{.Names}}' | awk '$2 ~ /(^|[-_])jitsi([-_]|$)/ {print $1}' | xargs -r docker rm -f || true
docker network ls --format '{{.ID}} {{.Name}}' | awk '$2 ~ /(^|[-_])jitsi([-_]|$)/ {print $1}' | xargs -r docker network rm || true

log "删除 Jitsi 项目目录"
rm -rf --one-file-system "$JITSI_DIR"

cat <<EOF

Jitsi 已清理完成。
配置备份：$backup

检查端口：
  ss -lntup | grep -E ':(80|443|10000)\\b' || true

后续可部署 OpenIM/LiveKit，但请先确认反向代理中不再包含 meet.superseller88.com 的 Jitsi 路由。
EOF
