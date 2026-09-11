# E聊原生语音 SDK 资料

## OpenIM

- OpenIM iOS 一对一通话：https://docs.openim.io/sdk/ios/calling/managing-calls/start-single-call
  - `signalingInvite` 负责邀请信令。
  - 一对一通话使用空 `groupID`，只传一个 `inviteeUserID`。
  - 成功回调返回 `roomID`、`token` 等房间凭证；客户端仍需连接媒体引擎。
- OpenIM Android 一对一通话：https://docs.openim.io/sdk/android/calling/managing-calls/start-single-call
  - `groupID` 为空，`inviteeUserIDList` 仅包含一个成员。
  - `platformID`：iOS=1、Android=2。
- OpenIM 获取用户 token：https://docs.openim.io/platform-api/auth/tokens/get-user-token
  - 后端调用 `POST {API_ADDRESS}/auth/get_user_token`。
  - 请求头必须包含唯一 `operationID` 和仅后端持有的管理员 `token`。
  - 请求体为 `{ platformID, userID }`。
- OpenIM 注册用户：https://docs.openim.io/platform-api/user/creating-users/create-a-user
  - 后端调用 `POST {API_ADDRESS}/user/user_register`。
  - 请求体为 `{ users: [{ userID, nickname, faceURL }] }`。

## LiveKit

- Swift CallKit 集成：https://livekit-client-sdk-swift.mintlify.app/platforms/callkit-integration
  - 连接房间前关闭自动音频管理。
  - 仅在 `provider(_:didActivate:)` 中启用音频引擎。
  - 在 `provider(_:didDeactivate:)` 中关闭音频引擎。
  - CallKit、AVAudioSession 和 SDK 音频引擎必须由同一套生命周期协调。
- Swift SDK：https://github.com/livekit/client-sdk-swift

## 当前 E聊服务端约定

- OpenIM API 默认配置：`https://im.superseller88.com`
- OpenIM WebSocket 默认配置：`wss://im.superseller88.com`
- LiveKit 默认配置：`wss://livekit.superseller88.com`
- 管理员 token 只从服务端环境变量 `OPENIM_ADMIN_TOKEN` 或 `OpenIM:AdminToken` 读取，不返回给客户端。
