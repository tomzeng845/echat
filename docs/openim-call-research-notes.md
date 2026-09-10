# OpenIM 通话能力核对记录

检索日期：2026-09-11

## 官方结论

OpenIM 官方 Android 和 iOS Demo 的开源版本支持一对一音频和视频通话。通话服务需要额外部署并配置 LiveKit 服务，不能只部署 OpenIM Server。官方 Demo 明确说明，多方音视频和视频会议需要联系 OpenIM 官方或采用额外方案。

## 官方地址

- OpenIM SDK 总览：https://openim.io/sdk/
- OpenIM Android Demo：https://github.com/openimsdk/open-im-android-demo
- OpenIM iOS Demo：https://github.com/openimsdk/openim-ios-demo
- OpenIM Docker：https://github.com/openimsdk/openim-docker
- OpenIM 文档：https://docs.openim.io/
- 官方 Android 通话文档搜索结果：https://docs.openim.io/sdk/android/calling/managing-calls/accept-call
- 官方 iOS 通话概览：https://docs.openim.io/sdk/ios/calling/overview-calling

## 接入要求

Android Demo 使用 OpenIM Android Client SDK，并通过 OpenIM Server 的 API、消息网关和 Chat API 工作。iOS Demo 使用 OpenIM iOS SDK，通过 CocoaPods 集成。两端的通话建立依赖 OpenIM 的信令和 LiveKit 媒体服务。

## 对 E聊的影响

本项目可以保留现有 E聊消息系统，只替换语音/视频通话链路，但需要在 Android 和 iOS 原生层接入 OpenIM 通话信令 SDK/API、LiveKit 客户端媒体 SDK、CallKit/Android 后台来电桥接，并由 E聊 ASP.NET API 签发 OpenIM 用户 Token 与 LiveKit 房间凭据。没有 OpenIM Server 和 LiveKit 的可用地址、密钥和用户 Token，不能完成可运行的端到端发布包。

## 许可注意

OpenIM Android/iOS Demo 和相关开源组件包含 AGPL-3.0 及附加条款；发布闭源或商业 App 前需要审查许可证并确认是否需要商业授权。OpenIM Server 仓库为 Apache-2.0，但客户端 Demo 与 SDK 的许可证需要分别核对。
