# E聊

**E聊**是一款面向 PC 与手机浏览器的端到端加密即时通信 MVP。前端采用 React 19、TypeScript、Tailwind CSS 与 HTML5；API 采用 ASP.NET Core 8；实时通信采用 SignalR；生产数据层采用 MongoDB。API 默认监听 **2099** 端口。

## 当前实现范围

| 模块       | 已实现能力                                                                                              | 状态             |
| ---------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| 账号       | 邀请码注册、密码登录、渐进式登录限制、JWT、刷新令牌轮换、服务端会话撤销                                 | 已完成 P1        |
| 二维码     | 两分钟一次性扫码登录、已登录设备确认、七天个人名片、摄像头/图片/粘贴扫码                                | 已完成 P1        |
| 设备管理   | 登录设备列表、设备标识、单设备退出、退出其他设备                                                        | 已完成 P1        |
| 管理登录   | 独立 `/admin` 登录、Admin 角色保护；开发预览密码登录，生产强制 Google Authenticator TOTP                | 已完成           |
| 联系人     | 好友申请、申请人资料、SignalR 实时提醒、接受后双端刷新、未处理数字、删除和黑名单                        | 已完成 P1        |
| 会话       | 单聊、群聊、会话列表、会话成员权限                                                                      | 已完成 MVP       |
| 消息       | SignalR 实时事件、增量补拉、幂等、进入会话立即清零、实时已读回执、旧响应竞态保护、2 分钟撤回            | 已完成 P1        |
| 富媒体     | 图片、视频、文件、浏览器语音录制、25 MB 大小限制、鉴权下载与 Range 响应                                 | 已完成基础版本   |
| 端到端加密 | 浏览器生成 RSA-OAEP 身份密钥；文字及聊天附件使用会话 AES-GCM-256 密钥加密；服务器保存密文和成员密钥信封 | 已完成 MVP       |
| 响应式界面 | PC 三栏布局、手机单栏/详情切换、联系人“发消息”、动态视口、安全区发送栏                                  | 已完成           |
| 管理后台   | HTML5 响应式四大系统；每个账号提供两级操作菜单、功能弹窗和完整账户治理 API                              | 已完成 0.5.2     |
| 音视频通话 | 单聊与群聊入口、来电、接听、拒接、结束、静音、摄像头控制、持久化通话记录、动态 ICE 配置、SignalR 信令   | 已完成 P1 应用层 |
| 朋友圈     | 好友、仅自己、指定好友、排除好友四种范围，九宫格媒体、点赞、评论、删除与举报                            | 已完成 P1        |

> 当前版本已开放可在应用代码内完成的 P1 能力，但不是已经达到 10 万用户容量目标的生产成品。TURN、SFU、APNs/FCM、转码和病毒扫描属于外部基础设施能力，仍需在生产环境配置相应服务。

### 管理后台 0.5.0

`/admin` 已按分组折叠菜单实现以下真实功能：账户系统包括用户、登录/离线日志、失败 IP 统计和意见反馈；资金系统包括额度科目、人工额度调整及交易流水；管理系统包括管理账号、角色、资源、配置、安卓推送通道、公告、图片、审计和报错日志；聊天系统包括会话、客服、任务与日志、群监控、群发、通讯录、短信模板、消息机器人、红包机器人和群邀请码。

额度功能目前是 E聊后台独立台账，不对接外部支付。公告和群发会通过 SignalR 向在线用户发送 `admin.notice`。定时任务支持配置、手工执行和日志；自动按时触发需由生产平台调度器调用，不在可休眠的 Web 容器内运行常驻定时器。短信、安卓厂商推送、机器人资金动作等页面保存可审计配置，实际外发或资金动作仍需配置相应第三方服务并完成安全审批。

用户管理 0.5.2 采用截图同类高密度运营表格，包含用户 ID、双风险值、账号/昵称/手机号、账户/冻结额度、在线与今日上线、三类锁定、注销、实名/企业认证、红号、注册与邀请码来源、注册/密码修改/最后在线时间、最后登录地址、在线/节点 IP、失败次数、设备数和账户状态。每一行账号（包括当前管理账号）都有“操作”入口；一级菜单提供同 IP 检测、修改邀请码、修改昵称、限制登录 IP、状态变更和登录密码，状态变更二级菜单提供强制下线、账户锁定、登录锁定、银行卡锁定、注销和红号。每项操作使用独立弹窗并连接相应 API；危险操作带确认和审计原因，当前管理账号的自锁、自注销及自下线在界面和 API 两层禁止。

## 目录结构

