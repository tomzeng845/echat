# E聊开发跟踪

## iOS 0.9.0 与 TestFlight

- [x] 安装 `@capacitor/ios` 并生成 Capacitor 8 Xcode 工程；Apple 拒绝已被占用的 `com.echat.app` 后迁移 iOS 至 `com.tomzeng845.echat`
- [x] 设置 iOS 15、版本 `0.9.0`、build 18、AppIcon、启动图和三类提示音
- [x] 接入 APNs 普通通知 token 注册、点击路由和个人中心状态
- [x] 接入 PushKit `ios-voip` token、CallKit 系统来电、接听/拒接/结束桥接
- [x] 接听、拒接或挂断后按 `callId` 向其他 iOS 设备发送结束 VoIP push
- [x] 接入相机、麦克风、AVAudioSession 听筒/扬声器与后台音频能力
- [x] 添加 APNs entitlement、权限用途说明和按真实通话能力启用的 Background Modes
- [x] 按实际账号、好友、消息、媒体、反馈、标识、使用/诊断和粗略地区数据修正 Apple 隐私清单
- [x] 服务端实现 APNs HTTP/2、ES256 JWT、alert/VoIP topic、失效 token 停用和安全降级
- [x] MongoDB/内存仓库支持 Android、iOS alert 与 iOS VoIP token 共存和整设备停用
- [x] 新增 `pnpm ios:sync`、`pnpm ios:open`、`pnpm ios:testflight` 与静态检查脚本
- [x] Vitest 15 项、xUnit 25 项、生产构建、iOS sync、Android Gradle 和全量业务回归通过
- [x] 初始 Linux 环境检查确认无 Xcode；随后改用 GitHub-hosted macOS runner 完成签名与上传
- [x] 提供 App ID、App Store Connect 记录、自动/手工签名、描述文件、APNs Key、上传 Key、隐私和 TestFlight 的详细操作指南
- [x] 新增 GitHub-hosted `macos-26` 手工签名 workflow，生成并校验 App Store Connect 分发 IPA
- [x] workflow 校验 Team、Bundle ID、production APNs entitlement、codesign、版本和 Build，并上传 14 天私有 artifact
- [x] 提供 `ios-production` Environment Secrets、`.p12`/profile Base64、触发、下载和 SHA-256 说明
- [x] 用户授权 GitHub 连接器并创建私有仓库 `tomzeng845/echat`，源码已推送到 `main`
- [x] 在私有仓库配置 Apple Distribution `.p12`、密码、Team ID 和 App Store Connect profile Environment Secrets
- [x] 运行 `Build signed iOS IPA` workflow `34024319750`，下载并验证 `0.9.0 (181)` IPA 与 SHA-256
- [x] 为 Team `PPY8H6QWB5` 注册 `com.tomzeng845.echat` 显式 App ID 并开启 Push Notifications
- [x] 创建并验证 Apple Distribution 证书和 App Store Connect production provisioning profile
- [x] 创建 App Store Connect 记录“E聊即时通讯”，绑定 `com.tomzeng845.echat`，Apple ID `6809145695`
- [x] 创建 APNs Production Team Scoped Key `35Z9TC62QQ`（`EChat APNs Production 2026 v4`），并验证用户上传的 p8 可被 OpenSSL 导入
- [x] 将 Production APNs p8 安全注入正式服务；重启后健康测试确认 `iosEnabled=true`、Apple APNs provider
- [x] 创建 Developer 角色 App Store Connect Team API Key，并加入 GitHub `ios-production` Environment Secrets
- [ ] 正式发布 App Store 前完成隐私信息、隐私政策和 Beta 元数据；用户当前明确只更新内部 TestFlight，本轮不提交这些正式发布资料
- [x] 由账号持有人确认标准加密算法并声明当前不在法国分发，完成 Build 181 出口合规问卷
- [x] 在 GitHub-hosted macOS 26 / Xcode 26 完成 Manual archive、export、codesign、profile、Bundle ID、版本与资源验证
- [ ] 在 iPhone 真机重新验证普通 APNs、后台 PushKit/CallKit、相机和麦克风，并补充 APNs Production Key 与 TestFlight token 重新注册证据
- [x] 执行 GitHub workflow `34028293524`，Apple Delivery `f1b7e7d8-a6e1-4a56-8363-da16ba37cc18` 上传成功
- [x] Apple 已处理 `0.9.0 (181)`；创建自动分发的“E聊内部测试”组并邀请账号持有人
- [ ] 通过 TestFlight 在至少两台 iPhone 完成消息通知、语音/视频接听、拒接、挂断和双向媒体验收（依赖 Apple 登录和可用真机）
- [x] 当前仅使用内部 TestFlight 测试，暂不需要提交外部 Beta App Review

### iOS 原生 WebRTC 媒体层（Build 247）

