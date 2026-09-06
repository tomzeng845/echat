# E聊 iOS 与 TestFlight 发布说明

## 当前结论

E聊 iOS 客户端已基于 Capacitor 8 生成 Xcode 工程，Bundle ID 默认为 `com.echat.app`，版本为 `0.9.0 (18)`，最低支持 iOS 15。普通消息、好友申请和测试通知使用 APNs alert；真实音视频来电使用 PushKit VoIP push，并立即交给 CallKit 显示系统来电界面。相机、麦克风、通知、后台音频、刘海屏和 Home Indicator 安全区已经接入应用代码。

> **当前是“源码与 Linux 可验证范围就绪”，不是“已上传 TestFlight”。** 当前执行环境是 Linux，没有 Xcode、Apple Developer/App Store Connect 凭据或可用 macOS 构建机，因而无法生成 Apple 签名 Archive/IPA、上传构建、等待 Apple 处理或进行 iPhone 真机验收。

## 实现映射

| 能力            | Apple/Capacitor 要求                                                | E聊实现                                                                                                      |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Capacitor iOS   | Capacitor 8 要求 Xcode 26 或更新版本；最低 iOS 15                   | Swift Package Manager 工程，deployment target 为 iOS 15 [1]                                                  |
| APNs 普通推送   | Target 开启 Push Notifications，并把 APNs 注册结果转交 Capacitor    | `AppDelegate.swift` 转发 registration；Web 层上传 `platform=ios` token [2]                                   |
| VoIP 后台来电   | PushKit 仅用于真实 VoIP；收到 push 后及时报告 CallKit               | `ios-voip` token、`CXProvider` 系统来电、接听/拒接/远端结束与多设备清理 [3] [4]                              |
| 服务端发送      | HTTP/2、ES256 provider token、正确 topic 和 push type               | 普通 topic 为 Bundle ID；VoIP topic 为 `{BundleId}.voip`，即时过期并按 `callId` 折叠                         |
| 媒体权限        | 使用用途说明并按需申请相机、麦克风和相册权限                        | `Info.plist` 用途说明和 Capacitor 自定义 Swift plugin                                                        |
| 后台能力        | 通话期间音频、远程通知、VoIP 唤醒                                   | `audio`、`remote-notification`、`voip` background modes                                                      |
| App 隐私        | 声明数据收集、是否关联/跟踪、用途和 Required Reason API             | 声明账号、社交图、消息、媒体、反馈、标识、使用/诊断及粗略地区；不跟踪；UserDefaults 理由为 `CA92.1` [9] [10] |
| TestFlight 上传 | 唯一 build string、Apple 签名、App Store Connect 应用记录和上传权限 | `scripts/ios-testflight.sh` 执行 sync、archive、export、validate 和 upload [5]                               |

## 推送与通话数据流

登录后，客户端分别注册普通 APNs token 和 PushKit VoIP token。服务端允许同一用户、同一设备同时保存 `ios` 与 `ios-voip` 两条记录；注销设备会停用该设备全部平台。普通消息、好友申请和测试通知只发往 `ios`；音视频邀请只发往 `ios-voip`。无效、已注销或 APNs 返回 410 的 token 会被自动停用。

VoIP payload 包含 `callId`、`conversationId`、通话模式和主叫显示信息，不包含聊天正文。服务端生成的 `callId` 是 UUID，并同时作为 CallKit UUID。用户在 CallKit 点击接听后，WebRTC 状态机执行 `CallPrepareAnswer` 和 `CallAccept`；拒接会通知主叫方；任一设备接听、拒接或挂断后，服务端发送 `action=end` VoIP push 清理其他 iOS 设备上仍显示的系统来电。

## Apple 资源与秘密配置

APNs 发送 Key 与 App Store Connect 上传 Key 是两类用途。即使 Apple 后台可能允许同一团队管理它们，也应按最小权限分别创建、轮换和保存，不能把 `.p8`、证书、密码或 provisioning profile 放入源码仓库。

