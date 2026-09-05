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
| 管理后台   | HTML5 响应式四大系统；按 V2 文档实现普通用户隔离、邀请码、日志、交易、Admin、公告、图片和聊天治理 API   | 已完成 0.7.0     |
| 音视频通话 | 单聊与群聊入口、来电、接听、拒接、结束、静音、摄像头控制、持久化通话记录、动态 ICE 配置、SignalR 信令   | 已完成 P1 应用层 |
| 朋友圈     | 好友、仅自己、指定好友、排除好友四种范围，九宫格媒体、点赞、评论、删除与举报                            | 已完成 P1        |

> 当前版本已开放可在应用代码内完成的 P1 能力，但不是已经达到 10 万用户容量目标的生产成品。TURN、SFU、APNs/FCM、转码和病毒扫描属于外部基础设施能力，仍需在生产环境配置相应服务。

### 管理后台 0.7.0

`/admin` 已按新版 7 页需求文档调整为 24 个页面：账户系统只显示普通用户，包含用户、登录/离线日志、失败 IP、意见反馈和八位邀请码；资金系统新增独立交易明细；管理系统仅包含 Admin 管理账号、登录日志、固定权限角色、公告、图片、操作和报错日志；聊天系统包含会话、客服、群管理、群发言、消息机器人、红包机器人和群邀请码。厂商推送、通讯录以及旧版已删除的资源、配置、定时任务和短信页面均不再出现在菜单中。

实名认证与企业认证标签可打开资料详情，支持编辑、审核通过和拒绝；用户分页固定在表格底部，修改邀请码改为选择已创建的八位码。登录、离线、失败 IP、反馈、资金、交易、操作和报错日志均提供筛选/分页；反馈支持批量标记已查看。额度调整使用 `idempotencyKey` 防止重复记账。管理账号严格限定 Admin，并可独立绑定 Google Authenticator；角色权限由 API 固定白名单约束。公告、群发言和机器人人工触发会通过 SignalR 通知在线成员并记录发送日志。抢红包机器人只保存可审计规则，不执行真实资金动作。

用户管理沿用高密度运营表格和按钮锚定两级操作菜单，并在 0.7.0 隔离所有 Admin 账号。图片库支持搜索、分类、标签、编辑和删除；会话/群管理支持服务端筛选分页、密文时间线、后台安全建群、编辑群名称、解散和恢复。后台建群只持久化成员 RSA-OAEP 密钥信封，临时 AES 群密钥生成后立即清零。

## 目录结构

| 路径                                                | 说明                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `Api/`                                              | ASP.NET Core API、SignalR Hub、领域模型与 MongoDB/内存仓库         |
| `Api/Controllers/`                                  | 账号、用户公钥、联系人、会话、媒体、朋友圈和管理接口               |
| `Api.Tests/`                                        | xUnit 核心业务测试                                                 |
| `client/`                                           | React HTML5 响应式客户端                                           |
| `client/src/pages/Admin.tsx`                        | 独立 HTML5 响应式管理后台，按路由懒加载                            |
| `client/src/components/admin/RequirementPanels.tsx` | 后台需求文档专用页面、筛选表格与审核/配置弹窗                      |
| `client/src/lib/echat-crypto.ts`                    | 浏览器端身份密钥、会话密钥和 AES-GCM 消息加解密                    |
| `client/src/lib/echat-media.ts`                     | 富媒体二进制加密、上传、下载和解密                                 |
| `client/src/components/chat/CallManager.tsx`        | WebRTC 音视频通话和 SignalR 信令控制                               |
| `client/src/components/qr/`                         | 二维码生成、摄像头/图片识别、登录确认和扫码名片流程                |
| `scripts/e2e-smoke.sh`                              | 注册、好友、会话、富媒体和朋友圈冒烟测试                           |
| `scripts/signalr-call-smoke.mjs`                    | 双账号通话邀请、接受、信令与结束事件测试                           |
| `scripts/p1-qr-smoke.mjs`                           | 二维码登录、扫码加好友和远程退出设备测试                           |
| `scripts/contact-realtime-smoke.mjs`                | 双账号好友申请、申请人资料和联系人双端实时更新测试                 |
| `scripts/mobile-friend-chat-smoke.mjs`              | 390×844 手机视口好友接受、进入聊天和发送消息测试                   |
| `scripts/unread-clear-smoke.mjs`                    | 390×844 手机与 1280×720 桌面双栏的未读角标、进入清零和实时已读测试 |
| `scripts/admin-smoke.mjs`                           | 四大后台、每账号菜单、24 个 V2 页面及桌面/手机测试                 |
| `scripts/admin-requirements-smoke.mjs`              | 认证、邀请码、日志、交易、TOTP、公告、建群和聊天治理 API 测试      |
| `Dockerfile`                                        | Node 构建前端、.NET 发布后端的多阶段生产镜像                       |

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

