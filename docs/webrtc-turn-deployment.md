# E聊 WebRTC + coturn 部署说明

## 当前通话路径

E聊已恢复使用现有 SignalR 信令与浏览器 WebRTC `RTCPeerConnection`。呼叫双方通过 `CallInvite`、`CallAccept` 和 `CallSignal` 交换 SDP 与 ICE candidate；媒体优先尝试 P2P，无法直连时使用 `/api/rtc/config` 返回的 TURN 临时凭据。移动端不再依赖 Jitsi 入会页面。

## 媒体配置

音频采集优先请求单声道、48 kHz、16-bit、回声消除、噪声抑制和自动增益控制。浏览器是否实际采用 48 kHz 或 AEC3 由终端硬件和浏览器决定，应用会保留兼容回退，不应把浏览器约束当作强制保证。

视频编码优先顺序为 VP9、AV1、H.264 和 VP8；最终使用的编码器由双方浏览器、硬件和 SDP 协商共同决定。视频发送限制为 30 fps，并根据 WebRTC 统计的丢包、抖动和 RTT 调整码率与分辨率。WebRTC 自带 GCC 拥塞控制仍负责底层发送节奏，应用层只做温和的上限调整，避免频繁改写发送器导致断续。

## 部署 coturn

在一台具有公网 IPv4 的 Ubuntu 22.04/24.04 服务器上执行：

```bash
sudo bash deploy-turn-coturn.sh \
  --domain turn.example.com \
  --public-ip 203.0.113.10 \
  --realm turn.example.com \
  --email admin@example.com \
  --enable-tls
```

脚本位置为 `scripts/deploy-turn-coturn.sh`。它会安装 coturn，生成仅服务端可读的 TURN REST API secret，配置 3478 UDP/TCP、5349 TLS/DTLS（启用 TLS 时）以及 50000–55000 UDP 中继端口，并配置 UFW。脚本不会修改 OpenIM、LiveKit 或 Jitsi 服务。

如果服务器位于 NAT 后面，应在 `/etc/turnserver.conf` 使用公网/内网映射，例如：

```ini
external-ip=203.0.113.10/10.0.0.10
```

并在云安全组和路由器上逐端口映射 3478、5349 和中继 UDP 范围。

## EChat API 配置

TURN secret 不能写入 APK、IPA、Windows 前端或网页。服务端使用同一个 secret 生成短期用户名和凭据，并在 `/api/rtc/config` 中只返回有限有效期的客户端配置。Windows Service 环境变量示例：

```powershell
$env:TURN_URLS = "turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp"
$env:TURN_SECRET = "只放在服务端的 static-auth-secret 内容"
```

若当前 API 版本只支持固定 ICE 用户名/密码，应优先升级为短期 TURN REST 凭据；固定凭据不应长期嵌入客户端。

## 防火墙

```bash
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 50000:55000/udp
sudo ufw reload
```

TURN 中继流量约为媒体码率的两倍。720p 一对一视频通常应预留每通话约 4–6 Mbps 的 TURN 总带宽，并额外预留网络波动空间。

## 验收

服务端：

```bash
systemctl is-active coturn
ss -lntup | grep -E ':(3478|5349)\\b'
journalctl -u coturn -n 80 --no-pager
```

客户端通话诊断中应能观察到 ICE candidate 类型：`host` 表示本地直连，`srflx` 表示 STUN 映射，`relay` 表示已经通过 TURN 中继。移动网络、严格 NAT 或企业防火墙环境中至少应验证一次 `relay` 路径。

生产验收还应覆盖：Wi-Fi 到蜂窝网络切换、锁屏/后台恢复、语音与视频同时通话、丢包和 RTT 升高、远端音频长时间无数据、TURN 临时凭据过期，以及 coturn 重启后的自动重连。

## 安全注意事项

TURN 服务器必须使用长期密钥或 TURN REST API 鉴权，不能开放匿名中继。coturn 4.5.1 及以上版本默认阻止 loopback/multicast peer，不要再写旧版 `no-loopback-peers` 或 `no-multicast-peers`；coturn 4.5.2 会因此报 `Bad configuration format`。同时监控出口流量和异常分配数量。证书私钥、TURN secret、API JWT secret 和数据库密码不得提交 Git 或放入移动安装包。
