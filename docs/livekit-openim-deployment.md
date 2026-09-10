# LiveKit 自建部署指南（OpenIM 语音/视频通话）

## 1. 推荐架构

OpenIM 负责通话信令和房间凭据，LiveKit 负责实时音频和视频媒体转发：

```text
E聊 Android/iOS
       │  WSS / LiveKit SDK
       ▼
LiveKit SFU
       │
       ├── OpenIM Chat / OpenIM Server：通话信令
       └── E聊 ASP.NET API：签发 OpenIM 与 LiveKit Token
```

OpenIM 官方开源移动端通话方案需要 LiveKit。开源 Demo 主要支持一对一音频和视频通话；群组通话及会议能力需要根据 LiveKit 配置和 OpenIM 版本进一步确认。

## 2. 域名规划

当前 Jitsi 已使用 `meet.superseller88.com` 时，不要让 LiveKit 直接占用同一个域名和端口。建议新增：

```text
livekit.superseller88.com  → LiveKit
```

在 DNS 中添加 A 记录：

```text
livekit.superseller88.com  A  154.83.12.217
```

如果必须继续使用 `meet.superseller88.com`，需要先停止 Jitsi，或将 Jitsi 和 LiveKit 放到不同服务器；同一台服务器上的 80、443、7880 等端口不能被两个服务同时监听。

## 3. 服务器要求

建议生产环境至少使用 4 vCPU、8 GB 内存和固定公网 IPv4。服务器必须能够被移动端访问，不能只绑定 `127.0.0.1`。

防火墙至少开放：

| 端口 | 协议 | 用途 |
|---|---:|---|
| 80 | TCP | HTTP 证书申请或重定向 |
| 443 | TCP | HTTPS/WSS、TURN/TLS |
| 7880 | TCP | LiveKit 信令/API；生产环境通常由反向代理转为 WSS |
| 7881 | TCP | WebRTC TCP fallback |
| 50000–60000 | UDP | WebRTC 媒体端口范围 |
| 7882 | UDP | 按 OpenIM 官方快速部署示例保留的 UDP 入口；若使用端口范围模式，可按实际配置决定是否需要 |

如果使用 LiveKit 内置 TURN，建议额外配置 TURN/TLS 并让 `turn.tls_port` 使用 443，或使用独立 TURN 域名和证书。LiveKit 官方说明，受限网络和企业防火墙环境下，TURN/TLS 能显著提高接通成功率。[1]

## 4. 生成 LiveKit 密钥

在服务器上生成随机 API Secret：

```bash
openssl rand -hex 32
```

例如：

```text
API Key:    echat_livekit
API Secret: 请使用随机生成的 64 位十六进制字符串
```

不要把 API Secret 放进 Android、iOS、网页或 GitHub 仓库。它只能保存在 E聊 ASP.NET API 或 OpenIM Chat 服务端。

## 5. 创建 LiveKit 配置文件

```bash
sudo mkdir -p /opt/livekit
sudo nano /opt/livekit/livekit.yaml
```

推荐配置：

```yaml
port: 7880
log_level: info

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

keys:
  echat_livekit: CHANGE_THIS_TO_A_RANDOM_SECRET

turn:
  enabled: true
  domain: turn.superseller88.com
  tls_port: 443
  # 如果证书由反向代理终止，而不是由 LiveKit 直接读取，
  # 请使用单独的 TURN 配置方案，不要同时让两个进程占用 443。

room:
  auto_create: true
  empty_timeout: 300
  departure_timeout: 20
```

如果服务器位于 NAT 后面，或者 STUN 自动探测到的公网地址不正确，可以改为明确指定公网地址：

```yaml
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
  node_ip: 154.83.12.217
```

## 6. 先用 Docker 启动测试版

项目已经提供一键脚本：

```bash
sudo bash deploy-livekit-openim.sh \
  --domain livekit.superseller88.com \
  --public-ip 154.83.12.217 \
  --email tom88cloud@gmail.com \
  --enable-caddy
```

脚本位置为 `scripts/deploy-livekit-openim.sh`。如果当前服务器的 80/443 已经由 Jitsi 或现有 Nginx/Caddy 占用，不要添加 `--enable-caddy`；应把 `livekit.superseller88.com` 转发到 `127.0.0.1:7880`，并保留 `7881/TCP` 与 `50000–60000/UDP` 对公网开放。

OpenIM 官方 LiveKit 快速部署示例使用 Docker 运行 LiveKit：[2]

```bash
sudo docker run -d \
  --name livekit \
  --restart unless-stopped \
  --network host \
  -v /opt/livekit/livekit.yaml:/livekit.yaml:ro \
  livekit/livekit-server:latest \
  --config /livekit.yaml \
  --bind 0.0.0.0 \
  --node-ip 154.83.12.217
```

