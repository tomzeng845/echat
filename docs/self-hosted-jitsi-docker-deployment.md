# E聊自建 Jitsi 服务器配置与 Docker 部署指南

## 1. 推荐架构

E聊保留现有 SignalR 作为通话信令层，继续负责来电、接听、拒绝、挂断和成员权限。iOS 与 Android 使用原生 Jitsi Meet SDK 加入由 E聊 API 创建的临时房间。网页版本保持现有实现，不切换到 Jitsi IFrame API。

```text
E聊 iOS/Android
      │
      │ 通过 E聊 API 获取临时 roomName 和 JWT
      ▼
自建 Jitsi Meet
  ├─ Web
  ├─ Prosody：XMPP 信令
  ├─ Jicofo：会议编排
  └─ Jitsi Videobridge：音视频 SFU 转发
```

Jitsi Videobridge 是选择性转发单元（SFU），通常不转码，因此服务器需要足够的网络吞吐量和稳定的 UDP 通道。音视频媒体不会经过 E聊 ASP.NET API 服务器。

## 2. 服务器配置清单

### 2.1 最低可用配置

| 项目 | 建议值 | 说明 |
|---|---:|---|
| 操作系统 | Ubuntu 22.04/24.04 LTS 64 位 | 官方 Docker 部署文档支持 Debian 11+ 和 Ubuntu 22.04+ |
| CPU | 4 vCPU | 适合先运行小规模 1 对 1 和小群组通话 |
| 内存 | 8 GB | 包含 Docker、Jitsi 组件和系统余量 |
| 系统盘 | 40 GB SSD | Jitsi 本身不需要大量磁盘；日志和录制功能会额外占用空间 |
| 网络 | 100 Mbps 对称带宽起步 | 视频会议应优先选择低延迟、低抖动线路 |
| 公网地址 | 固定公网 IPv4，IPv6 可选 | 需要配置 DNS 和 JVB 对外公布地址 |
| 域名 | `meet.example.com` | 必须能解析到 Jitsi 服务器公网地址 |
| TLS | Let's Encrypt 或受信任 CA | iOS 和 Android 原生 SDK 不应使用自签名证书 |
| Docker | Docker Engine + Docker Compose v2 | 使用官方 Jitsi Docker release，不建议直接运行 GitHub master |

该规格适合小规模生产验证，不代表固定并发承诺。实际容量取决于视频分辨率、上行带宽、参与人数、屏幕共享和网络质量。正式扩容前应使用真实设备进行并发压测。

### 2.2 扩容参考

| 使用规模 | 建议配置 | 备注 |
|---|---|---|
| 开发和验收 | 2–4 vCPU、4–8 GB RAM | 只运行少量 1 对 1 通话 |
| 小规模生产 | 4 vCPU、8 GB RAM、100 Mbps+ | 适合 E聊初期的 1 对 1 和小群组通话 |
| 中等规模生产 | 8 vCPU、16 GB RAM、1 Gbps | 建议独立 JVB，并配套监控和备份 |
| 更大规模 | 多台 JVB + 负载均衡 | 需要按区域、带宽和会议规模进行压测规划 |

不要把 Jitsi、MongoDB、E聊 ASP.NET API、TURN 和数据库全部部署到同一台小规格服务器上。Jitsi 的 UDP 媒体流量和 E聊 API 的业务请求应至少在资源层面隔离。

## 3. DNS、端口和防火墙

### 3.1 DNS

创建以下记录：

```text
meet.example.com  A  <JITSI_SERVER_PUBLIC_IPV4>
```

如果使用 IPv6，确认 AAAA 记录的路由和防火墙已经正确配置。不要在 DNS 中保留指向旧服务器的记录，否则 Let's Encrypt 或移动端可能间歇性连接到错误节点。

### 3.2 必须开放的端口

| 端口 | 协议 | 用途 |
|---:|---|---|
| 80 | TCP | HTTP 访问和 Let's Encrypt 验证/重定向 |
| 443 | TCP | Jitsi Web、SDK 信令和 HTTPS |
| 10000 | UDP | Jitsi Videobridge 音视频媒体 |

如果额外部署 SIP 网关 Jigasi，再开放官方要求的 SIP 端口范围。E聊原生 SDK 的首版不需要 Jigasi、Jibri 录制或转码服务，建议先关闭这些非必要组件。

Ubuntu UFW 示例：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 10000/udp
sudo ufw enable
sudo ufw status verbose
```

云厂商安全组必须同步放行相同端口。仅修改 UFW 而忘记云安全组，是移动端出现“能打开网页但接通没有声音”的常见原因之一。

## 4. 安装 Docker

以下命令适用于干净的 Ubuntu 22.04/24.04 服务器。生产环境应使用官方 Docker 安装源，并在安装后锁定维护策略和自动安全更新策略。

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world

docker --version
docker compose version
```

