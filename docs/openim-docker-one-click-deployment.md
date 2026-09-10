# OpenIM 服务端 Docker 一键部署指南

本项目提供 `scripts/deploy-openim-docker.sh`，用于在 Ubuntu 服务器上部署 OpenIM 官方 Docker 稳定版本。脚本会安装 Docker Compose、拉取 OpenIM 官方 `openim-docker` 稳定 Release、生成随机服务密钥、配置 MinIO 外部地址、启动核心服务并执行基础健康检查。

OpenIM 官方文档要求生产部署使用 `openim-docker` 的稳定 Release，而不是直接使用 `main` 分支。脚本遵循这一规则，并通过 GitHub Releases 的 `latest` 重定向选择稳定版本。[1]

## 一、服务器要求

建议服务器至少具备 4 vCPU、8 GB 内存和 50 GB 可用磁盘空间。生产环境还应使用固定公网 IPv4、可解析到服务器的域名，并允许 Docker 拉取镜像。

服务器需要开放以下端口。若使用反向代理，公网只开放 80 和 443，其余端口应限制为内网或本机访问。

| 端口 | 协议 | 用途 |
|---|---:|---|
| 10001 | TCP/WS | OpenIM 消息网关 |
| 10002 | TCP/HTTP | OpenIM 服务端 API |
| 10005 | TCP/HTTP | MinIO 文件和图片服务 |
| 10008 | TCP/HTTP | OpenIM Chat API |
| 10009 | TCP/HTTP | OpenIM Admin API |
| 11001 | TCP/HTTP | OpenIM Web 前端 |
| 11002 | TCP/HTTP | OpenIM Admin 前端 |
| 10004 | TCP/HTTP | MinIO 管理控制台 |
| 19090、19093、13000、19100 | TCP | 可选监控服务 |

OpenIM 的 Kafka、MongoDB、Redis 和 etcd 由 Docker Compose 管理。除非有明确的跨主机需求，不应将这些内部依赖端口暴露到公网。

## 二、执行一键部署

先将脚本复制到服务器。例如：

```bash
sudo mkdir -p /opt/scripts
sudo cp deploy-openim-docker.sh /opt/scripts/
sudo chmod +x /opt/scripts/deploy-openim-docker.sh
```

使用域名部署：

```bash
sudo bash /opt/scripts/deploy-openim-docker.sh \
  --domain im.example.com \
  --public-ip 203.0.113.10 \
  --timezone Asia/Shanghai
```

使用用户提供的域名时，命令示例为：

```bash
sudo bash deploy-openim-docker.sh \
  --domain im.superseller88.com \
  --public-ip 154.83.12.217 \
  --timezone Asia/Shanghai
```

脚本默认安装到 `/opt/openim-docker`。如需更换目录，可使用：

```bash
sudo bash deploy-openim-docker.sh \
  --domain im.example.com \
  --install-dir /srv/openim-docker
```

脚本会为 MongoDB、Redis、MinIO、OpenIM、Kafka 和 etcd 自动生成随机凭据，并写入 `/opt/openim-docker/.env`。因此正常运行时不应再出现 `KAFKA_USERNAME`、`KAFKA_PASSWORD`、`ETCD_USERNAME` 或 `ETCD_PASSWORD` 未设置的警告。已有部署可先备份 `.env`，再重新运行脚本时使用 `--force`；脚本不会删除数据卷。

如果服务器已有同名目录，脚本默认停止并保护现有数据。确认需要重新获取官方 Release 和重新生成配置时，才使用 `--force`。该选项不会主动删除 Docker 数据卷，但执行前仍应完成备份。

## 三、HTTPS 和 WSS

脚本会正确设置 MinIO 的外部访问地址，但不会替用户申请证书。生产环境应使用 Nginx、Caddy 或云负载均衡器终止 TLS，并将请求转发到本机 OpenIM 服务。

推荐的公开域名划分如下：

| 域名 | 后端目标 | 说明 |
|---|---|---|
| `im-api.example.com` | `127.0.0.1:10002` | OpenIM API，使用 HTTPS |
| `im-ws.example.com` | `127.0.0.1:10001` | WebSocket 消息网关，使用 WSS |
| `im-chat.example.com` | `127.0.0.1:10008` | Chat API，使用 HTTPS |
| `im-files.example.com` | `127.0.0.1:10005` | MinIO 文件服务，使用 HTTPS |
| `im.example.com` | `127.0.0.1:11001` | OpenIM Web 前端 |

