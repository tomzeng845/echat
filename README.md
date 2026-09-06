# E聊

**E聊**是一款面向 PC、手机浏览器、Android 与 iOS 的即时通信 MVP。前端采用 React 19、TypeScript、Tailwind CSS 与 HTML5；移动端使用 Capacitor 8 原生容器；API 采用 ASP.NET Core 8；实时通信采用 SignalR；生产数据层采用 MongoDB。API 默认监听 **2099** 端口。

## 当前实现范围

| 模块        | 已实现能力                                                                                        | 状态                                          |
| ----------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 账号        | 邀请码注册、密码登录、渐进式登录限制、JWT、刷新令牌轮换、服务端会话撤销                           | 已完成 P1                                     |
| 二维码      | 两分钟一次性扫码登录、已登录设备确认、七天个人名片、摄像头/图片/粘贴扫码                          | 已完成 P1                                     |
| 设备管理    | 登录设备列表、设备标识、单设备退出、退出其他设备                                                  | 已完成 P1                                     |
| 管理登录    | 独立 `/admin` 登录、Admin 角色保护；开发预览密码登录，生产强制 Google Authenticator TOTP          | 已完成                                        |
| 联系人      | 好友申请、申请人资料、SignalR 实时提醒、接受后双端刷新、未处理数字、删除和黑名单                  | 已完成 P1                                     |
| 会话        | 单聊、群聊、会话列表、会话成员权限                                                                | 已完成 MVP                                    |
| 消息        | SignalR 实时事件、明文文字/表情存储、增量补拉、幂等、实时已读、竞态保护和 2 分钟撤回              | 已完成 0.9.0                                  |
| 富媒体      | 图片、视频、文件、浏览器语音录制、原文件鉴权存储、25 MB 限制与 Range 响应                         | 已完成 0.9.0                                  |
| 历史兼容    | 协议切换前的 RSA-OAEP/AES-GCM 消息和附件仍可由原设备解密；新消息不再加密                          | 已完成 0.9.0                                  |
| 响应式界面  | PC 三栏布局、手机单栏/详情切换、联系人“发消息”、动态视口、安全区发送栏                            | 已完成                                        |
| 管理后台    | HTML5 四大系统；图文反馈、固定五角色中文权限、用户/Admin 日志隔离及明文聊天记录                   | 已完成 0.9.0                                  |
| 登录地区    | HTTPS GeoIP、中文国家/省州/城市、24 小时缓存；用户、登录/离线、操作和报错日志统一显示真实推断地区 | 已完成 0.7.1                                  |
| Android APP | Capacitor 8、表情消息、鸿蒙兼容后台来电、原生 SignalR 服务、媒体权限和系统栏安全区                | 已完成 0.9.0                                  |
| iOS APP     | Capacitor 8、APNs、PushKit、CallKit、相机/麦克风、后台音频及安全区                                | 源码就绪，待 Apple 签名与 TestFlight 真机验收 |
| 消息推送    | Android FCM、本地通知；iOS APNs alert 与 VoIP push；消息通知不含聊天正文                          | 双平台应用层已完成                            |
| 音视频通话  | 后台原生来电通知、呼出等待铃声、双向音频、听筒/扬声器、静音、摄像头、记录、ICE 与 SignalR 信令    | 已完成 P1 应用层                              |
| 朋友圈      | 好友、仅自己、指定好友、排除好友四种范围，九宫格媒体、点赞、评论、删除与举报                      | 已完成 P1                                     |

> 当前版本已开放可在应用代码内完成的 P1 能力，但不是已经达到 10 万用户容量目标的生产成品。Android 音视频后台来电不依赖 FCM；APP 被系统完全终止后的普通消息可靠推送仍需项目方配置 Firebase。iOS 源码已接入 APNs、PushKit 与 CallKit，但没有 Apple 账号、签名和 macOS Xcode 环境时不能宣称已上传或通过 TestFlight。TURN、SFU、转码和病毒扫描也属于生产环境外部基础设施。

### 管理后台 0.9.0

`/admin` 已按本轮需求文档继续调整 24 个页面：意见反馈支持管理员新增文字与最多 6 张图片；角色管理固定为超级管理员、运营管理员、财务管理员、审计员、客服五类，角色和权限均以中文下拉选择；账户系统登录日志只显示普通用户，管理系统登录日志只显示后台角色；会话详情直接展示协议切换后的明文聊天记录，并明确区分历史密文。

实名认证与企业认证标签可打开资料详情，支持编辑、审核通过和拒绝；用户分页固定在表格底部，修改邀请码改为选择已创建的八位码。登录、离线、失败 IP、反馈、资金、交易、操作和报错日志均提供筛选/分页；反馈支持批量标记已查看。额度调整使用 `idempotencyKey` 防止重复记账。管理账号严格限定 Admin，并可独立绑定 Google Authenticator；角色权限由 API 固定白名单约束。公告、群发言和机器人人工触发会通过 SignalR 通知在线成员并记录发送日志。抢红包机器人只保存可审计规则，不执行真实资金动作。