将部署账号加入 Docker 组是可选操作。加入后需要重新登录，且 Docker 组权限接近 root 权限，因此生产服务器应谨慎使用：

```bash
sudo usermod -aG docker "$USER"
```

## 5. 下载官方 Jitsi Docker release

官方文档建议下载最新 release 压缩包，而不是直接 clone `master`。这样可以避免 Compose 文件和镜像版本不匹配。

```bash
sudo mkdir -p /opt/jitsi
sudo chown -R "$USER":"$USER" /opt/jitsi
cd /opt/jitsi

LATEST_URL=$(curl -fsSL https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest \
  | grep '"browser_download_url"' \
  | grep '\.zip' \
  | cut -d '"' -f 4 \
  | head -n 1)

curl -fL "$LATEST_URL" -o jitsi-docker.zip
unzip jitsi-docker.zip
rm jitsi-docker.zip
cd docker-jitsi-meet-*
```

如果下载后的目录名称不同，以实际目录为准。不要把 `.env`、JWT 密钥、Let's Encrypt 私钥或 Docker 配置提交到 Git 仓库。

## 6. 创建环境文件和持久化目录

```bash
cd /opt/jitsi/docker-jitsi-meet-*
cp env.example .env
```

编辑 `.env`，至少设置以下变量：

```dotenv
CONFIG=/opt/jitsi/.jitsi-meet-cfg
TZ=Asia/Shanghai
HTTP_PORT=8000
HTTPS_PORT=8443
PUBLIC_URL=https://meet.example.com

ENABLE_LETSENCRYPT=1
LETSENCRYPT_DOMAIN=meet.example.com
LETSENCRYPT_EMAIL=admin@example.com

ENABLE_AUTH=1
ENABLE_GUESTS=0
AUTH_TYPE=jwt
JWT_APP_ID=echat
JWT_APP_SECRET=CHANGE_TO_A_LONG_RANDOM_SECRET

RESTART_POLICY=unless-stopped
```

如果服务器位于 NAT、云负载均衡器或多网卡环境，再设置：

```dotenv
JVB_ADVERTISE_IPS=<SERVER_PUBLIC_IPV4>
```

不要把 `JVB_ADVERTISE_IPS` 设置成 Docker 内网地址。该值必须是移动客户端能够访问的公网媒体地址。

生成内部服务密码：

```bash
./gen-passwords.sh
```

`gen-passwords.sh` 会修改 `.env` 并为 Jicofo、JVB 等组件生成独立密码。不要复用 `JWT_APP_SECRET`、数据库密码或系统账号密码。

创建官方 release 所需的可写目录：

```bash
export CONFIG=/opt/jitsi/.jitsi-meet-cfg

mkdir -p "$CONFIG"/{web,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri,transcriber}
mkdir -p "$CONFIG"/storage/{jibri,prosody,transcripts,web}
mkdir -p "$CONFIG"/tmp/{web-crontabs,web-load-test}
chmod 777 "$CONFIG"/storage/{jibri,prosody,transcripts,web}
chmod 777 "$CONFIG"/tmp/{web-crontabs,web-load-test}
```

首版只使用 Web、Prosody、Jicofo 和 JVB。Jigasi、Jibri、transcriber 目录可以保留，但不要在没有需求时启用 SIP 或录制功能。

## 7. 启动 Jitsi

先检查 Compose 配置，再后台启动：

```bash
cd /opt/jitsi/docker-jitsi-meet-*
docker compose config >/tmp/jitsi-compose-rendered.yml
docker compose pull
docker compose up -d

docker compose ps
docker compose logs --tail=100 web
docker compose logs --tail=100 prosody
docker compose logs --tail=100 jicofo
docker compose logs --tail=100 jvb
```

浏览器访问：

```text
https://meet.example.com
```

必须使用 HTTPS 访问。官方文档明确指出，直接使用 HTTP 会导致浏览器或移动 WebView 无法正确使用摄像头和麦克风。原生 SDK 同样要求受信任的 TLS 证书。

## 8. 生产安全配置

### 8.1 使用 JWT，不开放匿名房间

E聊应该让后端签发短时 JWT，而不是让客户端自行生成 JWT。建议每个通话生成独立房间名：

```text
echat-{conversationId}-{randomCallId}
```

实际生产实现应加入不可预测的随机部分，不能只拼接会话 ID。

JWT 至少应包含签发者、应用标识、用户标识、房间名和过期时间。具体 claim 名称应以当前 Jitsi release 的 JWT 文档和服务器日志为准，不要盲目复用其他版本的 token 示例。

推荐约束：