反向代理必须支持 WebSocket Upgrade，并转发 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto` 等请求头。证书申请前，应确认域名 A 记录已经指向服务器公网 IPv4，且 80/443 端口已从公网开放。

配置 HTTPS 后，需要将 `.env` 中的 `MINIO_EXTERNAL_ADDRESS` 改为：

```dotenv
MINIO_EXTERNAL_ADDRESS=https://im-files.example.com
```

然后重新创建相关服务：

```bash
cd /opt/openim-docker
sudo docker compose up -d
```

客户端 SDK 使用 HTTPS/WSS 地址，不应直接使用内部 Docker 服务名，例如 `openim-server`、`kafka` 或 `minio`。

## 四、检查部署状态

查看容器状态：

```bash
cd /opt/openim-docker
sudo docker compose ps
```

查看核心服务日志：

```bash
sudo docker compose logs -f openim-server openim-chat
```

首次启动需要等待约 30–120 秒。若某个服务短暂出现连接拒绝，先等待依赖服务完成初始化，再重新检查。

如果 `docker compose pull` 报错 `network is unreachable`，并且错误地址是 Docker Hub 的 IPv6 地址，说明服务器没有可用 IPv6 路由。该问题发生在 Docker 拉取镜像阶段，不是 OpenIM 镜像或账号配置错误。可先确认：

```bash
curl -4 -I --max-time 15 https://registry-1.docker.io/v2/
curl -6 -I --max-time 15 https://registry-1.docker.io/v2/
ip -6 route
```

若 IPv4 正常、IPv6 失败，可临时让 Docker 只使用 IPv4，最简单的方式是关闭 Docker 的 IPv6 配置后重启 Docker（不会删除镜像或数据卷）：

```bash
sudo mkdir -p /etc/docker
sudo cp -a /etc/docker/daemon.json /etc/docker/daemon.json.backup.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "ipv6": false
}
JSON
sudo systemctl restart docker
cd /opt/openim-docker
sudo docker compose pull
sudo docker compose up -d
```

修复网络后，优先直接在已有目录重新拉取和启动：

```bash
cd /opt/openim-docker
sudo docker compose pull
sudo docker compose up -d
```

不要执行 `docker compose down -v`，也不要删除 `components/` 数据目录。只有 `.env` 缺少关键变量时，才重新运行部署脚本；脚本会保留已有密码，只为缺失的变量生成新值。

如果服务器必须保留 IPv6，则应修复服务器供应商的 IPv6 默认路由，而不是删除 Docker 数据。也可以先为 Docker 配置可用的 DNS，例如在 `/etc/docker/daemon.json` 中加入 `"dns": ["1.1.1.1", "8.8.8.8"]`，然后重启 Docker；DNS 修复无法替代缺失的 IPv6 路由。

检查 Docker 网络中的核心容器：

```bash
sudo docker compose ps --status running
```

OpenIM 官方建议在服务持续异常时执行容器内自检，并查看核心服务日志：[2]

```bash
sudo docker exec -it openim-server mage check
sudo docker exec -it openim-chat mage check
```

## 五、可选监控

如需启动 Prometheus、Alertmanager、Grafana 和 Node Exporter：

```bash
sudo bash deploy-openim-docker.sh \
  --domain im.example.com \
  --public-ip 203.0.113.10 \
  --with-monitoring
```

监控端口不应直接暴露给公网。生产环境应通过 VPN、内网或带身份认证的反向代理访问 Grafana。

## 六、备份和恢复

脚本会为 MongoDB 创建备份目录，但不会自动执行定时备份。至少应备份以下内容：

```text
/opt/openim-docker/.env
/opt/openim-docker/components/mongodb/
/opt/openim-docker/components/redis/
/opt/openim-docker/components/etcd/
/opt/openim-docker/components/kafka/
/opt/openim-docker/components/mnt/
```

`.env` 包含数据库、对象存储和 OpenIM 认证密钥，必须限制为 root 可读：

```bash
sudo chmod 600 /opt/openim-docker/.env
sudo tar -czf /root/openim-backup-$(date +%F).tar.gz \
  /opt/openim-docker/.env \
  /opt/openim-docker/components/mongodb \
  /opt/openim-docker/components/redis \
  /opt/openim-docker/components/etcd \
  /opt/openim-docker/components/mnt
```

恢复前应停止 OpenIM 服务，并确保目标服务器版本与备份来源版本兼容。不要在未验证备份的情况下删除原始数据卷。

## 七、与 E聊后端对接

OpenIM 客户端登录需要 OpenIM 用户 ID 和 Token。E聊 ASP.NET 后端应通过 OpenIM Platform API 创建或同步用户，并在用户登录后向 Android/iOS 客户端返回 OpenIM 登录所需的临时 Token。客户端再使用原生 OpenIM SDK 登录消息服务。

OpenIM 服务端地址和 E聊业务 API 地址是两个不同的系统。不能把 E聊现有的 `https://platform.superseller88.com:2099` 直接当作 OpenIM SDK 的 API 或 WebSocket 地址，除非该域名已经由反向代理转发到 OpenIM 对应端口。

## 八、停止、升级和回滚

停止服务：

```bash
cd /opt/openim-docker
sudo docker compose down
```

升级前先备份 `.env` 和数据目录。升级时应使用 OpenIM 官方新的稳定 Release，不要直接切换到 `main` 分支：

```bash
cd /opt/openim-docker
sudo git fetch --tags
sudo git tag --sort=-v:refname | head
sudo docker compose pull
sudo docker compose up -d
```

若升级失败，应保留旧镜像和数据目录，恢复旧 Release 后再启动。不要使用 `docker compose down -v`，因为该命令可能删除数据卷。

## References

[1]: https://docs.openim.io/guides/gettingStarted/dockerCompose "OpenIM 官方 Docker 部署指南"

[2]: https://github.com/openimsdk/open-im-server "OpenIM 官方服务端仓库"

[3]: https://github.com/openimsdk/openim-docker "OpenIM 官方 Docker 配置仓库"

[4]: https://docs.openim.io/ "OpenIM 官方 SDK 与 Platform API 文档"
