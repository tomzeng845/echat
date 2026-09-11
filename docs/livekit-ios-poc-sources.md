# LiveKit iOS POC 官方资料

- Swift SDK: https://github.com/livekit/client-sdk-swift
- CallKit 示例: https://github.com/livekit-examples/swift-example-collection/tree/main/callkit
- Android SDK: https://github.com/livekit/client-sdk-android
- JS SDK: https://github.com/livekit/client-sdk-js
- C++ SDK: https://github.com/livekit/client-sdk-cpp

关键官方要求：

1. LiveKit 默认会管理 AVAudioSession；接入 CallKit 时应尽早设置 `AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false`。
2. 在 CallKit `provider(_:didActivate:)` / `didDeactivate` 窗口协调音频引擎；官方示例使用 `AudioManager.shared.setEngineAvailability(.none)` 阻止引擎在 CallKit 激活窗口外启动，激活时设置 `.default`。
3. `AVAudioSession` 在启用/发布麦克风前应使用 `.playAndRecord` 与 `.voiceChat` 或 `.videoChat`。
4. 官方 CallKit 示例明确说明 PushKit、CallKit、来电报告、answer/end 生命周期仍由 App 负责；SDK 提供媒体引擎与音频管理，不自动托管完整系统通话生命周期。
5. 官方示例提到 `pushRegistry(_:didReceiveIncomingPushWith:)` 与 `reportNewIncomingCall` 的线程/时序会影响锁屏来电 UI，必须在真实设备验证。