用户管理沿用高密度运营表格和按钮锚定两级操作菜单，并隔离所有后台角色账号。图片库支持搜索、分类、标签、编辑和删除；会话/群管理支持服务端筛选分页、明文新消息与历史密文时间线、后台建群、编辑群名称、解散和恢复。0.7.1 接入 GeoIP 后，用户管理“最后登录地址”和登录、离线、操作、报错日志的“地址”列显示同一份国家/省州/城市结果；后台首页同时显示 GeoIP 提供方与缓存数量。

## 目录结构

| 路径                                                               | 说明                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Api/`                                                             | ASP.NET Core API、SignalR Hub、领域模型与 MongoDB/内存仓库         |
| `Api/Controllers/`                                                 | 账号、用户公钥、联系人、会话、媒体、朋友圈和管理接口               |
| `Api/GeoIpService.cs`                                              | GeoIP HTTPS 查询、私网识别、超时、缓存与失败降级                   |
| `Api/PushNotificationService.cs`                                   | FCM HTTP v1 消息、好友申请和来电推送                               |
| `Api/ApnsNotificationService.cs`                                   | APNs HTTP/2、ES256 provider token、alert 与 VoIP push              |
| `Api.Tests/`                                                       | xUnit 核心业务测试                                                 |
| `client/`                                                          | React HTML5 响应式客户端                                           |
| `client/src/pages/Admin.tsx`                                       | 独立 HTML5 响应式管理后台，按路由懒加载                            |
| `client/src/components/admin/RequirementPanels.tsx`                | 后台需求文档专用页面、筛选表格与审核/配置弹窗                      |
| `client/src/lib/echat-crypto.ts`                                   | 协议切换前历史密文的设备端兼容解密                                 |
| `client/src/lib/echat-media.ts`                                    | 新媒体原文件上传/下载及历史加密附件兼容读取                        |
| `client/src/lib/emoji.ts`                                          | 表情分类、中文/英文搜索和最近使用记录                              |
| `client/src/components/chat/EmojiPicker.tsx`                       | PC/手机响应式表情选择、搜索与即时发送面板                          |
| `client/src/components/chat/CallManager.tsx`                       | WebRTC 音视频通话和 SignalR 信令控制                               |
| `client/src/components/qr/`                                        | 二维码生成、摄像头/图片识别、登录确认和扫码名片流程                |
| `client/src/lib/mobile-native.ts`                                  | Android/iOS 推送、提示音、通知深链、媒体权限与通话音频路由原生桥   |
| `android/`                                                         | Capacitor 8 Android Studio/Gradle 原生工程                         |
| `ios/`                                                             | Capacitor 8 Xcode 工程、APNs、PushKit、CallKit 与隐私清单          |
| `android/app/src/main/java/com/echat/app/CallListenerService.java` | Android 原生 SignalR 后台来电前台服务                              |
| `capacitor.config.ts`                                              | Android 应用、System Bars 安全区与前台通知配置                     |
| `scripts/e2e-smoke.sh`                                             | 注册、好友、会话、表情、富媒体和朋友圈冒烟测试                     |
| `scripts/signalr-call-smoke.mjs`                                   | 双账号通话邀请、接受、信令与结束事件测试                           |
| `scripts/p1-qr-smoke.mjs`                                          | 二维码登录、扫码加好友和远程退出设备测试                           |
| `scripts/contact-realtime-smoke.mjs`                               | 双账号好友申请、申请人资料和联系人双端实时更新测试                 |
| `scripts/mobile-friend-chat-smoke.mjs`                             | 390×844 手机聊天、表情搜索/发送、面板布局和通话控件测试            |
| `scripts/unread-clear-smoke.mjs`                                   | 390×844 手机与 1280×720 桌面双栏的未读角标、进入清零和实时已读测试 |
| `scripts/admin-smoke.mjs`                                          | 四大后台、每账号菜单、24 个 V2 页面及桌面/手机测试                 |
| `scripts/admin-requirements-smoke.mjs`                             | 认证、邀请码、日志、交易、TOTP、公告、建群和聊天治理 API 测试      |
| `scripts/geoip-smoke.mjs`                                          | 真实公网 IP 地区、用户地址、登录日志和缓存端到端测试               |
| `scripts/android-push-smoke.mjs`                                   | Android 推送设备注册、状态、停用和 health API 测试                 |
| `scripts/android-safe-area-smoke.mjs`                              | 刘海屏与底部系统导航栏 inset 布局测试                              |
| `scripts/plaintext-message-smoke.mjs`                              | 明文文字、表情、原文件媒体和后台可见性专项测试                     |
| `scripts/legacy-e2ee-compat-smoke.mjs`                             | 协议切换前历史密文的设备解密兼容测试                               |
| `scripts/android-call-audio-smoke.mjs`                             | 双端音轨、接听去重、扬声器与呼出等待铃声测试                       |
| `scripts/android-call-listener-smoke.mjs`                          | 受限令牌、后台来电路由、重连补发与清理事件测试                     |
| `scripts/ios-push-smoke.mjs`                                       | iOS alert/VoIP token 共存、平台校验和整设备停用测试                |
| `scripts/validate-ios-project.py`                                  | iOS plist、签名设置、隐私清单、资源和原生桥静态检查                |
| `scripts/ios-testflight.sh`                                        | macOS Xcode Archive、校验和 TestFlight 上传自动化                  |
| `scripts/generate-android-alert-sounds.py`                         | 可重复生成消息、来电和呼出等待铃声资源                             |
| `Dockerfile`                                                       | Node 构建前端、.NET 发布后端的多阶段生产镜像                       |

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

## GeoIP 登录地区

默认通过 [ipwho.is](https://ipwho.is/) 的 HTTPS 接口查询公网 IP，保存中文国家、省州和城市，不保存经纬度、邮编或精确住址。成功结果缓存 24 小时，失败结果缓存 5 分钟；本机、内网、链路本地和保留地址不会发送给第三方。第三方超时或不可用时会降级显示原始公网 IP，注册和登录仍可继续。

```bash
export GeoIp__Enabled=true
export GeoIp__UrlTemplate='https://ipwho.is/{ip}?lang=zh-CN'
export GeoIp__TimeoutMs=6000
export GeoIp__CacheHours=24
export GeoIp__FailureCacheMinutes=5
```

IP 地理位置是近似区域，不能用于识别具体住址或作为唯一风控结论。高并发或商业生产环境应确认第三方服务条款，或切换到持续更新的 [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/) 本地数据库方案。

## Android APP 与消息推送

Android 客户端使用 Capacitor 8 打包本地 React 资源，默认连接 `https://echatapp-favrlscm.manus.space`。REST、刷新令牌和 SignalR 均通过同一可配置 HTTPS 地址工作。构建环境需要 Node.js 22、JDK 21、Android SDK 36 与 Build Tools 36；也可以直接使用最新版 Android Studio 打开 `android/`。

