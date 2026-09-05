# E聊 Android 0.8.5 集成说明

## 0.8.5 后台通知栏回退

生产健康接口此前显示 `push.enabled=false`，说明服务端没有 Firebase 服务账号；0.8.4 因此只有前台 SignalR 提示音，APP 切到后台后不会产生 Android 系统通知。0.8.5 加入 `@capacitor/local-notifications`：登录后无论 FCM 是否配置，都会检查 Android 13+ `POST_NOTIFICATIONS` 权限并创建 `messages-v2`、`calls-v2` 声音频道。`App.appStateChange` 记录前后台状态；进程仍存活且 SignalR 收到新消息/来电时，前台继续播放应用内提示音，后台则调度即时本地通知，点击后通过 `extra` 中的会话编号回到目标会话。

本地通知与 FCM 是互补而不是替代关系。APP 只切到后台且 WebView/SignalR 尚未被系统冻结时，本地通知无需 Firebase 即可立即显示；APP 被 Doze 冻结、强制停止或进程被杀死后，任何本地 JavaScript 都无法接收服务器事件，必须由 FCM 唤醒系统通知。若 FCM 已配置，后台事件由服务端 FCM 负责，客户端不会再调度同一条本地通知；消息编号和通话编号还用于 5 秒去重。通知摘要不含端到端加密正文。

## 0.8.4 错误密钥缓存自愈

0.8.3 只在本地完全缺少某个 `keyVersion` 时获取设备信封。已经由旧竞态写入 IndexedDB 的错误 AES 密钥仍会被当作有效缓存，首次解密直接失败；发送者还能用该错误密钥生成服务端接受、但其他成员无法解开的同版本密文。0.8.4 不再只按“会话编号 + 版本号存在”判断有效性：每次应用生命周期内至少使用当前不可导出 RSA 私钥实际解封服务器返回的当前设备信封，验证后才信任对应本地 AES 密钥。无法解封说明设备身份已经变化，客户端会用成员当前设备公钥轮换到下一版本。

消息解密第一次失败时会绕过本地缓存，重新获取指定版本设备信封、覆盖 IndexedDB 后再解密一次。发送文字和富媒体前也强制用服务器当前设备信封校准；若当前设备没有服务器信封则阻止发送，而不是继续制造不可被其他成员解密的消息。三设备真实页面回归会主动把版本 3 缓存替换成随机错误 AES 密钥，验证收到消息恢复成功；随后再次写入错误密钥，验证 APP 发送前自愈且好友端能正常解密。

## 0.8.3 新消息密钥恢复与提示音

0.8.2 的会话轮换只在会话主记录保留最新信封。`conversation.updated` 与 `message.created` 是两个独立 SignalR 事件；新消息先到、会话刷新尚未写入 IndexedDB 时，客户端会找不到该消息的 `keyVersion`，从而误显示“该消息发送于本设备加入加密会话之前”。同一 `deviceId` 重装后还可能在新公钥发布前由实时连接触发轮换。0.8.3 强制先发布当前设备公钥，再加载会话和启动 SignalR；同时在内存仓库与 MongoDB `conversationKeyEnvelopes` 集合为每个版本保存不可变设备信封快照，并提供只向会话成员返回当前设备指定版本信封的 API。客户端解密前若本地缺钥，会即时获取、用本机不可导出 RSA 私钥打开并保存，再解密该条消息。真正没有历史设备信封时仍保持原安全提示。

Android 原生桥使用 `MediaPlayer` 播放 `res/raw/echat_message.wav` 与 `res/raw/echat_call.wav`。消息音短促且只播放一次；语音和视频来电铃声循环播放，在接听、拒绝、对方结束、本机挂断或 Activity 销毁时释放。前台 SignalR 和前台 FCM 以消息/通话编号做 5 秒去重；FCM 后台通知迁移到带自定义声音的 `messages-v2` 与 `calls-v2` 频道，避免既有 Android 通知频道声音不可变导致升级后仍静音。

## 0.8.2 消息解密与通话音频

旧实现只在账号上保存一个 RSA 公钥，新 Android WebView 生成身份密钥后会覆盖浏览器公钥，而已有会话信封仍由旧公钥封装，因此 APP 无法解开旧信封。0.8.2 改为按 `deviceId` 保存公钥；会话和消息携带 `keyVersion`。新设备无法打开当前信封时，会读取会话成员的设备公钥，为所有当前设备生成下一版本 AES 会话密钥信封。原设备保留旧版本本地密钥，因此历史消息仍可解密；APP 与其他成员设备使用新版本收发后续消息。服务端拒绝用旧版本继续发送，避免同一会话出现不可判定的密钥分叉。