| 路径                                         | 说明                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `Api/`                                       | ASP.NET Core API、SignalR Hub、领域模型与 MongoDB/内存仓库                  |
| `Api/Controllers/`                           | 账号、用户公钥、联系人、会话、媒体、朋友圈和管理接口                        |
| `Api.Tests/`                                 | xUnit 核心业务测试                                                          |
| `client/`                                    | React HTML5 响应式客户端                                                    |
| `client/src/pages/Admin.tsx`                 | 独立 HTML5 响应式管理后台，按路由懒加载                                     |
| `client/src/lib/echat-crypto.ts`             | 浏览器端身份密钥、会话密钥和 AES-GCM 消息加解密                             |
| `client/src/lib/echat-media.ts`              | 富媒体二进制加密、上传、下载和解密                                          |
| `client/src/components/chat/CallManager.tsx` | WebRTC 音视频通话和 SignalR 信令控制                                        |
| `client/src/components/qr/`                  | 二维码生成、摄像头/图片识别、登录确认和扫码名片流程                         |
| `scripts/e2e-smoke.sh`                       | 注册、好友、会话、富媒体和朋友圈冒烟测试                                    |
| `scripts/signalr-call-smoke.mjs`             | 双账号通话邀请、接受、信令与结束事件测试                                    |
| `scripts/p1-qr-smoke.mjs`                    | 二维码登录、扫码加好友和远程退出设备测试                                    |
| `scripts/contact-realtime-smoke.mjs`         | 双账号好友申请、申请人资料和联系人双端实时更新测试                          |
| `scripts/mobile-friend-chat-smoke.mjs`       | 390×844 手机视口好友接受、进入聊天和发送消息测试                            |
| `scripts/unread-clear-smoke.mjs`             | 390×844 手机与 1280×720 桌面双栏的未读角标、进入清零和实时已读测试          |
| `scripts/admin-smoke.mjs`                    | 四大后台、每账号两级菜单/弹窗/治理 API、12 类模块、30 个页面及桌面/手机测试 |
| `Dockerfile`                                 | Node 构建前端、.NET 发布后端的多阶段生产镜像                                |

## 本地运行

环境需要 Node.js 22、pnpm 和 .NET 8 SDK。开发模式默认使用内存仓库并自动提供测试邀请码 `ECHAT2026`。

```bash
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:2099`，管理后台位于 `http://localhost:2099/admin`。开发模式以及未配置 MongoDB 的临时发布演示会创建默认管理账号 `E_Admin`（登录时大小写不敏感，实际标准化为 `e_admin`），初始密码为 `Heibai@99`。如果临时预览数据中已存在同名普通用户、旧密码、停用或锁定状态，启动时会自动恢复；管理登录页还提供“一键预览管理员登录”，避免手工输入差异。配置 MongoDB 后会自动切换到正式安全策略，不再使用或恢复默认密码。如需更换本地端口，可设置 `ECHAT_PORT`。

## MongoDB 配置

设置 `MONGODB_URI` 后，API 会自动使用 MongoDB 仓库；未设置时仅使用进程内存，服务重启后测试数据会消失。生产环境还应设置数据库名称和首次邀请码。

```bash
export MONGODB_URI='mongodb://localhost:27017'
export MONGODB_DATABASE='echat'
export SEED_INVITE_CODE='your-first-invite'
```

MongoDB 初始化会创建账号唯一索引、发送者与客户端消息号唯一索引，以及会话序号唯一索引。

## 媒体存储

在 Manus 托管环境中，API 使用系统注入的对象存储签名服务：文件先由 ASP.NET Core 获取预签名地址，再直接写入对象存储；数据库只保存资产元数据和存储键。聊天附件在浏览器中使用会话密钥加密后上传，图片、视频、语音和文件的原始字节不会以明文写入对象存储。朋友圈媒体为好友权限控制内容，不使用会话端到端加密。

没有对象存储配置时，开发模式会回退到 `Api/.media/` 本地目录，便于离线调试；该回退不适合多实例或无持久磁盘的生产环境。单个文件当前限制为 25 MB。

## 安全配置

使用 MongoDB 的正式生产环境必须设置 `JWT_SECRET`、`ADMIN_BOOTSTRAP_PASSWORD` 和 `ADMIN_TOTP_SECRET`，可选用 `ADMIN_BOOTSTRAP_ACCOUNT` 修改管理账号。`ADMIN_TOTP_SECRET` 使用 Base32 编码，可直接录入 Google Authenticator。普通用户登录不要求 TOTP；持久化生产环境中角色为 `Admin` 的账号完成密码验证后，必须再提交 6 位动态验证码，且不会使用或重置演示默认密码。

浏览器私钥以不可导出的 `CryptoKey` 保存到 IndexedDB。会话正文及聊天附件在浏览器使用 AES-GCM-256 加密后再发送。每个会话密钥通过成员 RSA-OAEP 公钥分别封装。服务端只保存密文、随机数、算法标识、媒体资产编号与成员密钥信封。