```bash
# 可选：改为自己的 E聊 API 域名
export ECHAT_ANDROID_API_URL='https://chat.example.com'

# 同步 Web 资源和原生插件
pnpm android:sync

# 生成测试用 debug APK
pnpm android:apk

# 正式签名变量必须由密码管理器或 CI Secret 注入
export ECHAT_ANDROID_KEYSTORE='/secure/path/echat-release.jks'
export ECHAT_ANDROID_STORE_PASSWORD='***'
export ECHAT_ANDROID_KEY_ALIAS='echat_release'
export ECHAT_ANDROID_KEY_PASSWORD='***'

# 生成并校验正式 AAB 与 APK
pnpm android:release
```

debug APK 输出在 `android/app/build/outputs/apk/debug/app-debug.apk`。正式构建输出 `releases/EChat-0.9.0-release.apk` 和 `releases/EChat-0.9.0-release.aab`；APK 使用独立 RSA 4096 位发布证书并通过 v2/v3 签名和 16 KB 对齐验证，AAB 已通过 Google bundletool 校验。此前安装的 debug 版证书不同，首次切换正式版必须先卸载 debug 版；之后只要持续使用同一发布密钥并递增 `versionCode` 即可覆盖升级。完整密钥保管、商店发布和校验说明见 `android-release-signing.md`。

Android 13 及以上会在登录后请求系统通知权限，用于 FCM 或本地后台通知。0.8.1 修复了缺少 `google-services.json` 时登录后自动调用 Firebase、导致部分手机闪退的问题：未配置时完全跳过 FCM 初始化。扫码只请求摄像头，语音录制只请求麦克风，视频通话请求摄像头和麦克风。Capacitor System Bars 把正确的 display cutout、状态栏和底部手势/三键导航栏 inset 注入 CSS；根布局、聊天发送栏和移动底部菜单均在安全区内显示，不会与刘海或系统菜单重叠。

0.8.2 将账号单一公钥升级为设备级公钥与版本化会话密钥。APP 首次打开旧会话而无法解开原信封时，会为所有成员当前登记设备生成下一版本信封；旧消息继续由持有旧密钥的原设备解密，新消息由 APP、原设备和好友设备共同解密。旧历史消息不会把通用“消息解密失败”误报为发送失败，而会明确提示该消息早于本设备加入会话。发送者自身的 SignalR 回显也会被本地成功解密结果替换。

0.8.3 为每次会话密钥轮换保存独立的版本化设备信封。登录后先发布当前设备公钥，再加载会话并启动 SignalR，避免同一设备重装后用旧公钥提前轮换。新消息先于会话列表刷新到达、或当前版本本地密钥暂时缺失时，APP 会按消息的 `keyVersion` 获取当前设备信封、导入并保存密钥，然后再解密；不会再把刚收到的新消息误判为“本设备加入加密会话之前”。确实没有为该设备生成历史信封的旧消息仍保留该提示，这是端到端加密的预期边界。

0.8.4 进一步处理升级遗留的“版本号正确但密钥内容错误”缓存：会话初始化会实际使用当前设备 RSA 私钥验证服务器信封，不能解封时自动轮换；消息首次解密失败会强制重新获取对应版本设备信封并重试。发送文字、图片、文件、语音或视频前也会先以服务器当前设备信封校准本地密钥，避免发送后自己或好友看到加密会话旧设备提示。