语音通话原先没有渲染远端 `MediaStream` 的 `audio` 元素，导致信令和音轨建立后仍无声音；视频元素也只依赖一次 `autoPlay`。0.8.2 为语音通话显式挂载远端音频元素，并在 `loadedmetadata` / `canplay` 后主动播放；视频也采用相同重试。Android 原生层进入 `MODE_IN_COMMUNICATION`，以 `USAGE_VOICE_COMMUNICATION` / `CONTENT_TYPE_SPEECH` 请求临时音频焦点，并提供听筒/扬声器切换。语音默认听筒，视频默认扬声器，挂断后清除通信设备并恢复普通音频模式。

## 0.8.1 登录防闪退

0.8.0 测试 APK 未包含项目方 `google-services.json`，但登录成功后会无条件执行 Capacitor Push Notifications 的 `register()`。该插件内部直接调用 `FirebaseMessaging.getInstance()`；Firebase 默认应用不存在时，部分设备会因此终止 Activity。

0.8.1 改为三级门控：先查询服务端 `/api/push/status`，服务端 FCM 未启用时立即降级且不触发任何原生推送 API；服务端启用后，再由原生桥接检查 APK 是否包含 `google_app_id`；只有两项均就绪时才注册通知监听、请求通知权限并获取 FCM token。任一配置缺失时个人中心显示“待配置 FCM”，但聊天、SignalR、摄像头、麦克风和音视频通话继续正常工作。

## 技术路线

E聊使用 Capacitor 8 将现有 React 19 HTML5 客户端封装为 Android 应用，保留 ASP.NET Core 8、SignalR、端到端加密、富媒体和 WebRTC 链路。Android 应用打包本地 Web 资源，并通过 `VITE_ECHAT_API_BASE_URL` 连接 HTTPS API。

## 官方依据

| 主题             | 采用方式                                                                                                                        | 官方来源                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Android 容器     | Capacitor 8；最低 API 24，使用 Android System WebView                                                                           | [Capacitor Android](https://capacitorjs.com/docs/android)                                  |
| 消息推送         | `@capacitor/push-notifications` 接收 FCM；Android 13+ 运行时请求通知权限；`google-services.json` 放在 `android/app/`            | [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)       |
| 后台本地通知     | `@capacitor/local-notifications` 在进程存活且 APP 位于后台时发布通知栏消息；点击通过 `extra` 跳转会话                           | [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)     |
| 服务端推送       | FCM HTTP v1；服务账号使用 OAuth 2.0 短期访问令牌；请求发送至 `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send` | [Firebase FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api)       |
| 刘海屏和系统栏   | Android 15 / target SDK 35+ 强制边到边；可点击内容需避开 system bars 与 display cutout insets                                   | [Android edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge) |
| WebView 安全区   | Capacitor 8 System Bars 默认向 WebView 注入 `--safe-area-inset-*`，用于修复部分旧 WebView 的 CSS `env()` 安全区值               | [Capacitor System Bars](https://capacitorjs.com/docs/apis/system-bars)                     |
| 摄像头权限       | Android 原生权限与 WebView 媒体授权结合；相册选择可使用系统 Photo Picker                                                        | [Capacitor Camera](https://capacitorjs.com/docs/apis/camera)                               |
| 自定义权限桥     | `@CapacitorPlugin` 定义 CAMERA/RECORD_AUDIO 别名，使用 `requestPermissionForAliases` 和 `@PermissionCallback`                   | [Capacitor Android Plugin Guide](https://capacitorjs.com/docs/plugins/android)             |
| 通话音频路由     | VoIP 使用 `MODE_IN_COMMUNICATION`；Android 12+ 通过 `setCommunicationDevice` 选择听筒或扬声器并在挂断时清除                     | [Android AudioManager](https://developer.android.com/reference/android/media/AudioManager) |
| 音频焦点         | 播放通话语音前申请临时焦点，使用语音通信 AudioAttributes，结束后释放                                                            | [Manage audio focus](https://developer.android.com/media/optimize/audio-focus)             |
| 消息与来电提示音 | `MediaPlayer` 播放应用 `res/raw` 音频；消息单次播放，前台来电循环并在通话状态变化时释放                                         | [Android MediaPlayer](https://developer.android.com/reference/android/media/MediaPlayer)   |
| Android 构建工具 | 官方 Linux command line tools 包 `commandlinetools-linux-15859902_latest.zip`                                                   | [Android Studio downloads](https://developer.android.com/studio)                           |

## 安全与运行边界

FCM 客户端文件 `google-services.json` 不包含服务端私钥，但按工程配置文件管理且不提交本仓库。`FCM_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_APPLICATION_CREDENTIALS` 属于服务端秘密，只通过部署平台秘密变量注入。通知载荷不包含消息明文，只包含“加密消息/图片/语音/视频/文件”等摘要、会话编号和消息编号；用户点击通知后由客户端从 API 拉取密文并在设备上解密。

应用通过精确允许的 `https://localhost` / `capacitor://localhost` Origin 访问生产 API，不开放任意生产跨域来源。所有 REST 与 SignalR 地址必须使用 HTTPS/WSS；Android Manifest 禁止明文 HTTP。摄像头和麦克风仅在用户执行扫码、录音或通话操作时请求，并可由用户在系统设置中撤销。