- [x] Build 242 日志确认远端 RTP 连续到达、12 个质量样本均为零丢包，`audio.play()` 成功后 0–3 ms 内发生 `AVAudioSession interruption-began`
- [x] 根因确定为 WKWebView WebRTC 音频进程与 CallKit/原生 AVAudioSession 争夺系统音频设备，不再继续叠加网页播放恢复补丁
- [x] 保留现有 SignalR `CallSignal`、SDP/ICE、coturn、Android 和 Windows 通话协议，仅替换 iOS 媒体层
- [x] iOS 使用纯 `LiveKitWebRTC` XCFramework 的原生 PeerConnection；不接入 LiveKit Room、token server 或 Rust 运行时
- [x] 原生层统一负责麦克风、摄像头、远端音频、视频渲染、AEC/AGC/NS、听筒/外放/蓝牙和完整释放
- [x] 使用 WebRTC manual audio：CallKit `didActivate` 后才启用 VoIP Audio Unit，`didDeactivate`、挂断和中断时成对关闭/恢复
- [x] 路由变化只在实际输出偏离用户选择时修正，避免重现 Build 234 的反馈环
- [x] `pnpm check`、Vitest 23（1 skipped）、xUnit 27、iOS sync、Xcode archive、签名和 Apple 上传验证通过
- [x] Build 243 成功归档；IPA 仅包含 `LiveKitWebRTC.framework`，没有 `LiveKit.framework` 或 `RustLiveKitUniFFI`
- [x] Build 245 已上传 TestFlight；Delivery UUID `7255b8e7-7bd2-42d6-810b-fc4c8d3791f7`
- [x] Build 245 真机日志确认原生 PeerConnection 已连接，但会话在接通阶段反复落回 `SoloAmbient/Default`，连续通话还出现 `Session activation failed`
- [x] Build 247 统一由 `LKRTCAudioSession` 的锁、配置与平衡激活计数管理音频，移除原生通话结束后的第二次 `AVAudioSession.setActive(false)`
- [x] 原生 `close` Promise 现在等待 PeerConnection、Audio Unit 和音频会话实际释放完成，避免下一通电话与上一通释放流程竞态
- [x] 增加远端原生音频轨道、Audio Unit、activation count、RTP 包/字节/丢包/抖动/能量诊断，后续日志可直接区分“未收流”和“收到但未播放”
- [x] Build 246 编译验证成功；`pnpm check`、Vitest 24（1 skipped）、xUnit 27、Xcode archive 与签名通过
- [x] Build 247 已通过 Apple 校验并上传 TestFlight；Delivery UUID `db255852-81a1-4d6e-a8cf-d81cf9f0059a`
- [x] Build 248（0.9.0）基于现有 SignalR + iOS 原生 WebRTC/CallKit/PushKit 路线构建并上传 TestFlight；Delivery UUID `0acd3ac8-bac8-4be2-9833-49ce983a2086`
- [x] Build 249（0.9.0）包含 PushKit 冷启动修复，已成功上传 TestFlight；Delivery UUID `1b968391-c27e-4421-8673-3c1ba6c8e804`
- [x] Android APK 构建成功，artifact `EChat-Android-debug-31`，包含鸿蒙后台服务自动恢复和任务移除重启修复
- [x] Build 261 真机日志确认旧 capture session 的 output 从 2 递增到 9，锁定重启清理缺失问题
- [x] Build 262 已在重启前 stop 并移除旧 session 全部 input/output；真机日志确认 output 稳定为 1，但 `startRunning()` 返回后仍未运行
- [x] 为 `startRunning()` 增加 Objective-C `NSException` 捕获桥接，并监听 runtime error、interrupted、interruption ended、did start/stop running 五类 AVCaptureSession 通知
- [x] Build 263（提交 `5fe0f7e2`）已通过 Xcode 编译、Apple 校验并上传 TestFlight；Delivery UUID `d7ccd0cc-59ed-4ec3-a10e-145c566a48df`
- [x] Build 263 真机日志捕获 `AVFoundationErrorDomain -11873`，明确为当前前置摄像头 activeFormat 不受 capture session 支持
- [x] 改为稳定 SDR 640×480/24fps 优先，启动前显式验证并设置 activeFormat；-11873 后切换下一候选格式，最多尝试 8 种
- [ ] 构建并通过 TestFlight 真机日志验证格式回退后 `sessionRunning=true`、`capturedFrames>0`
- [ ] 在 Build 247 真机完成前台接听、锁屏接听、听筒/外放、蓝牙、系统电话中断恢复、语音/视频双向媒体和挂断后下一通复测

## Android 0.9.0 正式签名发布

- [x] 生成独立 PKCS12、RSA 4096 位、有效期 10000 天的发布密钥
- [x] 发布密钥和凭据打包为 AES-256 加密备份，密码单独保存
- [x] Gradle 仅从环境变量读取 keystore、别名和密码
- [x] 缺少任何签名变量时 release 构建立即失败，不回退为 debug 签名
- [x] 增加 `pnpm android:release` 可重复构建命令
- [x] 执行 `testReleaseUnitTest`、`lintRelease`、`bundleRelease` 和 `assembleRelease`
- [x] 生成 `EChat-0.9.0-release.apk` 和 `EChat-0.9.0-release.aab`
- [x] APK v2/v3 签名、RSA 4096 位证书和 16 KB 对齐验证通过
- [x] AAB JAR 签名和 APK/AAB 同证书验证通过
- [x] Google bundletool 1.18.1 `validate` 和通用 APK 生成通过
- [x] 包名 `com.echat.app`、版本 `0.9.0(18)`、API 24–36 验证通过
- [x] 生成 SHA-256 校验清单、发布证书和发布信息摘要
- [x] 文档记录 debug 转正式版需先卸载、密钥永久备份和 Google Play 发布步骤