0.8.5 加入 Capacitor Local Notifications 回退。APP 切换到后台但进程仍保留 SignalR 连接时，新消息和音视频来电会立即写入 Android 通知栏；消息使用 `messages-v2` 频道，来电使用 `calls-v2` 高优先级频道，点击通知可回到对应会话。个人中心会显示“后台通知已开启”。如果 APP 被系统完全挂起、强制停止或杀死，本地代码无法再接收 SignalR，此时仍必须配置 FCM 才能可靠送达。

0.8.6 将音视频来电从 WebView 生命周期中独立出来。登录后，APP 获取一个与当前登录会话和设备绑定、有效期七天的只读 `call_listener` 令牌，并启动 Android `remoteMessaging` 前台服务；服务使用 Microsoft SignalR Java 客户端维持独立 WebSocket、断线分级重连，并通过低优先级常驻通知说明“E聊正在接收来电”。WebView 被暂停或普通进程被系统回收时，服务仍可收到 `call.invited`，播放循环铃声并显示高优先级通知；点击通知恢复会话和来电界面，接听、拒绝、对方结束或本机结束都会清除通知与铃声。退出账号或登录会话失效时服务停止。

0.8.7 修复接听后的原生“清除来电通知”事件被误当成“结束通话”的状态机错误；接听状态会先切换为 `answering/connected`，清理通知与来电铃声不会关闭已经建立的 WebRTC，因此不会再次弹出同一通来电，接听后远端音轨可继续播放。原生来电待处理缓存也按 `callId` 同步消费和清除。拨打语音或视频电话后会循环播放独立的 `echat_ringback.wav` 等待音，对方接听、拒绝、挂断或呼叫失败时立即停止。

0.8.8 在用户点击接听后、请求摄像头/麦克风之前先调用 `CallPrepareAnswer`。服务端立即记录当前账号正在接听并清除原生来电通知；原生监听连接此时重连不会再补发同一 `callId`。Android `:calls` 进程同时保存两分钟清理墓碑，拦截鸿蒙跨进程广播、通知 Intent、SharedPreferences 或 Capacitor 迟到事件造成的重复来电。远端音频/视频在 `loadedmetadata`、`canplay` 及多个延迟点主动重试播放，显式设置未静音和完整音量；音轨到达及接通后再次应用听筒/扬声器通信路由。呼出等待音在原生层明确切到扬声器播放。

0.8.9 把输入栏中的表情占位按钮替换为真实表情消息功能。面板提供最近使用、笑脸、手势、动物、食物、活动、旅行、物品和符号分类，并支持中文或英文关键词搜索；手机端打开面板时不会主动弹出系统键盘。点击表情后以独立 `Emoji` 类型立即发送，表情字符与普通文字一样先用当前版本 AES-GCM 会话密钥加密，服务端和通知载荷不保存或泄露明文。聊天气泡使用大号无底色样式，会话列表显示“[表情]”，后台通知只显示“发来一个表情”。

0.9.0 按后台需求文档把**新发送**的文字、表情和富媒体消息切换为明文协议：文字和表情直接保存在消息记录中，图片、文件、语音和视频以原文件写入受鉴权媒体存储，后台会话详情可直接查看内容。协议切换前的 AES-GCM 消息与加密附件继续保留设备端兼容读取，不会批量解密或改写历史数据。该改动降低了消息内容的密码学保密等级，生产环境必须依赖 TLS、严格鉴权、最小权限后台访问和数据库/对象存储访问控制。

针对仍支持 Android APK 的华为/荣耀鸿蒙设备，0.8.7 把常驻来电服务移入 `:calls` 独立进程，持有受控局部唤醒锁，设置 15 秒 SignalR keepalive，并在监听连接重建后补发 90 秒内仍处于振铃状态的来电。首次登录会请求允许 E聊忽略电池优化；个人中心“后台来电”会显示授权状态，授权后再次点击可打开厂商“应用启动管理”。请把 E聊改为**手动管理**，开启**允许自启动、关联启动和后台运行**，并保持“休眠时始终保持网络连接”。纯原生 HarmonyOS NEXT 不支持安装 Android APK，需要单独开发 ArkTS/HAP 客户端。

`call_listener` 令牌不能访问普通 REST API，也不能调用已读、邀请、接听、拒绝、信令或结束等 Hub 方法；连接只加入当前用户组，不订阅聊天密文。Android **强制停止**应用会按系统规则禁止任何后台组件运行，必须由用户重新打开 APP；鸿蒙/华为的系统级启动管理也必须由用户明确允许，应用不能静默绕过。普通消息在 APP 进程被完全终止后的可靠通知仍需 FCM，但音视频后台来电不依赖 Firebase。

Android 通话进入 `MODE_IN_COMMUNICATION` 并申请临时音频焦点；Android 12 及以上使用通信设备 API 在听筒与扬声器间切换，旧版本使用 speakerphone 路由。语音通话显式挂载远端 `audio`，视频通话在远端 `video` 就绪后主动播放；控制栏新增“打开/关闭扬声器”按钮。语音默认听筒，视频默认扬声器，结束通话后恢复系统普通音频模式。

