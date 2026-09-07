# E聊 Windows 部署方案

本文对应 **E聊 0.9.0 Windows x64 自包含发布包**。发布包包含已编译的 React 网页、ASP.NET Core API、SignalR 实时通信和 MongoDB 驱动；目标 Windows 服务器不需要安装 Node.js 或 .NET SDK 即可运行。

> **重要安全提示**：MongoDB URI 包含数据库账号和密码。当前项目已经按需求写入 `Api/appsettings.json`，并且运行时优先读取 `MONGODB_URI` 环境变量。请限制源码、发布包和服务器文件权限；如果该密码曾被提交到公开仓库、发送到不受控渠道或泄露，应立即在 MongoDB 中更换密码并同步更新部署环境变量。

## 1. 推荐架构

推荐采用下列结构：

```text
浏览器 / Android / iOS
          │ HTTPS + WSS
          ▼
Windows Server
  IIS（可选：TLS、域名、反向代理）
          │ http://127.0.0.1:2099
          ▼
EChat Windows Service
  EChat.Api.exe（自包含 .NET 8，提供网页、REST、SignalR）
          │ TCP 27018
          ▼
MongoDB 10.63.125.3:27018 / admin / echat
```

如果暂时没有域名或证书，可以先让 Windows 服务直接监听 `2099` 端口用于内网验证；正式公网环境应在 IIS 或其他受控反向代理上启用 HTTPS，并将 `/hubs/chat` 的 WebSocket 连接转发到 API。

## 2. 服务器端需要安装的软件和插件

### 2.1 直接运行 Windows Service（推荐，发布包为自包含）

目标服务器至少需要：

| 项目 | 是否必须 | 说明 |
| --- | --- | --- |
| Windows 10/11 x64 或 Windows Server x64 | 必须 | 发布包目标为 `win-x64`。建议使用受支持的 Windows Server 版本。 |
| PowerShell 5.1 或更高 | 必须 | 用于执行服务安装、卸载和环境变量脚本；Windows Server 通常自带。 |
| Windows Administrator 权限 | 安装时必须 | 创建 Windows Service、写入 `C:\Program Files\EChat` 和机器级环境变量时需要。 |
| MongoDB 网络访问 | 必须 | 允许访问 `10.63.125.3:27018`，并确认 MongoDB 用户可以访问 `echat` 数据库。 |
| IIS / Node.js / .NET SDK | 不需要 | 自包含单文件已携带 .NET 运行时；网页资源已经编译，不需要 Node.js。 |

服务器防火墙至少需要允许：

- Windows 服务器出站访问 `10.63.125.3:27018`。
- 如果客户端直接访问 API，入站允许 TCP `2099`；如果由 IIS 终止 HTTPS，公网只开放 TCP `80/443`，2099 仅允许本机或 IIS 到 API 的本地访问。
- 若使用 GeoIP、FCM、APNs、TURN 等可选能力，还要允许相应的 HTTPS/UDP 出站访问。

### 2.2 使用 IIS 绑定域名和 HTTPS（可选）

如果使用 IIS，额外安装：

1. **IIS Web Server** 和 **IIS Management Console**。
2. IIS 的 **WebSocket Protocol** 功能。E聊的 SignalR 实时聊天和通话信令依赖 WebSocket；Microsoft 文档说明 IIS 上需要启用 WebSocket Protocol，且 Windows Server 2012 及以上支持 IIS WebSocket。
3. **ASP.NET Core Hosting Bundle 8.x**。它提供 IIS 的 ASP.NET Core Module；对于本交付的 self-contained 包，服务器不需要 .NET SDK，但 IIS 反向代理模式仍建议安装 Hosting Bundle 以获得 ANCM/IIS 集成。
4. IIS URL Rewrite / Application Request Routing（如果采用 IIS 反向代理到 Windows Service）。也可以不使用 IIS 反代，直接用 Windows Service 监听 2099。
5. 有效的 TLS 证书。证书应绑定到实际域名，不能使用生产环境的自签名证书。

官方参考：

- [Host ASP.NET Core in a Windows Service](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/windows-service?view=aspnetcore-8.0)
- [Host ASP.NET Core on Windows with IIS](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/?view=aspnetcore-8.0)
- [WebSockets support in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/websockets?view=aspnetcore-8.0)

## 3. MongoDB 配置

项目默认连接地址已经修改为：

```text
mongodb://root:Heibai%40996666@10.63.125.3:27018/admin?connectTimeoutMS=3000000&timeoutMS=50000&maxIdleTimeMS=600000&authMechanism=SCRAM-SHA-1&directConnection=true
```

