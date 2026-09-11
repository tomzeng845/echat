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

## Build 242 后确定的原生媒体层方案

- 纯 WebRTC XCFramework（不包含 LiveKit Room 与 Rust 运行时）：https://github.com/livekit/webrtc-xcframework
- 固定版本 `150.7871.02` 的 Swift Package 声明：https://raw.githubusercontent.com/livekit/webrtc-xcframework/main/Package.swift
- WebRTC iOS `RTCAudioSession` 官方接口：https://webrtc.googlesource.com/src/+/refs/heads/main/sdk/objc/components/audio/RTCAudioSession.h
- WebRTC iOS 原生 PeerConnection 示例：https://webrtc.googlesource.com/src/+/refs/heads/main/examples/objc/AppRTCMobile/ARDAppClient.m

官方接口确认：`RTCAudioSession.useManualAudio = true` 可阻止 WebRTC 在 CallKit 激活前初始化 VoIP Audio Unit；CallKit `didActivate` 后设置 `isAudioEnabled = true`，`didDeactivate` 时设为 `false`。`RTCAudioSession` 本身提供带锁的 category、mode、sample rate、buffer duration、route override 与 balanced activation API，应用不应让 WKWebView 和原生层同时控制同一 AVAudioSession。

`livekit/webrtc-xcframework` 只提供被重命名为 `LiveKitWebRTC` 的 Google WebRTC Objective-C 二进制，符号以 `LKRTC` 为前缀。它不依赖 LiveKit Room/token/服务器，也不包含 `RustLiveKitUniFFI`，因此可以继续使用 E聊现有 SignalR offer/answer/ICE 协议和 coturn，仅将 iOS 媒体采集、编解码、播放和音频设备控制移出 WKWebView。