使用 MongoDB 的正式生产环境必须设置 `JWT_SECRET`、`ADMIN_BOOTSTRAP_PASSWORD` 和 `ADMIN_SECRET_ENCRYPTION_KEY`，可选用 `ADMIN_BOOTSTRAP_ACCOUNT` 修改管理账号。每个 Admin 账号现在通过“管理账号”页面独立绑定 Google Authenticator，Base32 密钥使用 AES-GCM 加密后保存；`ADMIN_SECRET_ENCRYPTION_KEY` 必须由密钥管理服务注入并保持稳定。未完成独立绑定的旧 Admin 仍可使用 `ADMIN_TOTP_SECRET` 作为迁移回退。普通用户登录不要求 TOTP；持久化生产环境中 Admin 完成密码验证后必须再提交 6 位动态验证码，且不会使用或重置演示默认密码。

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
node scripts/admin-requirements-smoke.mjs http://127.0.0.1:2099
```

`pnpm test` 同时运行前端测试入口和 .NET xUnit 测试。主冒烟脚本使用三账号验证聊天、富媒体、四种朋友圈可见范围与举报；二维码脚本验证生成、扫描、确认、一次性兑换、名片和设备撤销；通话脚本验证邀请、接受、拒接、ICE/SDP、结束、记录和 RTC 配置；管理脚本验证普通用户/Admin 隔离、用户治理、交易明细、图片元数据、每账号菜单、角色权限白名单和全部 24 个 V2 页面。文档专用脚本进一步验证认证审核、八位邀请码选择、增强日志、失败 IP、幂等资金调整、管理员独立 TOTP、公告、后台加密建群、群发言、群邀请码、密文审计边界和五类下线模块。

## 生产部署

`Dockerfile` 会先构建 React 静态资源，再发布 ASP.NET Core 应用，最终由 Kestrel 同时提供 HTML5 前端、REST API 和 SignalR Hub。容器的首个暴露端口为 2099，并继续尊重托管平台注入的 `PORT`。

正式实时通信部署需要支持 WebSocket 长连接、TLS、固定或共享数据存储、滚动发布和连接重建。默认通话使用公共 STUN 与浏览器 P2P；设置 `TURN_URLS`（逗号分隔）和 `TURN_SECRET` 后，`/api/rtc/config` 会为当前用户签发十分钟 TURN 临时凭据。设置 `SFU_URL` 后服务会标记为 `sfu-ready`；没有 SFU 时，服务端限制通话为最多四名参与者。无状态按请求休眠的短时托管环境只能用于演示，不适合作为高并发聊天生产环境。

## 主要接口

| 方法                | 路径                                                                                   | 用途                                            |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| POST                | `/api/auth/register`                                                                   | 邀请码注册                                      |
| POST                | `/api/auth/login`                                                                      | 密码登录                                        |
| POST                | `/api/auth/totp`                                                                       | 管理员 TOTP 验证                                |
| POST                | `/api/auth/refresh`                                                                    | 刷新令牌轮换                                    |
| POST                | `/api/qr/login/start`                                                                  | 生成一次性登录二维码                            |
| POST                | `/api/qr/login/scan`                                                                   | 已登录设备扫描登录二维码                        |
| POST                | `/api/qr/login/approve`                                                                | 确认或拒绝新设备登录                            |
| POST                | `/api/qr/login/status`                                                                 | 登录页查询扫码状态                              |
| POST                | `/api/qr/login/exchange`                                                               | 一次性兑换登录会话                              |
| POST                | `/api/qr/contact/create`                                                               | 生成个人名片二维码                              |
| POST                | `/api/qr/contact/preview`                                                              | 预览扫码名片                                    |
| POST                | `/api/qr/contact/redeem`                                                               | 通过名片发起好友申请                            |
| GET/DELETE          | `/api/devices`                                                                         | 查看或撤销登录设备                              |
| PUT                 | `/api/users/me/public-key`                                                             | 发布当前设备身份公钥                            |
| GET                 | `/api/users/{account}/public-key`                                                      | 获取联系人公钥                                  |
| GET/POST            | `/api/contacts/requests`                                                               | 查询或发起好友申请                              |
| POST                | `/api/contacts/requests/{id}/accept`                                                   | 接受好友申请                                    |
| GET                 | `/api/conversations`                                                                   | 会话列表                                        |
| POST                | `/api/conversations/direct`                                                            | 创建单聊                                        |
| POST                | `/api/conversations/groups`                                                            | 创建群聊                                        |
| GET                 | `/api/conversations/{id}/members`                                                      | 获取通话成员                                    |
| GET/POST            | `/api/conversations/{id}/messages`                                                     | 补拉或发送密文消息                              |
| POST                | `/api/conversations/{id}/messages/{messageId}/recall`                                  | 撤回消息                                        |
| POST                | `/api/conversations/{id}/read/{sequence}`                                              | 更新已读游标                                    |
| POST                | `/api/media`                                                                           | 上传聊天密文或朋友圈媒体                        |
| GET                 | `/api/media/{id}/content`                                                              | 按关系与会话权限获取媒体                        |
| GET/POST            | `/api/moments`                                                                         | 获取好友动态或发布动态                          |
| POST/DELETE         | `/api/moments/{id}/like`                                                               | 点赞或取消点赞                                  |
| POST                | `/api/moments/{id}/comments`                                                           | 发布评论                                        |
| POST                | `/api/moments/{id}/reports`                                                            | 举报动态                                        |
| GET                 | `/api/calls`                                                                           | 通话记录                                        |
| GET                 | `/api/rtc/config`                                                                      | STUN/TURN 与媒体拓扑配置                        |
| GET                 | `/api/p1/capabilities`                                                                 | P1 能力和外部依赖状态                           |
| GET                 | `/api/admin/overview`                                                                  | 管理后台运营与安全概览                          |
| GET/POST            | `/api/admin/users`、`/api/admin/users/{account}/status`                                | 用户查询与状态治理                              |
| POST                | `/api/admin/users/batch`                                                               | 单次批量新增 1–200 个用户                       |
| GET                 | `/api/admin/users/export`                                                              | 按当前筛选条件导出防公式注入 CSV                |
| PUT                 | `/api/admin/users/{account}/profile`                                                   | 修改昵称、手机号、邀请码来源和登录 IP 限制      |
| PUT                 | `/api/admin/users/{account}/security`                                                  | 账号/登录/银行卡锁定、注销、红号、认证和风险值  |
| PUT                 | `/api/admin/users/{account}/password`                                                  | 重置密码并撤销原设备会话                        |
| POST/GET            | `/api/admin/users/{account}/duplicate`、`/api/admin/users/{account}/same-ip`           | 复制用户和同 IP 账号检测                        |
| POST                | `/api/admin/users/{account}/sessions/revoke`                                           | 强制退出目标用户全部设备                        |
| GET/PUT             | `/api/admin/users/{account}/invite-options`、`/api/admin/users/{account}/invite-code`  | 查询并选择用户的八位邀请码                      |
| GET/POST            | `/api/admin/invites`、`/api/admin/invites/generate`                                    | 八位注册邀请码查询、生成和维护                  |
| GET/POST            | `/api/admin/reports`、`/api/admin/reports/{id}/decision`                               | 举报队列与处置                                  |
| GET                 | `/api/admin/audit`                                                                     | 管理操作审计日志                                |
| GET/POST/PUT/DELETE | `/api/admin/modules/{module}`                                                          | 角色、公告、客服、群发言和机器人等保留模块 CRUD |
| GET/POST            | `/api/admin/users/{account}/verifications`、`/api/admin/verifications/{id}/decision`   | 实名与企业认证详情、编辑和审核                  |
| GET/POST/PUT/DELETE | `/api/admin/fund/subjects`、`/api/admin/fund/adjustments`                              | 额度科目、幂等人工调整和分页记录                |
| GET                 | `/api/admin/fund/transactions`                                                         | 按账号、科目、方向和金额筛选交易明细            |
| GET/POST/PUT/DELETE | `/api/admin/operators`、`/api/admin/operators/{account}/totp/*`                        | Admin 管理账号与独立 Google Authenticator 绑定  |
| GET/POST            | `/api/admin/login-logs/search`、`/api/admin/login-failure-ips/*`                       | 分页登录/离线日志、失败 IP 聚合与处置           |
| GET/POST            | `/api/admin/feedback`、`/api/admin/feedback/{id}/decision`、`/api/admin/feedback/seen` | 意见反馈查询、批量已查看、回复与删除            |
| GET/PUT/POST        | `/api/admin/announcements/*`                                                           | 公告查询、编辑、发布、撤回和删除                |
| GET/POST/PUT        | `/api/admin/chat/conversations`、`/api/admin/chat/groups/*`                            | 会话筛选分页、密文时间线、建群与群资料治理      |
| GET/POST            | `/api/admin/group-invites`、`/api/group-invites/redeem`                                | 群邀请码生成、撤销和兑换                        |
| POST                | `/api/admin/automations/{id}/run`                                                      | 人工触发群发言/机器人并生成发送日志             |
| POST/PUT/DELETE     | `/api/admin/images`、`/api/admin/images/{id}`                                          | 后台图片上传、分类标签编辑和删除                |
| WebSocket           | `/hubs/chat`                                                                           | 消息、回执、朋友圈更新与 WebRTC 信令            |
| GET                 | `/api/health`                                                                          | 健康检查                                        |

## 仍需外部基础设施的能力

应用层 P1 已开放。生产上线还需要部署 TURN/SFU、APNs/FCM 或厂商推送、短信供应商、视频转码与病毒扫描服务，并补充多设备密钥验证/轮换、运营审核工作流、MongoDB 副本集、备份恢复、监控告警、安全评审和容量压测。`/api/p1/capabilities` 会明确返回这些外部能力当前是已配置、仅 P2P，还是未配置，避免界面把演示能力误报为生产就绪。