其中 `%40` 是密码中 `@` 的 URL 编码，`directConnection=true` 用于避免 MongoDB 返回的副本集内部主机名（例如 `yisu-65426b25ec1b7`）无法被 Windows DNS 解析。默认数据库名为 `echat`。运行时环境变量优先级高于 `appsettings.json`，建议在生产服务器设置：

```powershell
$env:MONGODB_URI = "mongodb://root:Heibai%40996666@10.63.125.3:27018/admin?connectTimeoutMS=3000000&timeoutMS=50000&maxIdleTimeMS=600000&authMechanism=SCRAM-SHA-1&directConnection=true"
$env:MONGODB_DATABASE = "echat"
$env:MONGODB_DIRECT_CONNECTION = "true"
```

部署前确认：

1. Windows 服务器可以连通 `10.63.125.3:27018`。
2. MongoDB 的 `root` 账号允许从该 Windows 服务器来源地址登录。
3. MongoDB 服务端启用了 `SCRAM-SHA-1`，因为连接串显式指定了 `authMechanism=SCRAM-SHA-1`。
4. `admin` 是认证数据库，业务集合会写入 `echat` 数据库。
5. 生产备份、恢复、索引和磁盘空间策略已经由数据库管理员确认。

API 首次启动会自动创建应用所需索引，并按 `SEED_INVITE_CODE` 创建/更新首个邀请码。

## 4. 生成 Windows 发布包

### 4.1 构建机要求

构建机需要安装：

- Node.js 22 LTS
- pnpm 10
- .NET 8 SDK
- PowerShell 5.1+ 或 PowerShell 7+

在项目根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm windows:release
```

也可以显式指定版本和运行时：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-release.ps1 -Version 0.9.0 -Runtime win-x64
```

输出文件：

```text
releases\EChat-0.9.0-windows-x64.zip
releases\EChat-0.9.0-windows-x64.zip.sha256
releases\windows-x64\
```

发布包是 self-contained + single-file：主程序为 `EChat.Api.exe`。压缩包还包含部署说明、服务安装脚本、服务卸载脚本、启动脚本和环境变量模板。发布脚本不把构建机的环境变量值写入二进制。

校验 SHA-256：

```powershell
Get-FileHash .\releases\EChat-0.9.0-windows-x64.zip -Algorithm SHA256
Get-Content .\releases\EChat-0.9.0-windows-x64.zip.sha256
```

## 5. 直接安装为 Windows Service

以下步骤在目标服务器上以 **管理员 PowerShell** 执行。

### 5.1 解压与安装

```powershell
Set-ExecutionPolicy -Scope Process Bypass
Expand-Archive .\EChat-0.9.0-windows-x64.zip -DestinationPath "C:\EChat-release" -Force
Set-Location "C:\EChat-release"

.\install-service.ps1 -InstallPath "C:\Program Files\EChat" -ServiceName EChat -Port 2099
```

安装脚本会创建 `EChat` 服务、设置 `ECHAT_PORT=2099`，配置延迟自动启动和失败自动重启，并生成：

```text
C:\Program Files\EChat\echat.env.ps1
```

编辑该文件，将模板中的随机密钥、管理员初始密码、邀请码和跨域地址替换为生产值。MongoDB URI 已按需求填写，但仍建议通过受保护的环境变量或密钥管理方式注入。

必须配置的生产变量：

| 变量 | 用途 |
| --- | --- |
| `MONGODB_URI` | MongoDB 完整连接串；已给出指定地址。 |
| `MONGODB_DATABASE` | 业务数据库，默认 `echat`。 |
| `MONGODB_DIRECT_CONNECTION` | 默认 `true`，避免副本集返回不可解析的内部主机名；只有 DNS 已正确解析全部副本集成员时才建议改为 `false`。 |
| `JWT_SECRET` | JWT 签名密钥，必须是随机长字符串。 |
| `ADMIN_BOOTSTRAP_PASSWORD` | 首次管理账号密码；不要使用演示密码。 |
| `ADMIN_SECRET_ENCRYPTION_KEY` | 管理员 TOTP 等敏感信息的加密密钥，必须长期稳定。 |
| `ADMIN_TOTP_SECRET` | 管理员动态验证码的 Base32 密钥；必须加入 Google Authenticator 或 Microsoft Authenticator。 |
| `SEED_INVITE_CODE` | 首个注册邀请码。 |
| `CORS_ALLOWED_ORIGINS` | 正式前端来源，例如 `https://chat.example.com`；多个地址用英文逗号分隔。 |

可选变量：`TURN_URLS`、`TURN_SECRET`、`SFU_URL`、`FCM_PROJECT_ID`、`FCM_SERVICE_ACCOUNT_JSON`、`APNS_TEAM_ID`、`APNS_KEY_ID`、`APNS_BUNDLE_ID`、`APNS_PRIVATE_KEY`、`APNS_USE_SANDBOX`。移动推送和音视频生产能力仍需要对应的第三方账号、证书、TURN/SFU 基础设施。

