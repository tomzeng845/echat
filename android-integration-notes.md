# E聊 Android 0.8.0 集成说明

## 技术路线

E聊使用 Capacitor 8 将现有 React 19 HTML5 客户端封装为 Android 应用，保留 ASP.NET Core 8、SignalR、端到端加密、富媒体和 WebRTC 链路。Android 应用打包本地 Web 资源，并通过 `VITE_ECHAT_API_BASE_URL` 连接 HTTPS API。

## 官方依据

| 主题             | 采用方式                                                                                                                        | 官方来源                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Android 容器     | Capacitor 8；最低 API 24，使用 Android System WebView                                                                           | [Capacitor Android](https://capacitorjs.com/docs/android)                                  |
| 消息推送         | `@capacitor/push-notifications` 接收 FCM；Android 13+ 运行时请求通知权限；`google-services.json` 放在 `android/app/`            | [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)       |
| 服务端推送       | FCM HTTP v1；服务账号使用 OAuth 2.0 短期访问令牌；请求发送至 `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send` | [Firebase FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api)       |
| 刘海屏和系统栏   | Android 15 / target SDK 35+ 强制边到边；可点击内容需避开 system bars 与 display cutout insets                                   | [Android edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge) |
| WebView 安全区   | Capacitor 8 System Bars 默认向 WebView 注入 `--safe-area-inset-*`，用于修复部分旧 WebView 的 CSS `env()` 安全区值               | [Capacitor System Bars](https://capacitorjs.com/docs/apis/system-bars)                     |
| 摄像头权限       | Android 原生权限与 WebView 媒体授权结合；相册选择可使用系统 Photo Picker                                                        | [Capacitor Camera](https://capacitorjs.com/docs/apis/camera)                               |
| 自定义权限桥     | `@CapacitorPlugin` 定义 CAMERA/RECORD_AUDIO 别名，使用 `requestPermissionForAliases` 和 `@PermissionCallback`                   | [Capacitor Android Plugin Guide](https://capacitorjs.com/docs/plugins/android)             |
| Android 构建工具 | 官方 Linux command line tools 包 `commandlinetools-linux-15859902_latest.zip`                                                   | [Android Studio downloads](https://developer.android.com/studio)                           |

## 安全与运行边界

FCM 客户端文件 `google-services.json` 不包含服务端私钥，但按工程配置文件管理且不提交本仓库。`FCM_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_APPLICATION_CREDENTIALS` 属于服务端秘密，只通过部署平台秘密变量注入。通知载荷不包含消息明文，只包含“加密消息/图片/语音/视频/文件”等摘要、会话编号和消息编号；用户点击通知后由客户端从 API 拉取密文并在设备上解密。

应用通过精确允许的 `https://localhost` / `capacitor://localhost` Origin 访问生产 API，不开放任意生产跨域来源。所有 REST 与 SignalR 地址必须使用 HTTPS/WSS；Android Manifest 禁止明文 HTTP。摄像头和麦克风仅在用户执行扫码、录音或通话操作时请求，并可由用户在系统设置中撤销。