| 项目 | 建议 |
|---|---|
| 有效期 | 5–15 分钟 |
| 签发位置 | E聊 ASP.NET API 服务端 |
| 密钥存储 | 服务器环境变量或密钥管理系统 |
| 房间权限 | 只允许当前通话成员 |
| 房间名 | 每次通话随机生成 |
| 过期处理 | 通话结束后不再签发新 token |
| 日志 | 不记录完整 JWT，只记录 callId 和 roomName 哈希 |

### 8.2 管理接口和监控

不要将 Prosody XMPP 端口暴露到公网。只开放 Jitsi 官方所需的 HTTP、HTTPS 和 JVB UDP 端口。定期检查：

```bash
docker compose ps
docker stats --no-stream
docker compose logs --since=15m jvb
ss -lntup
sudo ufw status verbose
```

应设置服务器时间同步、磁盘使用率告警、Docker 容器重启策略和定期配置备份。备份内容至少包括 `.env`、`CONFIG` 目录中的配置和 Let's Encrypt 证书；不要把 JWT 密钥发送到普通聊天或提交到 Git。

## 9. E聊 API 对接边界

网页版本不需要更改。iOS 和 Android 原生 SDK 集成后，移动客户端调用 E聊 API 获取 Jitsi 会议信息：

```http
POST /api/calls/jitsi/session
Authorization: Bearer <echat-access-token>
Content-Type: application/json
```

请求体示例：

```json
{
  "conversationId": "conversation-id",
  "callId": "call-id",
  "mode": "audio"
}
```

响应体建议：

```json
{
  "serverUrl": "https://meet.example.com",
  "roomName": "echat-conversation-call-random",
  "jwt": "short-lived-jwt",
  "expiresAt": "2026-09-10T13:10:00Z"
}
```

原生 SDK 使用 `serverUrl`、`roomName` 和 `jwt` 加入会议。SignalR 仍然发送通话状态事件，以便对方收到来电、显示计时器和在任意一方挂断时结束界面。

## 10. 验收顺序

部署完成后不要立即替换生产移动包。应按以下顺序验收：

1. 两台普通浏览器加入同一测试房间，验证音频、视频和端口连通性。
2. iPhone 原生 SDK 与 Android 原生 SDK 进行 1 对 1 语音通话。
3. iPhone 锁屏后接听，验证听筒、外放和蓝牙设备。
4. Android 后台和锁屏接听，验证前台服务与 Jitsi Activity 生命周期。
5. Harmony Android 兼容环境安装 Android 包，单独验证后台、锁屏和音频路由。
6. 切换 Wi-Fi 与移动网络，观察 Jitsi 日志、通话状态和恢复时间。
7. 逐步增加并发，不使用小规模测试结果推断大规模容量。

## 11. 回滚方案

Jitsi 迁移应保留当前 WebRTC 实现作为网页版本和移动端回滚开关。移动端可通过远程配置控制通话引擎：

```json
{
  "iosAndroidCallEngine": "jitsi",
  "webCallEngine": "webrtc"
}
```

如果 Jitsi 房间创建失败、JWT 过期或原生 SDK 无法启动，应显示明确错误并结束本次 Jitsi 会话，不要同时启动旧 WebRTC 和 Jitsi 两套媒体连接。双连接会导致麦克风抢占、回声和音频焦点冲突。

## 12. 参考资料

[1]: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/ "Jitsi Meet 官方 Docker 自建部署文档"
[2]: https://github.com/jitsi/docker-jitsi-meet "Jitsi 官方 Docker Compose 仓库"
[3]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-ios-sdk/ "Jitsi Meet 官方 iOS SDK 文档"
[4]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-android-sdk/ "Jitsi Meet 官方 Android SDK 文档"
[5]: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/ "Jitsi Meet 官方 Debian/Ubuntu 自建部署文档"
[6]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/ "Jitsi Meet 官方 IFrame API 文档"

文档作者：**Manus AI**

最后更新：2026-09-10

> 重要提示：Jitsi Docker 的环境变量和 release 目录结构会随版本变化。部署时应以所下载 release 中的 `env.example` 和官方文档为准，不要直接复制旧教程中的 Compose 文件。

References

[1]: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/ "Jitsi Meet 官方 Docker 自建部署文档"
[2]: https://github.com/jitsi/docker-jitsi-meet "Jitsi 官方 Docker Compose 仓库"
[3]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-ios-sdk/ "Jitsi Meet 官方 iOS SDK 文档"
[4]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-android-sdk/ "Jitsi Meet 官方 Android SDK 文档"
[5]: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/ "Jitsi Meet 官方 Debian/Ubuntu 自建部署文档"
[6]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/ "Jitsi Meet 官方 IFrame API 文档"