### 5.2 设置密钥并启动

先把发布包中的模板复制为实际环境文件：

```powershell
notepad "C:\Program Files\EChat\echat.env.ps1"
```

保存后执行：

```powershell
.\start-service.ps1 -InstallPath "C:\Program Files\EChat" -ServiceName EChat
Get-Service EChat
Invoke-WebRequest http://127.0.0.1:2099/api/health
```

健康检查应返回 JSON，包含 `status: healthy`。API 现在会先完成 HTTP/Windows Service 启动握手，再在后台执行 MongoDB 索引、种子数据和管理员初始化；MongoDB 暂时不可达不会再阻塞服务启动，后台会每 5–60 秒自动重试，单次初始化网络操作最多等待 30 秒。相关日志写入 Windows **事件查看器 → Windows 日志 → 应用程序**。

### 5.2.1 创建默认后台管理员

发布包的 `mongodb` 目录包含幂等初始化脚本。它会创建或更新账号 `e-admin`（用户输入的 `E-Admin` 会按 API 规则规范化为小写），密码为 `Heibai@99`，并设置管理员角色。安装 MongoDB Shell（`mongosh`）后，在管理员 PowerShell 中执行：

```powershell
$env:MONGODB_URI = "mongodb://root:Heibai%40996666@10.63.125.3:27018/admin?connectTimeoutMS=3000000&timeoutMS=50000&maxIdleTimeMS=600000&authMechanism=SCRAM-SHA-1&directConnection=true"
Set-Location "C:\EChat-release\mongodb"
.\create-default-admin.ps1
```

也可以直接执行 `mongosh $env:MONGODB_URI --file .\create-default-admin.js`。创建后请立即登录后台修改密码并配置 TOTP；生产环境不建议长期使用默认密码。

### 5.2.2 配置管理员 TOTP

如果登录提示“管理员动态验证码服务尚未配置”，请在管理员 PowerShell 中执行发布包 `security` 目录的初始化脚本：

```powershell
Set-Location "C:\EChat-release\security"
.\setup-admin-totp.ps1 -EnvFile "C:\Program Files\EChat\echat.env.ps1"
```

脚本会生成随机 Base32 密钥并写入环境文件，同时输出密钥和 `otpauth://` 地址。将密钥手动添加到 Google Authenticator 或 Microsoft Authenticator 后，重启服务：

```powershell
Restart-Service EChat
```

打开验证器生成 6 位验证码，先用密码登录，再输入动态验证码即可。请将脚本输出的密钥视为密码，不要发到群聊或提交到代码仓库。

如果服务状态为 `Running` 但健康检查失败，优先检查 `MONGODB_URI`、MongoDB 网络连通性、端口占用和事件查看器中的 `StartupDataInitializer` 日志。服务启动后数据库仍不可达时，登录、消息和需要数据库的接口会在数据库恢复后正常工作；不要因为初始化重试就重复创建服务。

### 5.3 更新版本

1. 备份当前 `C:\Program Files\EChat\echat.env.ps1`。
2. 执行 `Stop-Service EChat`。
3. 用新发布包覆盖程序文件，但保留并恢复 `echat.env.ps1`。
4. 执行 `Start-Service EChat`。
5. 调用 `/api/health` 并进行登录、消息和 SignalR 冒烟验证。

卸载服务但保留文件：

```powershell
.\uninstall-service.ps1 -InstallPath "C:\Program Files\EChat" -ServiceName EChat
```

卸载服务并删除程序文件：

```powershell
.\uninstall-service.ps1 -InstallPath "C:\Program Files\EChat" -ServiceName EChat -RemoveFiles
```

## 6. IIS 反向代理（可选）

推荐让 `EChat` Windows Service 只监听本机 `2099`，由 IIS 对外提供 HTTPS。IIS 站点的物理路径可以指向发布目录，但如果 IIS 直接托管 self-contained ASP.NET Core，应使用发布包中的 `web.config` 和 ASP.NET Core Module；更简单稳定的方式是让 IIS 作为反向代理转发到 `http://127.0.0.1:2099`。

聊天端的 RSA/AES 加密依赖浏览器 Web Crypto。**外网访问必须使用有效的 HTTPS 域名**，例如 `https://chat.example.com`；使用 `http://公网IP:2099`、自签名证书未被浏览器信任的地址或其他非安全上下文，会导致 `crypto.subtle.generateKey` 不可用，登录后无法初始化聊天加密密钥。

### 前端域名与 API 域名分离