| 配置                             | 用途                                           | 位置                |
| -------------------------------- | ---------------------------------------------- | ------------------- |
| `APNS_TEAM_ID`                   | APNs provider JWT 的 Apple Team ID             | 仅服务端秘密管理    |
| `APNS_KEY_ID`                    | APNs Key ID                                    | 仅服务端秘密管理    |
| `APNS_BUNDLE_ID`                 | APNs topic，默认 `com.echat.app`               | 服务端部署配置      |
| `APNS_PRIVATE_KEY`               | APNs PKCS#8 PEM；可用 `\n` 转义换行            | 仅服务端秘密管理    |
| `APNS_USE_SANDBOX`               | Debug 真机为 `true`；TestFlight/生产为 `false` | 服务端部署配置      |
| `APPLE_TEAM_ID`                  | Xcode 自动签名 Team ID                         | macOS 构建机 Secret |
| `APP_STORE_CONNECT_KEY_ID`       | App Store Connect API Key ID                   | macOS 构建机 Secret |
| `APP_STORE_CONNECT_ISSUER_ID`    | App Store Connect issuer UUID                  | macOS 构建机 Secret |
| `APP_STORE_CONNECT_API_KEY_PATH` | 只可下载一次的上传 `.p8` 文件路径              | 项目外安全目录      |

首次上传前还必须完成以下 Apple 侧资源：在 Apple Developer 注册属于目标团队的 `com.echat.app` App ID，开启 Push Notifications；确认 provisioning profile 含 APNs entitlement；在 App Store Connect 创建同 Bundle ID 的应用记录。如果该 Bundle ID 不属于用户团队或已被其他团队占用，必须在首次上传前统一修改 Capacitor、Xcode、APNs topic 和 App Store Connect 记录。

## 构建与上传方案

| 方案                                | 自动化程度 | 适用场景                            | 当前状态                                     |
| ----------------------------------- | ---------- | ----------------------------------- | -------------------------------------------- |
| 受控 Mac 执行 `pnpm ios:testflight` | 高         | 有固定 Mac、希望可重复 Archive/上传 | 脚本已完成；缺 Apple 凭据和 Mac 实跑         |
| Xcode Organizer 或 Transporter      | 中         | 首次签名排错、人工选择 Team/profile | 可作为上传脚本回退方案                       |
| GitHub Actions macOS runner         | 高         | 已有私有 GitHub 仓库并希望 CI 发布  | 当前 GitHub connector 未启用，尚未创建工作流 |

推荐先在受控 Mac 上用 Xcode 打开一次工程，确认 Team、Bundle ID、capability 与真机 PushKit/CallKit，再使用脚本重复上传：

```bash
pnpm install --frozen-lockfile
python3 scripts/validate-ios-project.py
pnpm ios:sync
pnpm ios:open

export APPLE_TEAM_ID='你的十位 Team ID'
export APP_STORE_CONNECT_KEY_ID='你的十位 API Key ID'
export APP_STORE_CONNECT_ISSUER_ID='你的 Issuer UUID'
export APP_STORE_CONNECT_API_KEY_PATH='/安全目录/AuthKey_xxx.p8'
export ECHAT_IOS_API_URL='https://你的正式E聊域名'
# 可选；每次上传必须唯一，脚本默认使用 UTC 时间生成
export ECHAT_IOS_BUILD_NUMBER='19'
pnpm ios:testflight
```

脚本要求 macOS 与 Xcode 26 或更新版本，执行 `xcodebuild archive`、`-exportArchive`、`xcrun altool --validate-app` 和 `--upload-app`。它会在 `releases/` 生成 IPA、SHA-256 和不含秘密的上传元数据；复制到 Apple CLI 约定目录的临时 Key 会在脚本结束时删除。Apple 当前仍将 Xcode、`altool`、Transporter 和 App Store Connect API 列为上传方式。[5]