## E聊 0.9.0 后台文档功能改造

- [x] 意见反馈页面增加“新增”按钮和文字、联系方式、多图片表单
- [x] 反馈图片限制为最多 6 张、单张 5 MB，并使用独立鉴权媒体用途
- [x] 反馈列表与详情显示完整内容、提交账号和图片预览
- [x] 角色权限固定为超级管理员、运营管理员、财务管理员、审计员、客服五类
- [x] 禁止新增、删除或改名固定角色，只允许编辑状态和权限
- [x] 角色和权限下拉及记录回显均使用中文名称
- [x] 账户系统登录日志排除全部后台角色账号
- [x] 管理系统登录日志只显示后台角色记录
- [x] 新文字与表情消息直接以明文内容保存和传输
- [x] 新图片、文件、语音和视频按原文件上传并由会话成员鉴权访问
- [x] 会话列表预览、APP 聊天气泡与通知摘要适配明文消息
- [x] 后台会话详情直接显示新明文，并标记协议切换前的历史密文
- [x] 历史 AES-GCM 消息和加密附件保留设备端兼容读取，不批量迁移
- [x] `PLAINTEXT_MESSAGES_OK` 验证文字、表情、原文件媒体与后台可见性
- [x] `ADMIN_REQUIREMENTS_090_OK` 验证图文反馈、固定五角色、日志隔离和明文记录
- [x] 1440×900 视觉检查通过新增反馈、中文角色、用户日志和聊天记录页面
- [x] `pnpm check`、Vitest 13 项、xUnit 21 项和生产构建通过
- [x] 15 组聊天、后台、明文迁移、历史兼容、推送与通话回归通过
- [x] Android 单测、lint、16 KB 对齐和 v2 签名验证通过
- [x] 生成 `versionCode=18`、`versionName=0.9.0` 可覆盖安装 APK

## Android APP 0.8.9 加密表情消息

- [x] 把聊天输入栏的表情占位按钮替换为真实表情面板
- [x] 提供最近、笑脸、手势、动物、食物、活动、旅行、物品和符号分类
- [x] 支持中文、英文关键词和表情字符搜索
- [x] 最近使用在设备本地去重保存，最多 24 个
- [x] 手机打开面板不自动弹出键盘，面板不超出 390×844 视口
- [x] 外部点击、Esc、关闭按钮和选择表情均可关闭面板
- [x] 点击表情以独立 `MessageKind.Emoji` 立即发送
- [x] 表情使用当前 `keyVersion` 的 AES-GCM 会话密钥端到端加密
- [x] 表情消息显示为大号无底色气泡并支持撤回
- [x] 内存/MongoDB 会话列表统一显示“[表情]”预览
- [x] FCM 和本地后台通知只显示“发来一个表情”，不泄露实际字符
- [x] Vitest 覆盖分类搜索、最近使用、去重与本地持久化
- [x] xUnit 覆盖 `Emoji` 类型保存和会话预览
- [x] API 冒烟输出 `emoji=Emoji:[表情]`
- [x] 390×844 手机真实界面输出 `emoji=searched:sent:preview`
- [x] `pnpm check`、Vitest 13 项、xUnit 20 项和生产构建通过
- [x] 14 组聊天、后台、移动、加密、推送和通话全量回归通过
- [x] Android 单测、lint、16 KB 对齐和 v2 签名验证通过
- [x] 生成 `versionCode=17`、`versionName=0.8.9` 可覆盖安装 APK

## Android APP 0.8.8 鸿蒙接听握手与音频恢复

- [x] 定位点击接听到媒体采集完成期间服务端仍为 Ringing 的重复补发窗口
- [x] 接听后先调用 `CallPrepareAnswer`，再请求摄像头/麦克风并完成 `CallAccept`
- [x] 服务端按账号记录接听准备时间，监听重连跳过正在接听的同一来电
- [x] 群聊保持多成员分别准备和依次接听兼容
- [x] 原生 `:calls` 服务为已清理 `callId` 保存两分钟进程内/持久化墓碑
- [x] 跨进程广播、通知 Intent、待处理缓存和迟到事件统一检查清理墓碑
- [x] 取消 Capacitor retained 来电事件，避免监听器重建后二次回放
- [x] 通知冷启动直接读取 Intent 来电载荷，不依赖鸿蒙多进程缓存
- [x] 远端 audio/video 明确未静音、音量 1，并在多个媒体就绪时点重试播放
- [x] 远端音轨到达和接通后重新应用 Android 听筒/扬声器路由
- [x] 原生通信设备选择失败时回退 speakerphone，并解除麦克风静音
- [x] 语音和视频呼出等待铃声明确通过扬声器播放
- [x] `ANDROID_CALL_LISTENER_OK` 验证 `answering_replay=suppressed`
- [x] `ANDROID_CALL_AUDIO_OK` 验证 `volume=1 answering_handshake=ok`
- [x] `CALL_SIGNAL_OK` 确认原有 WebRTC 信令兼容
- [x] `pnpm check`、Vitest 11 项、xUnit 19 项和生产构建通过
- [x] 14 组聊天、后台、移动、加密、推送与通话全量回归通过
- [x] Android 单测、lint、三类铃声、16 KB 对齐和 v2 签名通过
- [x] 生成 `versionCode=16`、`versionName=0.8.8` 可覆盖安装 APK