二维码登录采用两组独立随机令牌：二维码中只包含扫描令牌，桌面只保存轮询令牌；扫码设备必须显示目标设备并主动确认，授权结果只能兑换一次且两分钟后过期。个人名片码不含密码，可在七天内用于预览公开资料并发起好友申请。

当前加密模型适合 MVP/P1 基线，但生产版仍需补充设备级独立密钥、密钥验证、换机恢复、群成员变更后的密钥更新和安全审计。不要把当前实现宣传为已经过第三方密码学审计的安全通信协议。

## 构建与测试

```bash
pnpm check
pnpm test
pnpm build
./scripts/e2e-smoke.sh http://127.0.0.1:2099
node scripts/signalr-call-smoke.mjs http://127.0.0.1:2099
node scripts/p1-qr-smoke.mjs http://127.0.0.1:2099
node scripts/contact-realtime-smoke.mjs http://127.0.0.1:2099
node scripts/mobile-friend-chat-smoke.mjs http://127.0.0.1:2099
node scripts/unread-clear-smoke.mjs http://127.0.0.1:2099
node scripts/admin-smoke.mjs http://127.0.0.1:2099
```

`pnpm test` 同时运行前端测试入口和 .NET xUnit 测试。主冒烟脚本使用三账号验证聊天、富媒体、四种朋友圈可见范围与举报；二维码脚本验证生成、扫描、确认、一次性兑换、名片和设备撤销；通话脚本验证邀请、接受、拒接、ICE/SDP、结束、记录和 RTC 配置；管理脚本验证默认管理员、普通用户 403 隔离、用户治理、登录统计、意见反馈、额度台账、管理账号、12 类模块配置、会话/通讯录、群发、图片上传、审计日志以及全部 30 个页面。

## 生产部署

`Dockerfile` 会先构建 React 静态资源，再发布 ASP.NET Core 应用，最终由 Kestrel 同时提供 HTML5 前端、REST API 和 SignalR Hub。容器的首个暴露端口为 2099，并继续尊重托管平台注入的 `PORT`。

正式实时通信部署需要支持 WebSocket 长连接、TLS、固定或共享数据存储、滚动发布和连接重建。默认通话使用公共 STUN 与浏览器 P2P；设置 `TURN_URLS`（逗号分隔）和 `TURN_SECRET` 后，`/api/rtc/config` 会为当前用户签发十分钟 TURN 临时凭据。设置 `SFU_URL` 后服务会标记为 `sfu-ready`；没有 SFU 时，服务端限制通话为最多四名参与者。无状态按请求休眠的短时托管环境只能用于演示，不适合作为高并发聊天生产环境。

## 主要接口