如果页面地址和 API 地址不同，例如页面使用 `https://chat.example.com`、API 使用 `https://api.example.com`，构建前端时必须显式指定 API 地址：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-release.ps1 -ApiBaseUrl "https://api.example.com"
```

上面的命令中的 `https://api.example.com` 会被写入前端构建结果；不要在浏览器中用相对地址访问另一台 API 服务器。API 服务的 `echat.env.ps1` 还必须设置页面来源：

```powershell
$env:CORS_ALLOWED_ORIGINS = "https://chat.example.com"
```

修改环境文件后重启 API 服务：

```powershell
Restart-Service EChat
```

页面域名和 API 域名都应使用受浏览器信任的 HTTPS 证书，并确保 API 反向代理转发 WebSocket，否则实时消息和通话无法工作。

IIS 配置要点：

1. 绑定正式域名和 TLS 证书。
2. 启用 **WebSocket Protocol**。
3. 反向代理必须保留 `Upgrade` / `Connection` WebSocket 请求头。
4. 将 `/hubs/chat` 转发到 API，并确保连接超时不会过短。
5. 将 `CORS_ALLOWED_ORIGINS` 设置为浏览器实际访问域名，例如 `https://chat.example.com`。
6. 公网防火墙只开放 443；2099 仅允许本机访问。
7. 如果使用 IIS 应用池，应用池无需托管代码（No Managed Code），并关闭会导致长连接被频繁回收的策略；Windows Service 本身负责进程生命周期。

正式环境建议使用统一域名，使网页、REST 和 SignalR 均通过同一 HTTPS 来源访问，避免 Cookie、CORS 和 WebSocket 跨域问题。

## 7. 部署完成验收清单

- [ ] Windows Service `EChat` 状态为 `Running`。
- [ ] `http://127.0.0.1:2099/api/health` 返回 `status=healthy`。
- [ ] API 能连接 MongoDB，首次启动没有 `Mongo connection string missing` 或连接超时。
- [ ] `echat` 数据库已出现用户、会话、消息等集合及唯一索引。
- [ ] 普通账号可以注册、登录、刷新令牌和退出登录。
- [ ] 两个账号可以建立会话并通过 SignalR 实时收发消息。
- [ ] 管理账号已修改为正式密码并完成 Google Authenticator TOTP 绑定。
- [ ] `ADMIN_TOTP_SECRET` 已写入生产环境文件，管理员登录可完成动态验证码验证。
- [ ] HTTPS 页面可以建立 `/hubs/chat` 的 `wss://` 连接。
- [ ] 外网环境下 CORS、DNS、证书、Windows 防火墙和 MongoDB 白名单均已确认。
- [ ] 已配置 MongoDB 备份、日志保留、服务监控和升级回滚目录。

## 8. 常见问题

### 服务启动后立刻停止

检查 `EChat.Api.exe` 是否被杀毒软件拦截、2099 端口是否被占用，以及 Windows 事件查看器中的启动异常。当前版本不会在服务启动握手阶段等待 MongoDB；如果仍然出现“服务没有及时响应启动或控制请求”，可先在管理员 PowerShell 中直接运行 `C:\Program Files\EChat\EChat.Api.exe`，观察控制台首个异常，再检查服务的二进制路径和账户权限。

### 服务已运行但 MongoDB 初始化失败

这不再表现为 Windows Service 启动超时。检查 `echat.env.ps1` 是否仍包含 `replace-` 占位符；检查 MongoDB URI、服务器到 `10.63.125.3:27018` 的 TCP 连通性；查看事件查看器中 `StartupDataInitializer` 的重试日志。MongoDB 恢复后最多等待下一次重试即可，无需重启服务。

### 页面能打开但消息不实时

确认客户端使用 HTTPS，SignalR 地址为 `wss://域名/hubs/chat`；IIS 已安装并启用 WebSocket Protocol；反向代理没有去掉 WebSocket Upgrade 头；CORS 来源与实际页面域名完全一致。

### MongoDB 登录失败

确认密码中的 `@` 在 URI 中写成 `%40`，认证库为 `admin`，认证机制为 `SCRAM-SHA-1`，MongoDB 账户允许来自 Windows 服务器的连接，并检查 27018 是否为实际监听端口。

### 更新后管理员 TOTP 或历史数据异常

不要更换 `ADMIN_SECRET_ENCRYPTION_KEY`；该密钥用于解密已保存的管理敏感信息。升级前备份环境文件和数据库，先在测试库执行升级，再替换生产程序文件。

## 9. 版本与边界

本发布方案适合单机或小规模 Windows 部署。高并发、跨多实例、实时长连接水平扩展、TURN/SFU、病毒扫描、对象存储和移动推送仍需要单独的生产基础设施设计。消息协议的当前版本包含服务端可见的新消息内容，正式上线前应同步完成访问控制、审计、数据留存/删除和隐私合规评审。