## Android APP 0.8.7 鸿蒙后台来电与通话状态修复

- [x] 定位接听后 `callListenerCleared` 被误当成通话结束的状态机错误
- [x] 增加 `answering` 状态，原生清理事件只关闭尚未接听的来电
- [x] 按 `callId` 消费和清除原生/浏览器待处理来电，避免重复弹出来电
- [x] 接听前等待后台恢复后的 SignalR 连接重新就绪
- [x] 原生来电服务移入 `:calls` 独立进程并持有局部唤醒锁
- [x] SignalR 原生连接配置 15 秒 keepalive、45 秒服务器超时和阶梯重连
- [x] 原生监听重连后补发 90 秒内仍在振铃的来电
- [x] 跨进程广播直接携带来电 payload，避免 SharedPreferences 缓存不一致
- [x] 首次登录请求电池优化豁免，个人中心显示授权状态并打开华为/荣耀启动管理
- [x] 语音和视频呼出等待期间循环播放 `echat_ringback.wav`
- [x] 接听、拒绝、结束和失败时立即停止呼出等待铃声
- [x] Vitest 覆盖接听清理状态规则、呼出铃声状态和原生桥调用
- [x] `ANDROID_CALL_LISTENER_OK` 验证断线期间来电在重连后补发
- [x] `ANDROID_CALL_AUDIO_OK` 验证接听清理不挂断、双向音轨与两次呼出铃声
- [x] `pnpm check`、Vitest 11 项、xUnit 19 项和生产构建通过
- [x] 14 组聊天、后台、移动、加密、推送与通话全量回归通过
- [x] Android 单测、lint、独立进程 Manifest、三类提示音和 v2 签名通过
- [x] 生成 `versionCode=15`、`versionName=0.8.7` 可覆盖安装 APK

## Android APP 0.8.6 常驻后台来电

- [x] 确认根因是 Android 暂停 WebView 后 JavaScript SignalR 无法接收 `call.invited`
- [x] 按用户选择实现无需 Firebase 的 Android 原生常驻来电方案
- [x] 使用 Microsoft SignalR 8 Java 客户端建立独立 WSS 连接
- [x] 以 Android `remoteMessaging` 前台服务运行，保留低优先级常驻状态通知
- [x] 服务被系统重建时从应用私有存储恢复配置，并按 1–60 秒阶梯重连
- [x] 签发七天有效且绑定当前 session/device 的 `call_listener` 令牌
- [x] REST 默认仅接受 `scope=app`；监听令牌访问普通 API 返回 403
- [x] 监听令牌只加入当前用户组，不订阅会话组或聊天密文
- [x] 所有 Hub 交互方法再次要求 `scope=app`，只读令牌无法调用
- [x] 来电改为发送到接听者用户组，监听连接先建立、会话后创建也能收到
- [x] 后台语音/视频来电显示高优先级通知并循环播放铃声
- [x] 点击通知恢复会话和来电界面；WebRTC 未就绪时来电载荷先缓存
- [x] 接听、拒绝、双方结束时通过用户组清除原生通知和铃声
- [x] 原生服务过滤当前用户自己发起的通话，并避免与 WebView 重复通知
- [x] 退出账号或会话过期时停止服务并清除受限令牌
- [x] 个人中心显示“后台来电 / 常驻服务运行中”状态
- [x] `ANDROID_CALL_LISTENER_OK` 验证只读 scope、403、后建会话邀请和清理事件
- [x] 原有 `CALL_SIGNAL_OK` 及 14 组全量回归通过
- [x] `pnpm check`、Vitest 9 项、xUnit 19 项和生产构建通过
- [x] Android 单测、lint、Manifest 服务类型、DEX 类、16 KB 对齐和 v2 签名通过
- [x] 生成 `versionCode=14`、`versionName=0.8.6` 可覆盖安装 APK

## Android APP 0.8.5 后台通知栏

- [x] 确认生产 `push.enabled=false`，定位为 Firebase 凭据尚未配置
- [x] 接入 Capacitor Local Notifications 作为进程存活时的后台回退
- [x] 登录后检查 Android 13+ 通知权限，不再依赖 FCM 是否启用
- [x] 使用 `App.appStateChange` 区分前台提示音和后台通知栏
- [x] 后台新消息按类型显示加密消息/图片/语音/视频/文件摘要
- [x] 后台语音和视频来电使用 `calls-v2` 高优先级声音频道
- [x] 点击本地通知通过 `extra` 会话编号回到对应聊天
- [x] 已注册 FCM 时后台不重复调度本地通知
- [x] 个人中心在 FCM 未配置但本地通知可用时显示“后台通知已开启”
- [x] Vitest 覆盖 FCM 关闭、APP 进入后台和本地通知调度
- [x] APK 已打包本地通知插件、通知权限、Receiver、Provider 和频道配置
- [x] `pnpm check`、Vitest 9 项、xUnit 18 项和生产构建通过
- [x] Android 单测、lint、16 KB 对齐和 v2 签名验证通过
- [x] 13 组聊天、后台、移动、加密、提示音与通话全量回归通过
- [x] 生成 `versionCode=13`、`versionName=0.8.5` 可覆盖安装 APK