使用 `--network host` 能避免 Docker NAT 对 WebRTC UDP 端口的额外影响。LiveKit 官方生产部署文档也建议 Docker 部署优先考虑 host networking。[1]

检查状态：

```bash
sudo docker ps --filter name=livekit
sudo docker logs --tail=200 livekit
```

检查监听端口：

```bash
sudo ss -lntup | grep -E ':(7880|7881|443)\\b|:500[0-9]{2,3}\\b'
```

## 7. 配置 HTTPS/WSS

生产环境不能让 iOS/Android 长期连接不可信的自签名证书。LiveKit 官方要求使用受信任的 CA 证书；自签名证书不适合移动端生产部署。[1]

可以使用 Caddy 终止 HTTPS：

```bash
sudo apt-get update
sudo apt-get install -y caddy
sudo nano /etc/caddy/Caddyfile
```

配置示例：

```caddyfile
livekit.superseller88.com {
    reverse_proxy 127.0.0.1:7880
}
```

重启 Caddy：

```bash
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

然后客户端连接地址使用：

```text
wss://livekit.superseller88.com
```

注意：Caddy 只负责 HTTPS/WSS 信令代理。WebRTC 媒体仍需要服务器的 7881/TCP 和 50000–60000/UDP 对外可达。

如果启用 LiveKit 内置 TURN/TLS，443 端口的使用方式要统一：要么由 LiveKit 直接监听并读取证书，要么使用独立 TURN 域名；不能让 Caddy 和 LiveKit 同时监听同一个 443 端口。

## 8. 配置 OpenIM Chat

OpenIM 官方文档给出的 Docker 配置变量是：

```yaml
CHATENV_CHAT_RPC_CHAT_LIVEKIT_URL: "wss://livekit.superseller88.com"
```

在 OpenIM Docker 的 `docker-compose.yaml` 中，将该变量加入 `openim-chat` 服务的环境变量，然后重启：

```bash
cd /opt/openim-docker
sudo docker compose up -d openim-chat
sudo docker compose logs -f openim-chat
```

如果 LiveKit 与 OpenIM Chat 在同一 Docker 网络，也可以使用内部地址，例如：

```text
ws://livekit:7880
```

但是移动端最终使用的地址必须是公网可访问并且具备可信 TLS 的 `wss://` 地址。

## 9. E聊后端 Token 流程

LiveKit API Secret 只能在服务端使用。建议由 E聊 ASP.NET API 实现以下流程：

1. 用户通过 E聊登录。
2. E聊后端根据用户 ID 生成或获取 OpenIM 用户身份。
3. 用户发起语音或视频通话时，E聊后端创建唯一房间名，例如：

```text
echat-call-{callId}
```

4. E聊后端使用 LiveKit API Key/Secret 为每个参与者签发短期 Join Token。
5. Android/iOS 从 E聊后端获取自己的 Token。
6. 客户端使用原生 LiveKit SDK 加入同一房间。
7. 挂断后客户端离开房间，服务端通过 OpenIM 信令更新通话状态。

Token 不应由客户端自行生成，也不能把 LiveKit Secret 编译进 APK 或 IPA。

## 10. 验收清单

### 服务端

```bash
sudo docker logs livekit --tail=200
sudo ss -lntup | grep -E ':(7880|7881)\\b'
sudo ufw status
```

确认 UDP 端口范围已开放：

```bash
sudo ufw allow 7881/tcp
sudo ufw allow 50000:60000/udp
sudo ufw allow 443/tcp
sudo ufw reload
```

### 客户端

至少使用两台设备测试：

- Android → Android 语音
- iOS → iOS 语音
- Android → iOS 语音
- iOS → Android 视频
- 锁屏来电通知
- 后台接听
- 听筒与扬声器切换
- 移动网络与 Wi-Fi 互拨
- 一方挂断后另一方停止计时和媒体
- 网络切换后自动恢复

## 11. 重要限制

OpenIM 开源移动 Demo 的通话能力和许可证需要单独审查。官方 Demo 文档明确说明开源版本支持一对一音视频通话；多人通话、会议和更完整的生产通话能力可能需要额外配置或商业支持。[3]

### References

[1]: https://docs.livekit.io/transport/self-hosting/deployment/ "LiveKit 官方自建部署文档"

[2]: https://github.com/openimsdk/chat/blob/main/HOW_TO_SETUP_LIVEKIT_SERVER.md "OpenIM 官方 LiveKit 配置说明"

[3]: https://github.com/openimsdk/open-im-android-demo "OpenIM 官方 Android Demo 与通话说明"