## App Privacy 与出口合规

Apple 把发送到设备外并保留的私聊、照片/视频、语音、账号/用户标识及设备标识视为收集数据。非短信私聊必须声明 Emails or Text Messages；使用 IP 推断并保存地区时，应按用途声明 Coarse Location、Device ID 或 Diagnostics。即使数据只用于 App Functionality，也仍需披露。[10]

E聊隐私清单目前声明 Name、Phone Number、Coarse Location、Contacts、Emails or Text Messages、Photos or Videos、Audio Data、Other User Content、Customer Support、User ID、Device ID、Other Usage Data 和 Other Diagnostic Data。这些数据均声明为与账号关联、用于 App Functionality、不用于跨应用跟踪。App Store Connect 的隐私营养标签、隐私政策 URL 和数据删除说明仍需账号持有人根据最终生产环境与第三方服务逐项确认。

`ITSAppUsesNonExemptEncryption=false` 表示项目当前判断标准 HTTPS、系统 WebCrypto 及历史消息兼容解密属于豁免范围，并非“应用不使用加密”。最终提交人必须根据发布地区、实际加密用途和 Apple 问卷再次确认；如 Apple 要求出口合规文档，应在 App Store Connect 提交后再锁定此值。

## 验证结果与 TestFlight 待办

| 验证项                          | 结果                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript 与 ASP.NET Core 编译 | 通过，0 error / 0 warning                                                              |
| Vitest                          | 15/15 通过，含 iOS APNs token、VoIP token、CallKit `answerRequested` 与 Android 防回归 |
| xUnit                           | 25/25 通过，含 APNs JWT/payload/header、多平台 token 与停用                            |
| 生产构建                        | React/Vite 与 .NET Release publish 通过                                                |
| Capacitor iOS sync              | 通过；自定义 Swift、entitlement 和隐私清单未被覆盖                                     |
| iOS 静态检查                    | plist、PBX 引用、版本、图标、铃声、隐私声明、密钥泄漏检查通过                          |
| Android 回归                    | `testDebugUnitTest`、`lintDebug`、`assembleDebug` 通过                                 |
| 推送 API 冒烟                   | Android 1 token 与 iOS alert/VoIP 2 token 注册、平台校验、整设备停用通过               |
| 业务回归                        | 登录、好友、未读、明文/历史消息、后台、GeoIP、SignalR/WebRTC 通话通过                  |
| Xcode 编译/签名                 | **待 macOS Xcode 26**                                                                  |
| APNs/PushKit/CallKit 真机       | **待 Apple Key、provisioning 与两台 iPhone**                                           |
| TestFlight 上传/处理/安装       | **待 App Store Connect 应用记录、上传 Key 与测试员**                                   |

App Store Connect 接收构建后还要等待处理。TestFlight 构建可测试 90 天；最多支持 100 名内部测试员和 10,000 名外部测试员；首次外部测试构建需要 Beta App Review。上传前还需准备 Beta 说明、反馈邮箱、出口合规、隐私信息和可公开访问的隐私政策。[6]

## 参考资料

[1]: https://capacitorjs.com/docs/ios "Capacitor iOS Documentation"
[2]: https://capacitorjs.com/docs/apis/push-notifications "Capacitor Push Notifications API"
[3]: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit "Apple Responding to VoIP Notifications from PushKit"
[4]: https://developer.apple.com/documentation/callkit "Apple CallKit Documentation"
[5]: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/ "Apple Upload Builds"
[6]: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview "Apple TestFlight Overview"
[7]: https://developer.apple.com/help/account/keys/create-a-private-key-to-access-service "Apple Create a Private Key to Access a Service"
[8]: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api "Apple Required Reason API"
[9]: https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest "Apple TN3184"
[10]: https://developer.apple.com/app-store/app-privacy-details/ "Apple App Privacy Details"