## Android APP 0.8.4 错误密钥缓存自愈

- [x] 复现 IndexedDB 已存在同版本错误 AES 密钥时仍显示旧设备提示的问题
- [x] 会话初始化实际解封服务器当前设备信封，验证后才信任本地缓存
- [x] 当前设备信封无法解封时使用成员最新设备公钥自动轮换版本
- [x] 消息首次解密失败后强制刷新指定版本设备信封并重试
- [x] 发送文字前强制校准当前版本密钥，发送者回显正常
- [x] 发送图片、文件、语音和视频前采用相同密钥校准
- [x] 当前设备没有服务器信封时阻止发送，不再生成其他成员无法解密的消息
- [x] 三设备页面回归两次写入错误密钥，收到消息和主动发送均自愈
- [x] 好友端成功解密 APP 自愈后发送的消息，输出 `send_key_repair=ok`
- [x] `pnpm check`、Vitest 9 项、xUnit 18 项和生产构建通过
- [x] 13 组聊天、后台、移动、加密与通话全量回归通过
- [x] Android 单测、lint、16 KB 对齐和 v2 签名验证通过
- [x] 生成 `versionCode=12`、`versionName=0.8.4` 可覆盖安装 APK

## Android APP 0.8.3 新消息与提示音修复

- [x] 定位新消息先于会话刷新到达时，本地尚无该 `keyVersion` 的竞态
- [x] 登录后先发布当前设备公钥，再加载会话和启动 SignalR
- [x] 内存仓库与 MongoDB 按会话和版本保存设备密钥信封快照
- [x] 新增成员鉴权的指定版本当前设备信封 API
- [x] 解密前缺钥时即时获取、导入并保存信封，再显示新消息
- [x] 真正没有历史设备信封的旧消息仍保留端到端加密边界提示
- [x] APP 前台收到其他账号消息播放一次短提示音
- [x] APP 前台收到语音/视频来电循环播放铃声，接听/拒绝/结束时停止
- [x] SignalR 与前台 FCM 按消息或通话编号去重，避免重复响铃
- [x] FCM 后台通知迁移到 `messages-v2` / `calls-v2` 自定义声音频道
- [x] 自动生成并打包 `echat_message.wav` 与 `echat_call.wav`
- [x] 三设备回归删除当前本地密钥后输出 `realtime_recovery=ok message_sound=once`
- [x] 双端语音/视频回归输出 `alerts=voice,video stopped=accept`
- [x] Vitest 9 项、xUnit 18 项、Android 单测/lint/APK 构建通过
- [x] 生成 `versionCode=11`、`versionName=0.8.3` 修复 APK

## Android APP 0.8.2 消息与通话修复

- [x] 将账号单一 RSA 公钥升级为按 `deviceId` 保存的设备级公钥
- [x] 会话与消息增加 `keyVersion`，旧 MongoDB 数据自动按版本 1 兼容
- [x] APP 无法打开旧信封时，为所有成员当前设备生成下一版本 AES 密钥信封
- [x] 原浏览器保留旧版本密钥解密历史消息，APP 和好友设备共同解密新消息
- [x] 服务端拒绝使用过期密钥版本发送，避免设备间密钥分叉
- [x] 发送者自身 SignalR 回显由本地成功解密结果替换，不再误留“消息解密失败”占位
- [x] 语音通话显式挂载远端 `audio`，视频与音频在媒体就绪后主动播放
- [x] Android 使用通信音频模式、语音 AudioAttributes 和临时音频焦点
- [x] Android 12+ 使用通信设备 API 切换听筒/扬声器，旧版兼容 speakerphone
- [x] 控制栏增加“打开/关闭扬声器”，语音默认听筒、视频默认扬声器
- [x] 三设备三版本真实页面回归输出 `ANDROID_E2EE_OK`
- [x] 双端语音/视频回归确认双方远端音轨并输出 `ANDROID_CALL_AUDIO_OK`
- [x] 手机 390×844 回归确认语音通话扬声器按钮可切换
- [x] `pnpm check`、Vitest 8 项、xUnit 17 项和生产构建全部通过
- [x] Android 单测、lint、debug APK 构建、16 KB 对齐和 v2 签名验证通过
- [x] 全量遇错即停回归的 13 个成功标识全部通过
- [x] 生成 `versionCode=10`、`versionName=0.8.2` 可覆盖安装的修复 APK

## Android APP 0.8.1 登录防闪退