| 方法                | 路径                                                                         | 用途                                                                   |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| POST                | `/api/auth/register`                                                         | 邀请码注册                                                             |
| POST                | `/api/auth/login`                                                            | 密码登录                                                               |
| POST                | `/api/auth/totp`                                                             | 管理员 TOTP 验证                                                       |
| POST                | `/api/auth/refresh`                                                          | 刷新令牌轮换                                                           |
| POST                | `/api/qr/login/start`                                                        | 生成一次性登录二维码                                                   |
| POST                | `/api/qr/login/scan`                                                         | 已登录设备扫描登录二维码                                               |
| POST                | `/api/qr/login/approve`                                                      | 确认或拒绝新设备登录                                                   |
| POST                | `/api/qr/login/status`                                                       | 登录页查询扫码状态                                                     |
| POST                | `/api/qr/login/exchange`                                                     | 一次性兑换登录会话                                                     |
| POST                | `/api/qr/contact/create`                                                     | 生成个人名片二维码                                                     |
| POST                | `/api/qr/contact/preview`                                                    | 预览扫码名片                                                           |
| POST                | `/api/qr/contact/redeem`                                                     | 通过名片发起好友申请                                                   |
| GET/DELETE          | `/api/devices`                                                               | 查看或撤销登录设备                                                     |
| PUT                 | `/api/users/me/public-key`                                                   | 发布当前设备身份公钥                                                   |
| GET                 | `/api/users/{account}/public-key`                                            | 获取联系人公钥                                                         |
| GET/POST            | `/api/contacts/requests`                                                     | 查询或发起好友申请                                                     |
| POST                | `/api/contacts/requests/{id}/accept`                                         | 接受好友申请                                                           |
| GET                 | `/api/conversations`                                                         | 会话列表                                                               |
| POST                | `/api/conversations/direct`                                                  | 创建单聊                                                               |
| POST                | `/api/conversations/groups`                                                  | 创建群聊                                                               |
| GET                 | `/api/conversations/{id}/members`                                            | 获取通话成员                                                           |
| GET/POST            | `/api/conversations/{id}/messages`                                           | 补拉或发送密文消息                                                     |
| POST                | `/api/conversations/{id}/messages/{messageId}/recall`                        | 撤回消息                                                               |
| POST                | `/api/conversations/{id}/read/{sequence}`                                    | 更新已读游标                                                           |
| POST                | `/api/media`                                                                 | 上传聊天密文或朋友圈媒体                                               |
| GET                 | `/api/media/{id}/content`                                                    | 按关系与会话权限获取媒体                                               |
| GET/POST            | `/api/moments`                                                               | 获取好友动态或发布动态                                                 |
| POST/DELETE         | `/api/moments/{id}/like`                                                     | 点赞或取消点赞                                                         |
| POST                | `/api/moments/{id}/comments`                                                 | 发布评论                                                               |
| POST                | `/api/moments/{id}/reports`                                                  | 举报动态                                                               |
| GET                 | `/api/calls`                                                                 | 通话记录                                                               |
| GET                 | `/api/rtc/config`                                                            | STUN/TURN 与媒体拓扑配置                                               |
| GET                 | `/api/p1/capabilities`                                                       | P1 能力和外部依赖状态                                                  |
| GET                 | `/api/admin/overview`                                                        | 管理后台运营与安全概览                                                 |
| GET/POST            | `/api/admin/users`、`/api/admin/users/{account}/status`                      | 用户查询与状态治理                                                     |
| POST                | `/api/admin/users/batch`                                                     | 单次批量新增 1–200 个用户                                              |
| GET                 | `/api/admin/users/export`                                                    | 按当前筛选条件导出防公式注入 CSV                                       |
| PUT                 | `/api/admin/users/{account}/profile`                                         | 修改昵称、手机号、邀请码来源和登录 IP 限制                             |
| PUT                 | `/api/admin/users/{account}/security`                                        | 账号/登录/银行卡锁定、注销、红号、认证和风险值                         |
| PUT                 | `/api/admin/users/{account}/password`                                        | 重置密码并撤销原设备会话                                               |
| POST/GET            | `/api/admin/users/{account}/duplicate`、`/api/admin/users/{account}/same-ip` | 复制用户和同 IP 账号检测                                               |
| POST                | `/api/admin/users/{account}/sessions/revoke`                                 | 强制退出目标用户全部设备                                               |
| GET/POST            | `/api/admin/invites`                                                         | 查询和维护邀请码                                                       |
| GET/POST            | `/api/admin/reports`、`/api/admin/reports/{id}/decision`                     | 举报队列与处置                                                         |
| GET                 | `/api/admin/audit`                                                           | 管理操作审计日志                                                       |
| GET/POST/PUT/DELETE | `/api/admin/modules/{module}`                                                | 科目、角色、资源、配置、推送、公告、客服、任务、短信、机器人和群邀请码 |
| GET                 | `/api/admin/login-logs`、`/api/admin/login-failure-stats`                    | 登录日志和失败 IP 聚合                                                 |
| POST                | `/api/admin/feedback/{id}/decision`                                          | 意见反馈处理                                                           |
| GET/POST            | `/api/admin/wallets`、`/api/admin/wallet/adjust`                             | 额度台账和人工调整                                                     |
| GET/POST            | `/api/admin/operators`                                                       | 管理账号查询与创建                                                     |
| GET/POST            | `/api/admin/conversations`、`/api/admin/conversations/{id}/action`           | 会话查询与群聊治理                                                     |
| GET                 | `/api/admin/contacts`                                                        | 全局通讯录关系查询                                                     |
| POST                | `/api/admin/bulk-messages`                                                   | SignalR 在线群发通知                                                   |
| POST                | `/api/admin/tasks/{id}/run`                                                  | 手工执行后台任务并生成日志                                             |
| POST                | `/api/admin/images`                                                          | 后台运营图片上传                                                       |
| WebSocket           | `/hubs/chat`                                                                 | 消息、回执、朋友圈更新与 WebRTC 信令                                   |
| GET                 | `/api/health`                                                                | 健康检查                                                               |

## 仍需外部基础设施的能力

应用层 P1 已开放。生产上线还需要部署 TURN/SFU、APNs/FCM 或厂商推送、短信供应商、视频转码与病毒扫描服务，并补充多设备密钥验证/轮换、运营审核工作流、MongoDB 副本集、备份恢复、监控告警、安全评审和容量压测。`/api/p1/capabilities` 会明确返回这些外部能力当前是已配置、仅 P2P，还是未配置，避免界面把演示能力误报为生产就绪。
