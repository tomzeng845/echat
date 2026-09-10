# E聊自建 Jitsi 一键部署说明

本目录中的 `scripts/deploy-jitsi-no-lobby.sh` 面向 Ubuntu 22.04/24.04 服务器。脚本下载 Jitsi 官方 Docker release，安装 Docker Compose，配置 Let's Encrypt HTTPS，创建官方要求的持久化目录，关闭 Lobby 自动敲门和 Lobby 用户界面，然后启动 Jitsi Web、Prosody、Jicofo 与 Jitsi Videobridge。

## 使用前提

服务器必须具有固定公网 IPv4，域名的 A 记录必须已经解析到该地址。云厂商安全组和服务器 UFW 都必须允许 TCP 80、TCP 443 以及 UDP 10000。HTTPS 证书由 Let's Encrypt 申请，因此域名在部署时必须能够从公网访问服务器的 80 端口。

建议的初始服务器规格为 4 vCPU、8 GB 内存和 40 GB SSD。实际容量取决于视频分辨率、参与人数、上行带宽、屏幕共享和网络质量。首次部署建议只进行一对一及小群组测试。

## 一键执行

将脚本复制到目标 Ubuntu 服务器后执行：

```bash
chmod +x deploy-jitsi-no-lobby.sh
sudo ./deploy-jitsi-no-lobby.sh \
  --domain meet.example.com \
  --email admin@example.com \
  --public-ip 203.0.113.10 \
  --timezone Asia/Shanghai
```

`--public-ip` 在服务器有多网卡、NAT 或云负载均衡器时应填写。脚本会把该地址写入 `JVB_ADVERTISE_IPS`，使移动端能够找到音视频媒体入口。

脚本默认启用匿名入会，以便先完成 E聊 iOS、Android 和鸿蒙兼容环境的连通性测试。匿名模式不适合作为公开生产服务，因为任何知道房间名的人都可能尝试加入。生产环境应改为 JWT 认证，并让 E聊 ASP.NET API 为每次通话签发短时 JWT。

## Lobby 行为

脚本在 Jitsi 的 `custom-config.js` 中写入以下策略：

| 配置 | 值 | 作用 |
|---|---:|---|
| `autoKnockLobby` | `false` | 不自动向 Lobby 发起等待请求 |
| `lobby.autoKnock` | `false` | 使用新版配置关闭自动敲门 |
| `securityUi.hideLobbyButton` | `true` | 隐藏 Lobby 入口 |
| `securityUi.disableLobbyPassword` | `true` | 隐藏 Lobby 密码入口 |
| `requireDisplayName` | `false` | 不要求额外输入姓名 |

自建实例没有 `meet.jit.si` 的公共主持人策略，因此在匿名测试模式下不会把普通参与者强制放进公共 Lobby。若服务器仍显示“等待主持人”，应检查实际 `serverUrl` 是否仍指向 `https://meet.jit.si`、容器配置是否挂载了正确的 `CONFIG` 目录，以及 `docker compose logs --tail=100 prosody web` 中的认证配置。

## E聊移动端对接

部署完成后，E聊 iOS 和 Android 原生 Jitsi SDK 的服务器地址应改为：

```text
https://meet.example.com
```

E聊 SignalR 继续负责来电、接听、拒绝、挂断和成员状态。每次通话应使用新的不可预测房间名，例如：

```text
echat-{conversationId}-{randomCallId}
```

群聊中的所有成员必须从 E聊信令事件获得同一个 `roomName`，不能由每个客户端自行重新生成房间号。网页版本可以继续使用原有 WebRTC 路径，移动端再切换到 Jitsi 原生 SDK。

## 启动后检查

```bash
cd /opt/jitsi/docker-jitsi-meet
docker compose ps
docker compose logs --tail=100 web prosody jicofo jvb
sudo ufw status verbose
```

浏览器和原生 SDK 都应使用 HTTPS。Jitsi Videobridge 的媒体流量主要通过 UDP 10000 传输；如果只放行 443 而没有放行 UDP 10000，常见结果是能进入房间但没有声音或视频。

## 重要安全说明

脚本为了让首次测试立即可用，默认设置 `ENABLE_AUTH=0` 和 `ENABLE_GUESTS=1`。正式上线前，应在 `.env` 中配置 JWT 认证，并在 E聊 API 服务端保存 `JWT_APP_SECRET`。不要将 `.env`、JWT 密钥、Let's Encrypt 私钥或完整 Docker 配置提交到 Git 仓库，也不要把完整 JWT 写入日志。

## 参考资料

[1]: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/ "Jitsi Meet 官方 Docker 自建部署文档"
[2]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-configuration/ "Jitsi Meet 官方配置文档"
[3]: https://github.com/jitsi/docker-jitsi-meet "Jitsi 官方 Docker Compose 仓库"

## References

[1]: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/ "Jitsi Meet 官方 Docker 自建部署文档"
[2]: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-configuration/ "Jitsi Meet 官方配置文档"
[3]: https://github.com/jitsi/docker-jitsi-meet "Jitsi 官方 Docker Compose 仓库"