- [x] 定位为未配置 `google-services.json` 时，登录后自动调用 `FirebaseMessaging.getInstance()` 的异常路径
- [x] 登录后先查询 `/api/push/status`；服务端 FCM 未启用时完全跳过原生推送插件
- [x] 原生 `MediaPermissions.getCapabilities()` 检查 APK 是否包含 `google_app_id`
- [x] 只有服务端凭据与 Android Firebase 客户端配置同时存在时才注册通知监听和 FCM
- [x] 缺少任一配置时降级为“待配置 FCM”，聊天、好友、通话和媒体功能照常初始化
- [x] Vitest 增加四种配置组合及“服务端关闭时零原生调用”测试，前端测试共 6 项
- [x] 无 `google_app_id` 条件下 Gradle 单测、lint 与 APK 组装通过
- [x] 全量业务、后台、GeoIP、推送 API 和安全区回归通过
- [x] 生成 `versionCode=9`、`versionName=0.8.1` 防闪退 APK

## Android APP 0.8.0 验收清单

- [x] 使用 Capacitor 8 生成包名 `com.echat.app` 的原生 Android 工程
- [x] Android 本地 Web 资源的 REST、刷新令牌与 SignalR 统一连接可配置 HTTPS API
- [x] 后端实现 FCM HTTP v1 OAuth 认证、推送令牌注册/查询/停用与 MongoDB/内存持久化
- [x] 新消息、好友申请和音视频来电触发高优先级 Android 通知
- [x] 通知载荷不包含端到端加密消息明文，点击通知可跳转到会话或好友申请
- [x] Android 13+ 运行时请求通知权限并创建消息、通话两个通知频道
- [x] 扫码、语音录制与音视频通话按需请求摄像头/麦克风原生权限
- [x] Capacitor System Bars 安全区适配刘海、挖孔、状态栏和底部手势/三键导航栏
- [x] 移动端底部菜单、聊天输入栏和后台布局使用安全区后的可用高度
- [x] 使用现有 E聊品牌图生成 Android 自适应图标、启动屏和单色通知图标
- [x] FCM 客户端文件、服务账号和 Android 签名密钥不写入仓库
- [x] Vitest 验证个人中心可见“待配置 FCM / 已开启 / 权限已关闭”状态映射
- [x] xUnit 推送设备测试通过，完整 xUnit 共 17 项
- [x] Android Gradle 单元测试、lint 和 debug APK 组装通过
- [x] 缺少项目方 Firebase 凭据时 health/个人中心明确显示待配置且不影响聊天；真机 FCM 实发步骤已文档化

## GeoIP 0.7.1 验收清单

- [x] 使用可配置 HTTPS `ipwho.is` 接口，把公网 IP 解析为中文国家、省州和城市
- [x] 本机、内网、链路本地、保留和多播地址不发送给第三方
- [x] 成功结果缓存 24 小时、失败结果缓存 5 分钟，并以单 IP 锁避免并发缓存击穿
- [x] 第三方失败或超时时降级为原始 IP，不阻断注册、登录或后台操作
- [x] 注册与密码登录统一更新用户最后登录 IP、地区、活跃时间和节点
- [x] 用户登录、用户离线、Admin 登录、强制下线、操作审计和未处理异常日志统一写入 GeoIP 地区
- [x] 用户管理显示最后登录地区，日志页面显示地区，后台首页显示 GeoIP 提供方和缓存数量
- [x] xUnit 覆盖中文地区、ISP、缓存命中和私网跳过，完整测试共 16 项
- [x] `geoip-smoke.mjs` 使用公开测试 IP 验证用户资料、登录日志、health 状态和缓存
- [x] README 与 GeoIP 方案说明记录配置、隐私边界、降级和生产建议
- [x] 已通过 `pnpm check`、`pnpm test`、`pnpm build` 及聊天/后台/GeoIP 全量回归

## 当前版本验收清单