APP 在前台通过 SignalR 收到其他账号的新消息时播放短提示音；收到语音或视频来电时循环播放来电铃声，并在接听、拒绝、对方挂断或本机挂断时停止。前台 SignalR、后台本地通知与 FCM 以消息编号或通话编号去重，避免同一事件响两次。后台通知分别使用 `messages-v2` 与 `calls-v2` 声音频道；Android 通知频道设置可由用户在系统设置中单独关闭或调整。

FCM 正式启用需要在 [Firebase 控制台](https://console.firebase.google.com/) 创建与包名 `com.echat.app` 对应的 Android 应用，把客户端 `google-services.json` 放到 `android/app/google-services.json`，再执行 `pnpm android:sync` 和 APK/AAB 构建。该文件和签名密钥已被 Git 忽略。服务端通过秘密变量配置，不要把服务账号 JSON 写入仓库：

```bash
export FCM_PROJECT_ID='your-firebase-project-id'
export FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
# 或设置 GOOGLE_APPLICATION_CREDENTIALS 指向只在服务端存在的服务账号文件
```

服务端使用 FCM HTTP v1 OAuth 短期令牌发送高优先级通知。消息与来电分别指定内置短提示音和来电铃声；通知载荷只包含事件类型、会话/消息编号和“发来一条消息/表情/图片/语音/视频/文件”等通用摘要，不直接携带聊天正文。点击通知后，APP 再从鉴权 API 获取消息。没有 Firebase 配置时，前台 SignalR 提示音和进程存活期间的后台本地通知仍可使用，个人中心显示“后台通知已开启”；被系统挂起或杀死后的可靠通知仍需要 FCM。

## iOS APP、APNs 与 TestFlight

iOS 客户端位于 `ios/`，Bundle ID 为 `com.tomzeng845.echat`，版本为 `0.9.0 (18)`，最低系统版本为 iOS 15。Android 继续使用已发布包名 `com.echat.app`，两端标识相互独立。工程已包含 1024×1024 App Store 图标、启动图、相机/麦克风/相册权限说明、`audio`/`remote-notification`/`voip` 后台模式、APNs entitlement 和 Apple 隐私清单。普通消息、好友申请与推送测试使用 APNs alert；真实音视频邀请才使用 PushKit VoIP push，并立即报告给 CallKit。用户在系统来电界面接听时会恢复 WebRTC 接听流程，拒接、远端接听或挂断会按 `callId` 清理其他 iOS 设备上的系统来电。

Linux 可以同步和静态验证 iOS 工程，但不能运行 Xcode Archive、Apple 签名、上传或真机 CallKit 测试。Team `PPY8H6QWB5` 已注册 `com.tomzeng845.echat` 显式 App ID 并开启 Push Notifications；Apple Distribution 证书与 `EChat App Store 2026` production profile 已创建并验证。签名 IPA 由私有仓库 `tomzeng845/echat` 的 GitHub-hosted macOS 26 workflow 生成；App Store Connect 应用记录、APNs Key、TestFlight 上传和真机验收仍需后续完成。

```bash
# Linux/macOS 均可执行的源码检查与资源同步
python3 scripts/validate-ios-project.py
pnpm ios:sync

# 仅 macOS：在 Xcode 中人工设置团队、签名并真机调试
pnpm ios:open

# 仅 macOS：自动 Archive、导出、validate 和上传 TestFlight
export APPLE_TEAM_ID='你的十位 Team ID'
export APP_STORE_CONNECT_KEY_ID='你的十位 API Key ID'
export APP_STORE_CONNECT_ISSUER_ID='你的 Issuer UUID'
export APP_STORE_CONNECT_API_KEY_PATH='/安全目录/AuthKey_xxx.p8'
pnpm ios:testflight
```

发布脚本还支持 `ECHAT_IOS_API_URL`、`ECHAT_IOS_BUNDLE_ID`、`ECHAT_IOS_VERSION` 和唯一的 `ECHAT_IOS_BUILD_NUMBER`。脚本只从环境和项目外文件读取凭据，复制到 Apple CLI 约定目录的临时私钥会在结束时删除；`.p8`、证书、provisioning profile、Archive 和 IPA 不进入源码仓库。推荐在受控 Mac 上执行该脚本；人工 Xcode Organizer/Transporter 是同等可行的低自动化回退方案。

仓库现在还包含手工触发的 `.github/workflows/ios-ipa.yml`。它固定使用 GitHub-hosted `macos-26`、Apple Distribution `.p12` 和 App Store Connect production provisioning profile，验证 Team、Bundle ID、APNs entitlement、代码签名、版本和 Build 后，把 IPA、SHA-256 与构建元数据保存为 14 天的私有 workflow artifact。该 workflow **只生成 IPA，不自动上传 TestFlight**；凭据必须放入受保护的 `ios-production` Environment Secrets。详见 [GitHub IPA 构建说明](github-ios-ipa.md)。

APNs 服务端另需一把在 Apple Developer 网站创建并允许 APNs 的 Key；它与 App Store Connect 上传 Key 属于两套用途，不应混用。生产/TestFlight 必须关闭 APNs sandbox：

```bash
export APNS_TEAM_ID='你的十位 Team ID'
export APNS_KEY_ID='APNs Key ID'
export APNS_BUNDLE_ID='com.tomzeng845.echat'
export APNS_PRIVATE_KEY='由秘密管理服务注入的完整 PKCS#8 PEM'
export APNS_USE_SANDBOX=false
```

当前代码、Web/iOS 同步、plist/资源静态检查、APNs 单元测试、双平台设备 API、私有 GitHub 仓库、`ios-production` 环境、Distribution 证书与 production profile 已就绪；**当前下一步**是把签名材料写入 Environment Secrets、运行 macOS 26 Archive 并下载校验 IPA。App Store Connect 记录、APNs Key、上传、Apple 处理、测试员分配和真机验收尚未完成。TestFlight 构建可测试 90 天，内部测试最多 100 人；首次外部测试还需要 Beta App Review。详见 [GitHub IPA 构建说明](github-ios-ipa.md)、[Apple 配置详细指南](apple-app-store-connect-setup-guide.md)、[iOS/TestFlight 发布说明](ios-testflight-notes.md)、[Apple 上传构建文档](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)和 [Apple TestFlight 文档](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)。

App Store Connect 的 App Privacy 必须与 `PrivacyInfo.xcprivacy` 和实际生产数据流一致。E聊会将账号/昵称、可选手机号、好友社交图、消息、照片/视频、语音、其他用户内容、反馈、用户/设备标识、活跃/登录诊断及由 IP 推断的粗略地区发送到服务端并与账号关联，仅用于 App Functionality，不用于跨应用跟踪。消息私聊不能标记为“不收集数据”；账号持有人仍需在提交前根据最终生产部署、隐私政策和第三方服务逐项确认。

## 媒体存储

在 Manus 托管环境中，API 使用系统注入的对象存储签名服务：文件先由 ASP.NET Core 获取预签名地址，再直接写入对象存储；数据库只保存资产元数据和存储键。0.9.0 起，新聊天图片、视频、语音和文件按原文件上传，并继续通过会话成员鉴权下载；协议切换前的加密附件仍由旧兼容路径在设备端解密。朋友圈和反馈图片也由各自权限规则控制访问。

没有对象存储配置时，开发模式会回退到 `Api/.media/` 本地目录，便于离线调试；该回退不适合多实例或无持久磁盘的生产环境。单个文件当前限制为 25 MB。

## 安全配置

使用 MongoDB 的正式生产环境必须设置 `JWT_SECRET`、`ADMIN_BOOTSTRAP_PASSWORD` 和 `ADMIN_SECRET_ENCRYPTION_KEY`，可选用 `ADMIN_BOOTSTRAP_ACCOUNT` 修改管理账号。每个 Admin 账号现在通过“管理账号”页面独立绑定 Google Authenticator，Base32 密钥使用 AES-GCM 加密后保存；`ADMIN_SECRET_ENCRYPTION_KEY` 必须由密钥管理服务注入并保持稳定。未完成独立绑定的旧 Admin 仍可使用 `ADMIN_TOTP_SECRET` 作为迁移回退。普通用户登录不要求 TOTP；持久化生产环境中 Admin 完成密码验证后必须再提交 6 位动态验证码，且不会使用或重置演示默认密码。

0.9.0 起，新消息正文以明文保存在服务端，新聊天附件以原文件保存在媒体存储；管理员在授权的会话管理页面可直接查看内容。系统仍保留不可导出的浏览器私钥、版本化会话密钥信封和 AES-GCM 解密代码，仅用于读取协议切换前的历史密文。部署时必须启用 HTTPS、限制 MongoDB 和对象存储网络访问、严格控制后台角色权限，并审计所有消息查看操作。

二维码登录采用两组独立随机令牌：二维码中只包含扫描令牌，桌面只保存轮询令牌；扫码设备必须显示目标设备并主动确认，授权结果只能兑换一次且两分钟后过期。个人名片码不含密码，可在七天内用于预览公开资料并发起好友申请。

不要再把当前新消息协议宣传为端到端加密。历史密文兼容代码仅用于平滑迁移，并不改变 0.9.0 之后新消息可由服务器和授权后台读取的事实。生产版仍需补充更严格的数据保留/删除策略、后台查看审批、审计告警和第三方安全评审。

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
node scripts/geoip-smoke.mjs http://127.0.0.1:2099
node scripts/android-push-smoke.mjs http://127.0.0.1:2099
node scripts/ios-push-smoke.mjs http://127.0.0.1:2099
python3 scripts/validate-ios-project.py
node scripts/android-safe-area-smoke.mjs http://127.0.0.1:2099
node scripts/plaintext-message-smoke.mjs http://127.0.0.1:2099
node scripts/legacy-e2ee-compat-smoke.mjs http://127.0.0.1:2099
node scripts/android-call-audio-smoke.mjs http://127.0.0.1:2099
node scripts/android-call-listener-smoke.mjs http://127.0.0.1:2099
pnpm android:apk
pnpm ios:sync
```

`pnpm test` 同时运行前端测试入口和 .NET xUnit 测试。主冒烟脚本使用三账号验证明文文字、独立 `Emoji` 类型、“[表情]”预览、原文件富媒体、四种朋友圈可见范围与举报；明文专项脚本进一步验证数据库/API 内容、媒体原字节和后台可见性。后台专项脚本验证图文反馈、固定五角色中文权限、用户/Admin 登录日志隔离和明文聊天记录；后台浏览器脚本遍历全部 24 页并检查对应弹窗、表格与详情。历史 E2EE 兼容脚本只验证协议切换前的数据可继续读取。Android 通话音频脚本和原生来电监听脚本继续覆盖鸿蒙后台来电、接听握手、双向音轨、扬声器与呼出等待铃声。Gradle 流程还执行 Android 单元测试、lint 和 debug APK 组装。

## 生产部署

`Dockerfile` 会先构建 React 静态资源，再发布 ASP.NET Core 应用，最终由 Kestrel 同时提供 HTML5 前端、REST API 和 SignalR Hub。容器的首个暴露端口为 2099，并继续尊重托管平台注入的 `PORT`。

正式实时通信部署需要支持 WebSocket 长连接、TLS、固定或共享数据存储、滚动发布和连接重建。默认通话使用公共 STUN 与浏览器 P2P；设置 `TURN_URLS`（逗号分隔）和 `TURN_SECRET` 后，`/api/rtc/config` 会为当前用户签发十分钟 TURN 临时凭据。设置 `SFU_URL` 后服务会标记为 `sfu-ready`；没有 SFU 时，服务端限制通话为最多四名参与者。无状态按请求休眠的短时托管环境只能用于演示，不适合作为高并发聊天生产环境。

## 主要接口

| 方法                | 路径                                                                                   | 用途                                               |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| POST                | `/api/auth/register`                                                                   | 邀请码注册                                         |
| POST                | `/api/auth/login`                                                                      | 密码登录                                           |
| POST                | `/api/auth/totp`                                                                       | 管理员 TOTP 验证                                   |
| POST                | `/api/auth/refresh`                                                                    | 刷新令牌轮换                                       |
| POST                | `/api/qr/login/start`                                                                  | 生成一次性登录二维码                               |
| POST                | `/api/qr/login/scan`                                                                   | 已登录设备扫描登录二维码                           |
| POST                | `/api/qr/login/approve`                                                                | 确认或拒绝新设备登录                               |
| POST                | `/api/qr/login/status`                                                                 | 登录页查询扫码状态                                 |
| POST                | `/api/qr/login/exchange`                                                               | 一次性兑换登录会话                                 |
| POST                | `/api/qr/contact/create`                                                               | 生成个人名片二维码                                 |
| POST                | `/api/qr/contact/preview`                                                              | 预览扫码名片                                       |
| POST                | `/api/qr/contact/redeem`                                                               | 通过名片发起好友申请                               |
| GET/DELETE          | `/api/devices`                                                                         | 查看或撤销登录设备                                 |
| PUT                 | `/api/users/me/public-key`                                                             | 发布当前设备身份公钥                               |
| GET                 | `/api/users/{account}/public-key`                                                      | 获取联系人全部设备公钥                             |
| GET/POST            | `/api/contacts/requests`                                                               | 查询或发起好友申请                                 |
| POST                | `/api/contacts/requests/{id}/accept`                                                   | 接受好友申请                                       |
| GET                 | `/api/conversations`                                                                   | 会话列表                                           |
| POST                | `/api/conversations/direct`                                                            | 创建单聊                                           |
| POST                | `/api/conversations/groups`                                                            | 创建群聊                                           |
| GET                 | `/api/conversations/{id}/members`                                                      | 获取通话成员                                       |
| PUT                 | `/api/conversations/{id}/key`                                                          | 为成员设备轮换版本化会话密钥信封                   |
| GET                 | `/api/conversations/{id}/keys/{keyVersion}`                                            | 获取当前设备指定版本的会话密钥信封                 |
| GET/POST            | `/api/conversations/{id}/messages`                                                     | 补拉或发送明文新消息（兼容历史密文）               |
| POST                | `/api/conversations/{id}/messages/{messageId}/recall`                                  | 撤回消息                                           |
| POST                | `/api/conversations/{id}/read/{sequence}`                                              | 更新已读游标                                       |
| POST                | `/api/media`                                                                           | 上传聊天原文件、朋友圈或反馈图片                   |
| GET                 | `/api/media/{id}/content`                                                              | 按关系与会话权限获取媒体                           |
| GET/POST            | `/api/moments`                                                                         | 获取好友动态或发布动态                             |
| POST/DELETE         | `/api/moments/{id}/like`                                                               | 点赞或取消点赞                                     |
| POST                | `/api/moments/{id}/comments`                                                           | 发布评论                                           |
| POST                | `/api/moments/{id}/reports`                                                            | 举报动态                                           |
| GET                 | `/api/calls`                                                                           | 通话记录                                           |
| POST                | `/api/calls/listener-token`                                                            | 签发会话绑定的只读 Android 来电监听令牌            |
| GET                 | `/api/rtc/config`                                                                      | STUN/TURN 与媒体拓扑配置                           |
| GET/POST            | `/api/push/status`、`/api/push/devices`                                                | 查询推送状态并注册 Android FCM、iOS APNs/VoIP 设备 |
| DELETE              | `/api/push/devices/{deviceId}`                                                         | 停用当前账号同设备的全部推送平台                   |
| POST                | `/api/push/test`                                                                       | 发送当前账号的 FCM/APNs 测试通知                   |
| GET                 | `/api/p1/capabilities`                                                                 | P1 能力和外部依赖状态                              |
| GET                 | `/api/admin/overview`                                                                  | 管理后台运营与安全概览                             |
| GET/POST            | `/api/admin/users`、`/api/admin/users/{account}/status`                                | 用户查询与状态治理                                 |
| POST                | `/api/admin/users/batch`                                                               | 单次批量新增 1–200 个用户                          |
| GET                 | `/api/admin/users/export`                                                              | 按当前筛选条件导出防公式注入 CSV                   |
| PUT                 | `/api/admin/users/{account}/profile`                                                   | 修改昵称、手机号、邀请码来源和登录 IP 限制         |
| PUT                 | `/api/admin/users/{account}/security`                                                  | 账号/登录/银行卡锁定、注销、红号、认证和风险值     |
| PUT                 | `/api/admin/users/{account}/password`                                                  | 重置密码并撤销原设备会话                           |
| POST/GET            | `/api/admin/users/{account}/duplicate`、`/api/admin/users/{account}/same-ip`           | 复制用户和同 IP 账号检测                           |
| POST                | `/api/admin/users/{account}/sessions/revoke`                                           | 强制退出目标用户全部设备                           |
| GET/PUT             | `/api/admin/users/{account}/invite-options`、`/api/admin/users/{account}/invite-code`  | 查询并选择用户的八位邀请码                         |
| GET/POST            | `/api/admin/invites`、`/api/admin/invites/generate`                                    | 八位注册邀请码查询、生成和维护                     |
| GET/POST            | `/api/admin/reports`、`/api/admin/reports/{id}/decision`                               | 举报队列与处置                                     |
| GET                 | `/api/admin/audit`                                                                     | 管理操作审计日志                                   |
| GET/POST/PUT/DELETE | `/api/admin/modules/{module}`                                                          | 公告等模块 CRUD；角色固定五类且只允许更新          |
| GET/POST            | `/api/admin/users/{account}/verifications`、`/api/admin/verifications/{id}/decision`   | 实名与企业认证详情、编辑和审核                     |
| GET/POST/PUT/DELETE | `/api/admin/fund/subjects`、`/api/admin/fund/adjustments`                              | 额度科目、幂等人工调整和分页记录                   |
| GET                 | `/api/admin/fund/transactions`                                                         | 按账号、科目、方向和金额筛选交易明细               |
| GET/POST/PUT/DELETE | `/api/admin/operators`、`/api/admin/operators/{account}/totp/*`                        | Admin 管理账号与独立 Google Authenticator 绑定     |
| GET/POST            | `/api/admin/login-logs/search`、`/api/admin/login-failure-ips/*`                       | 用户登录日志隔离、失败 IP 聚合与处置               |
| GET/POST            | `/api/admin/feedback`、`/api/admin/feedback/{id}/decision`、`/api/admin/feedback/seen` | 图文反馈新增、查询、批量已查看与回复               |
| GET/PUT/POST        | `/api/admin/announcements/*`                                                           | 公告查询、编辑、发布、撤回和删除                   |
| GET/POST/PUT        | `/api/admin/chat/conversations`、`/api/admin/chat/groups/*`                            | 会话筛选、明文新消息/历史密文时间线与群治理        |
| GET/POST            | `/api/admin/group-invites`、`/api/group-invites/redeem`                                | 群邀请码生成、撤销和兑换                           |
| POST                | `/api/admin/automations/{id}/run`                                                      | 人工触发群发言/机器人并生成发送日志                |
| POST/PUT/DELETE     | `/api/admin/images`、`/api/admin/images/{id}`                                          | 后台图片上传、分类标签编辑和删除                   |
| WebSocket           | `/hubs/chat`                                                                           | 消息、回执、朋友圈更新与 WebRTC 信令               |
| GET                 | `/api/health`                                                                          | 健康检查与 GeoIP、FCM/APNs 提供方状态              |

## 仍需外部基础设施的能力

应用层 P1 已开放，Android FCM 与 iOS APNs/PushKit/CallKit 代码链路均已完成。生产上线仍需项目方配置 Firebase 客户端文件/服务账号，以及 Apple Developer Team、App ID capability、两类 Apple Key、签名环境和 TestFlight 真机验收。Linux 环境不能编译或签名 iOS；当前也没有 Apple 凭据，因而不能把源码静态就绪误报为已上传 TestFlight。TURN/SFU、短信供应商、视频转码与病毒扫描仍需要外部服务。生产环境还应补充明文消息的数据保留与访问审批、MongoDB 副本集、备份恢复、监控告警、安全评审和容量压测。`/api/p1/capabilities` 和 `/api/health` 会明确返回外部能力当前是否已配置。