- [x] 按第二版 7 页后台文档精简为四组 24 个保留页面
- [x] 用户管理仅显示普通用户，Admin 账号仅在“管理账号”页面管理
- [x] 修改用户邀请码改为选择已创建的八位邀请码并使用专用 API
- [x] 用户分页移到表格底部，交易明细增加独立筛选分页页面
- [x] 登录、离线、操作和报错日志显示设备、系统、版本、IP 与地址字段
- [x] 意见反馈支持查看详情、回复、拒绝、删除和批量标记已查看
- [x] 管理账号严格限定 Admin，支持独立 TOTP、编辑、停用和删除
- [x] 角色页面使用固定权限白名单，API 拒绝未知权限
- [x] 公告支持搜索、编辑、删除、发布/撤回和底部分页
- [x] 图片库支持上传、搜索、分类、标签、编辑与删除
- [x] 会话与群管理支持服务端搜索分页、密文时间线、建群、改名、解散与恢复
- [x] 角色、客服、群发言和机器人页面支持筛选、分页、编辑与删除
- [x] 删除厂商推送和通讯录菜单；通讯录旧管理 API 返回 410
- [x] `ADMIN_REQUIREMENTS_071_OK` 覆盖 V2 认证、邀请码、交易、TOTP、公告、建群与治理 API
- [x] `ADMIN_071_OK` 覆盖 7 类模块、24 页面、普通用户隔离、权限和桌面/手机布局
- [x] 账号菜单根据实际点击的“操作”按钮坐标显示在其旁边
- [x] 靠近视口右侧或底部时自动翻转和上移，避免菜单超出屏幕
- [x] 点击菜单外任意空白区域立即关闭主菜单和状态子菜单
- [x] 页面滚动、窗口尺寸变化或按 Esc 时自动关闭菜单
- [x] 浏览器回归校验菜单与按钮水平/垂直间距不超过 12px
- [x] 每个账号（含当前管理账号）均显示独立“操作”按钮
- [x] 一级菜单提供同 IP 检测、修改邀请码、修改昵称、限制登录 IP、状态变更和登录密码
- [x] 状态变更二级菜单提供强制下线、账户锁定、登录锁定、银行卡锁定、注销和红号
- [x] 所有菜单项使用真实功能弹窗，不再使用浏览器 prompt
- [x] 每个菜单项对接现有 ASP.NET Core 管理 API 并在成功后刷新当前列表
- [x] 危险状态操作显示目标账号、影响说明、审计原因和确认按钮
- [x] 当前管理账号可维护资料/密码，但禁止自下线、自锁定和自注销
- [x] 桌面二级菜单无遮挡，手机端二级菜单转为内嵌布局
- [x] `ADMIN_052_OK account_menus=all` 验证每行菜单数量、弹窗和全部治理 API
- [x] 按参考图重构用户管理为分页、高级筛选、分组表头和横向滚动密集表格
- [x] 展示用户风险、余额、认证、在线、锁定、注册来源、时间、IP、设备和失败次数
- [x] 新增单用户开户、每次最多 200 个批量开户和按筛选条件 CSV 导出
- [x] 支持同 IP 检测、复制用户、修改昵称/邀请码/登录 IP 和重置密码
- [x] 支持强制下线、账号锁定、登录锁定、银行卡锁定、注销、红号和状态变更
- [x] 账号/登录锁定或注销会撤销设备会话并使现有访问令牌立即失效
- [x] 资金系统额度调整同步到用户管理账户余额
- [x] 修复限流中间件顺序，已登录用户按账号而非共享出口 IP 计数
- [x] `ADMIN_051_OK` 验证筛选、开户、批量、导出、锁定、注销、权限和响应式布局
- [x] 按 13 页后台需求文档重构首页与账户、资金、管理、聊天四组 25 个页面
- [x] 账户系统：认证详情/审核、登录/离线日志、失败 IP 处置、反馈和八位邀请码
- [x] 资金系统：额度科目 CRUD、金额范围、原子幂等调整和分页台账
- [x] 管理系统：管理账号独立 TOTP、角色、厂商推送、公告、图片、操作和报错日志
- [x] 聊天系统：会话密文审计、客服、群监控、群发言、通讯录、机器人和群邀请码
- [x] 删除资源管理、系统配置、定时任务、定时任务日志和短信管理菜单及编辑白名单
- [x] 公告、群发言与机器人人工触发通过 SignalR 通知在线成员并写发送日志
- [x] 所有审核、配置、资金、会话、邀请码和处置操作写入管理员审计日志
- [x] `ADMIN_REQUIREMENTS_060_OK` 覆盖认证、日志、资金、TOTP、推送、公告和聊天治理 API
- [x] `ADMIN_060_OK` 覆盖 7 类模块、25 个页面、权限、账号菜单及桌面/手机布局
- [x] 1440×900 桌面与 390×844 手机折叠菜单视觉回归通过
- [x] 确认旧发布域名返回 401，而开发端口返回 200，定位环境版本不一致
- [x] 无 MongoDB 的发布演示自动创建并恢复预览管理员，持久化生产不降级安全策略
- [x] 管理登录页显示 API 版本和预览模式，并提供一键预览管理员登录
- [x] 生产模式无数据库回归验证默认管理员返回 200
- [x] 开发预览启动时修复既有 `e_admin` 的旧密码、普通角色、停用和锁定状态
- [x] 生产环境不重置既有管理员密码，继续要求显式密码与 TOTP 配置
- [x] 公开预览使用 `E_Admin` / `Heibai@99` 登录返回 200 并进入管理后台
- [x] 独立 `/admin` HTML5 响应式管理后台，桌面侧栏与手机抽屉导航
- [x] 开发预览默认管理账号 `E_Admin`，密码使用 ASP.NET PasswordHasher 存储
- [x] 生产环境仅通过 `ADMIN_BOOTSTRAP_PASSWORD` 创建管理员并强制 TOTP
- [x] 运营概览：用户、设备会话、聊天会话、消息和待处理举报统计
- [x] 用户查询、状态筛选、限制、停用、恢复和强制退出全部设备
- [x] 邀请码创建/更新、使用次数与有效状态展示
- [x] 朋友圈举报队列、发布者/举报者资料和确认处置/驳回
- [x] 用户治理、邀请码、举报处置和设备撤销均写入管理员审计日志
- [x] 普通用户访问管理 API 返回 403，当前管理员不可自我停用
- [x] 1440×900 桌面与 390×844 手机管理后台浏览器回归通过
- [x] 修复桌面双栏中旧会话列表响应覆盖已读清零状态的竞态
- [x] 重复点击当前已选会话也会重新提交已读回执
- [x] 1280×720 桌面验证未读 1 打开后清零，打开期间新消息仍保持 0
- [x] 点击会话后立即乐观清除未读数字并持久化已读游标
- [x] 订阅 `receipt.updated`，保持本地会话计数与服务端一致
- [x] 当前打开会话收到新消息后自动标记已读，避免数字回弹
- [x] 手机列表未实际打开聊天时不提前消费未读消息
- [x] 390×844 手机视口验证 3 条未读进入后清零，打开期间第 4 条保持已读
- [x] 好友申请通过 SignalR 实时送达，联系人变更双端即时刷新
- [x] 好友申请卡片显示申请人昵称、账号、头像和申请说明
- [x] 联系人导航显示待处理申请数字，移动端恢复前台自动补拉
- [x] 手机端联系人显示明确“发消息”按钮
- [x] 手机聊天详情隐藏底部导航，发送按钮适配动态视口和安全区
- [x] 390×844 手机视口完成申请、接受、进入聊天和发送消息回归
- [x] 修复好友通过后立即创建直聊未同步给对方的时序问题；双方自动加入 SignalR 会话组，立即发消息端到端回归通过
- [x] React 19 + HTML5 响应式 PC/手机客户端
- [x] ASP.NET Core 8 API、MongoDB/内存仓库与 SignalR 实时通信
- [x] 邀请码注册、密码登录、JWT、刷新令牌与管理员 TOTP
- [x] 两分钟一次性二维码登录，扫码设备必须确认且只能兑换一次
- [x] 七天个人名片二维码、摄像头扫码、图片识别和粘贴识别
- [x] 登录设备列表、当前设备识别、远程退出和退出其他设备
- [x] 好友、单聊、群聊、文字与富媒体端到端加密消息
- [x] 图片、视频、文件、语音录制、对象存储与鉴权下载
- [x] 朋友圈好友可见、仅自己、部分好友可见和不给谁看
- [x] 朋友圈九宫格媒体、点赞、评论、删除与举报
- [x] 单聊和群聊 WebRTC、动态 ICE 配置、通话记录与最多四人 P2P 边界
- [x] TURN 临时凭据签发接口和 SFU 能力配置入口
- [x] P1 能力状态接口，区分应用层就绪与外部服务未配置
- [x] TypeScript、Vitest 3 项、xUnit 16 项和生产构建通过
- [x] 聊天/朋友圈、二维码/设备、SignalR/通话三组端到端测试通过
- [x] 真实浏览器验证登录码、个人名片、扫一扫、扫码好友、设备和私密动态

## 外部基础设施状态

| 能力       | 应用内状态                        | 生产所需配置                                 |
| ---------- | --------------------------------- | -------------------------------------------- |
| TURN       | 临时凭据签发已实现                | `TURN_URLS`、`TURN_SECRET` 与实际 TURN 服务  |
| SFU        | 能力入口和大群保护已实现          | `SFU_URL` 与实际媒体服务器/客户端 SDK        |
| 推送       | 能力检测已实现                    | APNs、FCM 或厂商推送凭据与发送服务           |
| 媒体流水线 | 上传、类型/大小校验与元数据已实现 | 视频转码、缩略图、病毒扫描、断点续传工作服务 |
| 多设备密钥 | 设备会话和远程退出已实现          | 设备独立身份、密钥验证、换机恢复和群密钥轮换 |
| 朋友圈治理 | 举报提交与查询数据层已实现        | 运营审核后台、处置审计和申诉流程             |

## 已知限制

未配置 MongoDB 时预览使用进程内存，服务重启后测试账号与业务数据会清空。默认 WebRTC 使用公共 STUN 和 P2P，小群采用网状连接；未配置 TURN/SFU 时企业网络、对称 NAT 和较大群聊不具备生产可靠性。云端自动化浏览器没有物理摄像头和麦克风，因此媒体流仍需在真实 PC 或手机上进行设备验收；SignalR 通话状态、通话记录和信令已由双账号自动化测试通过。朋友圈媒体按可见范围鉴权，但不属于聊天会话端到端加密范围。

## iOS 原生语音 SDK 迁移（OpenIM + LiveKit）
- [x] 确认架构：OpenIM 负责通话信令，LiveKit 原生 SDK 负责音频媒体，CallKit/PushKit 负责系统来电
- [x] 新增受保护接口 `GET /api/openim/session?platform=ios|android`
- [x] 服务端仅从 `OPENIM_ADMIN_TOKEN` / `OpenIM:AdminToken` 读取 OpenIM 管理员 token，不向客户端暴露
- [x] 服务端按 EChat 用户 ID 自动同步 OpenIM 用户并签发短期用户 token
- [x] 返回 OpenIM API、WebSocket 和 LiveKit 地址供原生桥接使用
- [x] 增加 OpenIM 配置健康检查和 API 回归测试
- [ ] 接入 OpenIM iOS SDK（官方仓库为 AGPL-3.0 或商业许可，需确认授权路线）
- [ ] 接入完整 LiveKit Swift SDK 的 Room/AudioManager，而不是当前仅底层 `LiveKitWebRTC` 包
- [ ] 将 OpenIM signalingInvite/accept/hangup 与 CallKit/PushKit 生命周期接通
- [ ] iOS 真机验证锁屏接听、听筒/外放/蓝牙、中断恢复和第二通电话
- [ ] 群会话中选择一名成员建立一对一通话；不创建多人房间
