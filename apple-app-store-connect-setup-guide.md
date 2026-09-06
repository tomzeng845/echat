# E聊 App Store Connect、证书、描述文件与 TestFlight 配置指南

**适用版本：** E聊 iOS 0.9.0（Build 18）  
**当前 Bundle ID：** `com.echat.app`  
**作者：** Manus AI  
**更新日期：** 2026-09-06

## 1. 目标与推荐路线

本指南用于完成 E聊第一次 iOS 发布所需的 Apple 侧配置，包括注册显式 App ID、创建 App Store Connect 应用记录、配置 APNs、完成代码签名、生成 provisioning profile、准备 TestFlight 元数据并邀请内部测试员。

Apple 的对象容易混淆。**App ID** 负责绑定 Bundle ID 和 capability；**签名证书**证明由谁签名；**provisioning profile（描述文件）**把 App ID、证书、设备或分发方式组合在一起；**App Store Connect 应用记录**保存商店和 TestFlight 信息；**APNs Key**供服务端发推送；**App Store Connect API Key**供构建机上传版本。它们不能相互替代。

| 阶段                          | 推荐方式                       | E聊建议                                                                       |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| App ID 与 capability          | Apple Developer 网站           | 显式 App ID `com.echat.app`，开启 Push Notifications                          |
| 本机真机调试签名              | Xcode 自动签名                 | 由 Xcode 创建 Apple Development 证书和开发描述文件                            |
| App Store/TestFlight 分发签名 | Xcode 自动签名与云管理证书     | 第一次先用 Xcode Organizer 完成，稳定后使用项目脚本                           |
| APNs 服务端认证               | `.p8` token Key                | 第一阶段使用 **Production Team Scoped** Key，确保同时覆盖 alert 与 VoIP topic |
| TestFlight 自动上传           | App Store Connect Team API Key | 先验证上传角色；签名与 provisioning 权限需单独确认                            |

> **推荐结论：优先使用 Xcode 的 Automatically manage signing。** Xcode 13 及以后可在 Organizer 分发流程中使用云管理分发证书；若使用自动签名，通常不需要手工创建开发或 App Store Connect 描述文件。[5] [6] 手工流程应只作为团队策略要求或自动签名排错的备用方案。

> **自动签名与手工签名是两条互斥路线。** 当前 E聊 Xcode 工程和 `scripts/ios-testflight.sh` 均配置为 Automatic。选择第 6 节后，不要再在 Release 中固定手工 profile；选择第 7 节后，不要直接运行现有 `pnpm ios:testflight`，因为该脚本会执行 `-allowProvisioningUpdates` 并按自动签名导出。手工 CI 需要另行配置 Manual、签名身份和 `PROVISIONING_PROFILE_SPECIFIER`。

## 2. 开始前的账户与环境检查

注册 App ID 需要 **Account Holder 或 Admin**。创建 App Store Connect 应用记录需要 **Account Holder、Admin 或 App Manager**。在创建应用记录前，Account Holder 必须先在 App Store Connect 的 **Business（商务）**页面接受最新协议，否则 New App 按钮可能不可用。[1] [2]

| 操作                               | 通常所需角色/权限                           | 关键边界                                      |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------- |
| 接受 Business 协议                 | Account Holder                              | 不能由上传 API Key 代替                       |
| 注册 App ID、创建 APNs Key/profile | Account Holder 或 Admin                     | 属于 Apple Developer 资源权限                 |
| 创建应用记录                       | Account Holder、Admin 或 App Manager        | 属于 App Store Connect 权限                   |
| 创建 Team API Key                  | App Store Connect Admin                     | Key 的角色控制 API 范围                       |
| Xcode 自动注册设备/App ID          | 取决于成员角色及 Automatic Signing Controls | 与“能上传构建”不是同一权限 [16]               |
| 上传构建                           | 按 App Store Connect 角色矩阵授权           | 还需目标 App access；不代表可管理证书/profile |

请先完成下表。不要在聊天、邮件、代码仓库或工单中发送 `.p8`、`.p12`、密码或完整私钥内容。

| 检查项                  | 要求                                                 | 完成后记录               |
| ----------------------- | ---------------------------------------------------- | ------------------------ |
| Apple Developer Program | 会员有效，目标 Team 可用                             | Team 名称、10 位 Team ID |
| App Store Connect 协议  | Business 页面没有待签协议                            | 协议状态                 |
| 操作账号角色            | 推荐 Account Holder 或 Admin 完成首次配置            | 账号角色                 |
| Bundle ID               | 首选 `com.echat.app`，必须在目标 Team 可注册         | 可用或需更换             |
| 构建环境                | macOS，Xcode 26 或更新版本，Node.js/pnpm/Python 3    | Mac 与 Xcode 版本        |
| 真机                    | 至少一台 iPhone；完整通话测试建议两台                | iOS 版本、设备名称       |
| 正式 API                | 有效 HTTPS 地址，不能使用本机 `localhost`            | `ECHAT_IOS_API_URL`      |
| 隐私政策                | 外部测试/商店提交前必须有公网 HTTPS 页面且可匿名访问 | Privacy Policy URL       |
| TestFlight 测试员       | 内部测试员必须先成为 App Store Connect 用户          | Apple Account 邮箱       |

E聊当前代码中的 Bundle ID 已统一为 `com.echat.app`。Bundle ID 在上传首个构建后不能更改；Apple 使用 Bundle ID、版本号和 build string 的组合作为构建身份。[7] 如果 `com.echat.app` 无法注册，不要继续创建应用记录。应先确定新的反向域名，例如 `com.yourcompany.echat`，再统一修改 Capacitor、Xcode、APNs 和 App Store Connect 配置。

## 3. 注册 E聊显式 App ID

打开 [Apple Developer Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)。Apple 要求单个应用使用 **Explicit App ID**，并且这里的 Bundle ID 必须与 Xcode target 完全一致。App ID 中启用的 capability 是允许清单，但仍需在 Xcode target 中加入对应 capability。[1]

1. 登录 Apple Developer，确认页面右上角选择了正确 Team。
2. 进入 **Certificates, Identifiers & Profiles → Identifiers**。
3. 点击左上角 **+**。
4. 选择 **App IDs**，点击 Continue。
5. 类型选择 **App**，点击 Continue。
6. Description 填写 `EChat iOS Production` 或 `E聊 iOS 正式版`。
7. 选择 **Explicit App ID**。
8. Bundle ID 精确填写 `com.echat.app`，不要添加空格、通配符或 `.voip`。
9. 在 Capabilities 中勾选 **Push Notifications**。
10. 点击 Continue，核对 Team、Description、Identifier 和 capability，再点击 Register。

注册后重新打开该 Identifier，确认 **Push Notifications** 已启用。E聊使用的 `audio`、`remote-notification` 和 `voip` 后台模式在 Xcode target 的 Background Modes 以及 `Info.plist` 中配置，不需要额外注册第二个 `.voip` App ID。

### 3.1 不应额外创建的对象

E聊服务端已使用 APNs token authentication，因此**不要创建旧式 VoIP Services Certificate 或单独的 APNs TLS 证书**。也不要为 `com.echat.app.voip` 创建第二个 App ID。PushKit 的 VoIP topic 是主 Bundle ID 派生出的 `{BundleId}.voip`，当前服务端会发送到 `com.echat.app.voip`。

## 4. 创建 APNs 服务端 Key

APNs Key 供 E聊 ASP.NET Core 服务端向 Apple 发普通通知和 VoIP 来电。它不是应用签名证书，也不是 TestFlight 上传 Key。Apple 的 `.p8` 只可下载一次，遗失后只能撤销并重建。[8]

Apple 目前支持 **Team Scoped** 和 **Topic Specific** 两类 APNs Key，并可限制为 Sandbox 或 Production。Team Scoped Key 可发送到该 Team 和指定环境中的所有 topic；Topic Specific Key 只允许关联的 topic。[9]

### 4.1 第一次 TestFlight 的推荐选择

E聊需要同时发送两个 topic：普通通知使用 `com.echat.app`，VoIP 来电使用 `com.echat.app.voip`。为降低首次配置失败风险，建议创建 **Production + Team Scoped** Key。以后如改为 Topic Specific，必须确认 Apple 配置页明确关联了这两个 topic；如果只能看到或选中主 Bundle ID，先不要切换。

1. 打开 **Certificates, Identifiers & Profiles → Keys**。
2. 点击 **+**。
3. Key Name 填写 `EChat APNs Production`。
4. 勾选 **Apple Push Notification service (APNs)**。
5. 点击 APNs 右侧 **Configure**。
6. Environment 选择 **Production**。
7. Key Type 选择 **Team Scoped**。
8. 点击 Continue，核对后点击 Confirm。
9. 立即点击 Download，保存 `AuthKey_<KEY_ID>.p8`。
10. 记录页面上的 10 位 **Key ID**，并从 Membership 页面记录 10 位 **Team ID**。

请把生产 Key 保存到受控密码库或秘密管理系统。若必须使用文件，权限应为 `0600`，并放在项目外。部署时优先使用秘密管理器短时注入或受限文件描述符；禁止 `set -x`，日志只记录 Key ID 和环境，绝不输出 PEM。不要把私钥放入普通 shell profile、CI 调试日志、崩溃转储、E聊项目目录或 Git。

服务端生产环境需要以下值：

```text
APNS_TEAM_ID=<10位Team ID>
APNS_KEY_ID=<10位APNs Key ID>
APNS_BUNDLE_ID=com.echat.app
APNS_PRIVATE_KEY=<由秘密管理服务短时注入的完整 PEM；不要写入配置文件>
APNS_USE_SANDBOX=false
```

`APNS_USE_SANDBOX=false` 是 TestFlight 和 App Store 构建的正确值。直接通过 Xcode 安装的 Debug 真机版本使用 sandbox token，需要独立的 Sandbox Key 或环境，并设置为 `true`。APNs endpoint、Key 环境、device token 和 topic 必须成套记录。不要把 Debug token 发送到 production APNs，也不要把 TestFlight token 发送到 sandbox APNs，否则通常会收到 `BadDeviceToken` 或 topic/environment 相关错误。更换 Key、环境或新建 topic 后，应重建服务端 HTTP/2 连接。[9]

## 5. 创建 App Store Connect 应用记录

App Store Connect 要求先创建应用记录，再上传任何构建。[2] 打开 [App Store Connect](https://appstoreconnect.apple.com/)，完成以下步骤：

1. 进入 **Business**，确认没有待接受协议。
2. 进入 **Apps**。
3. 点击左上角 **+**，选择 **New App**。
4. 按下表填写。
5. 点击 Create，检查是否出现缺失字段或权限错误。

| 字段             | E聊建议值                         | 说明                                                                         |
| ---------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Platforms        | `iOS`                             | 当前只创建 iOS 平台                                                          |
| Name             | `E聊`                             | 2–30 个字符；若已被占用，可使用 `E聊即时通讯`，应用内显示名仍可保留“E聊” [7] |
| Primary Language | `Chinese (Simplified)`            | 未提供其他本地化时使用的默认元数据语言                                       |
| Bundle ID        | `com.echat.app` 对应的 Identifier | 必须从下拉框选择，不是自由输入                                               |
| SKU              | `ECHAT-IOS-001`                   | 内部标识，用户不可见；创建后不可修改 [7]                                     |
| User Access      | `Full Access`                     | 单人或小团队最简单；有权限隔离要求时选 Limited Access                        |

创建成功后，状态应为 **Prepare for Submission**，Apple 会自动生成不可修改的 Apple ID。[2] 立即进入 **App Information** 检查 Bundle ID。如果选错 Bundle ID，且尚未上传构建，可删除记录后重建；上传构建后 Bundle ID 不能更改。

### 5.1 App Information 建议

| 字段               | 建议                                  | 注意事项                                                         |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| Primary Category   | `Social Networking`                   | 与即时通信和社交动态最匹配                                       |
| Secondary Category | `Utilities` 或留空                    | 仅在确实符合时选择                                               |
| Content Rights     | 按真实情况回答                        | E聊允许用户上传内容；运营方必须有相应条款与处置机制              |
| Age Rating         | 完整填写问卷                          | 私聊、群聊和用户生成内容必须如实回答，不要为了低年龄评级隐瞒功能 |
| Made for Kids      | 不选择，除非产品专门面向儿童          | 一旦按 Kids 类别获批，后续限制更严格                             |
| Privacy Policy URL | 真实公网 HTTPS 页面                   | iOS 必填；页面必须可直接访问 [7] [12]                            |
| Availability       | TestFlight 阶段可暂不决定公开商店范围 | 中国大陆正式上架可能需要 ICP 等材料，应在公开发布前确认 [7]      |

当前 E聊代码只有注册页上的“服务协议/隐私政策”文字，尚未发现可公开访问的独立隐私政策页面。**这是一项已知发布阻断项：在提交外部 TestFlight Review 或 App Store Review 前，必须先发布并匿名访问验证真实 Privacy Policy URL。** 不能填写不存在的占位链接，也不能使用需要登录或仅内网可见的地址。[12]

## 6. 推荐签名流程：Xcode 自动签名

Xcode 自动签名会为真机开发管理 Apple Development 证书、注册设备和开发描述文件。Organizer 分发时还可使用云管理 Apple Distribution 证书和分发描述文件。[5] [6]

### 6.1 在 Mac 上打开工程

```bash
cd /你的路径/e-chat
pnpm install --frozen-lockfile
pnpm ios:validate
pnpm ios:sync
pnpm ios:open
```

在 Xcode 中执行以下操作：

1. 打开 **Xcode → Settings → Accounts**。
2. 点击 **+**，添加加入目标 Developer Team 的 Apple Account。
3. 在项目导航器选择蓝色 **App** 项目，再选择 **TARGETS → App**。
4. 打开 **Signing & Capabilities**。
5. 对 Debug 和 Release 均选择正确 Team。
6. 勾选 **Automatically manage signing**。
7. 确认 Bundle Identifier 为 `com.echat.app`。
8. 点击 **+ Capability**，确认存在 **Push Notifications**。
9. 确认存在 **Background Modes**。按 E聊当前真实功能保留通话期间需要的 **Audio**、推送处理需要的 **Remote notifications**，以及界面中可用时的 **Voice over IP**；不要为了“更稳定”勾选应用没有使用的其他后台模式。
10. 等待 Xcode 显示签名状态正常，不应有红色 “No profiles” 错误。

E聊工程目前的 `Info.plist` 已声明 `audio`、`remote-notification` 和 `voip`，源码也实际使用 PushKit、CallKit 和通话音频。`App.entitlements` 通过 build setting 让 Debug 使用 `development`、Release 使用 `production`。不要手工把 Release 改为 development。Xcode 生成或更新 profile 后，应确认签名 profile 包含 Push Notifications entitlement。

### 6.2 真机开发签名

1. 用数据线或受信任的无线调试连接 iPhone。
2. 在 Xcode 顶部运行目标选择该 iPhone。
3. 如提示注册设备，允许 Xcode 注册。
4. 点击 Run。
5. 首次运行时按 iPhone 提示信任开发者模式或启用 Developer Mode。
6. 登录 E聊，允许通知、相机和麦克风权限。

此时 Xcode 通常会自动创建 Apple Development 证书和 `iOS Team Provisioning Profile`。如果团队有 Automatic Signing Controls，Account Holder/Admin 需要确认当前用户允许注册 App ID、设备或修改 capability。

### 6.3 第一次 Archive 与 Organizer 上传

第一次发布建议先人工使用 Organizer，以便直观看到签名问题：

1. 运行目标选择 **Any iOS Device (arm64)** 或 Generic iOS Device。
2. 选择 **Product → Archive**。
3. Archive 完成后，在 Organizer 选择最新 Archive。
4. 点击 **Distribute App**。
5. 选择 **App Store Connect**，再选择 **Upload**。
6. 保持自动签名，完成 Validate。
7. 核对 Team、Bundle ID、Version `0.9.0` 和唯一 Build。
8. 上传并等待 App Store Connect 处理。

首次人工 Archive 成功后，后续可使用仓库中的 `pnpm ios:testflight` 自动执行 Archive、export、validate 和 upload。

## 7. 备用签名流程：手工证书和描述文件

仅当组织禁止自动签名、CI 要求固定身份或 Xcode 自动签名无法使用时采用本节。**一旦选择本节，就应把 target 的 Signing 改为 Manual，并通过 Xcode Organizer 手工上传；不能直接运行当前自动签名版 `pnpm ios:testflight`。** 如需手工签名 CI，必须单独改造脚本：固定 Apple Distribution 身份与 `PROVISIONING_PROFILE_SPECIFIER`，将 ExportOptions 改为 manual，并移除 `-allowProvisioningUpdates` 及自动申请 profile 的认证参数。创建新证书前，先检查团队现有证书数量，**不要为了排错随意撤销其他成员正在使用的证书**。

### 7.1 在 Mac 创建 CSR

Apple 的手工证书需要 Certificate Signing Request（CSR）。打开 `/Applications/Utilities/Keychain Access`，依次选择 **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority**。填写 Apple Account 邮箱和容易识别的 Common Name，CA Email 留空，选择 **Saved to disk**。[10]

CSR 创建时对应私钥会保存在当前 Mac 的 Keychain 中。后续下载的 `.cer` 只有与这把私钥配对才可签名。如果证书显示 “Missing Private Key”，说明 CSR 在另一台 Mac 生成；应从原 Mac 安全导出含私钥的 `.p12`，或重新创建证书。

### 7.2 创建 Apple Development 证书

1. 打开 **Certificates, Identifiers & Profiles → Certificates → +**。
2. 在 Software 下选择 **Apple Development**。
3. 上传刚创建的 `.certSigningRequest`。
4. 生成并下载 `.cer`。
5. 双击 `.cer`，导入当前用户 Keychain。
6. 在 Keychain Access 展开证书，确认下面显示 private key。

Apple Development 证书用于 Xcode 安装和调试真机版本，不用于 TestFlight 分发。

### 7.3 注册测试设备

开发描述文件必须包含真机 UDID。可由 Xcode连接设备后自动注册，也可在 **Devices → +** 手工填写设备名称和 UDID。TestFlight 不需要把测试员设备 UDID 加入 profile。

### 7.4 创建开发描述文件

1. 进入 **Profiles → +**。
2. 选择 **iOS App Development**。
3. 选择 `com.echat.app` App ID。
4. 选择 Apple Development 证书。
5. 选择要安装 Debug 版本的 iPhone。
6. Profile Name 填写 `EChat iOS Development`。
7. 点击 Generate，再 Download。
8. 双击 `.mobileprovision` 安装，或在 Xcode Accounts 中下载手工 profiles。

开发描述文件把 App ID、开发证书和允许的设备组合在一起。Apple 官方说明，自动签名会代替上述手工步骤。[11]

### 7.5 创建 Apple Distribution 证书

重复 CSR 和证书创建流程，但证书类型选择 **Apple Distribution**。下载并导入 `.cer` 后，确认 Keychain 中同时存在证书与 private key。Apple Distribution 证书用于 App Store/TestFlight 分发，不应复制到普通开发人员机器。

### 7.6 创建 App Store Connect 分发描述文件

1. 进入 **Profiles → +**。
2. 在 Distribution 下选择 **App Store Connect**。
3. 选择 `com.echat.app` App ID。
4. 选择 Apple Distribution 证书。
5. Profile Name 填写 `EChat App Store 0.9`。
6. 点击 Generate，再 Download。
7. 安装 `.mobileprovision`。
8. 在 Xcode Release 配置中关闭 Automatically manage signing，选择该 profile 和 Apple Distribution 证书。

App Store Connect profile 只包含一个 distribution certificate，不包含测试设备。若 App ID 的 capability 发生变化，例如后来才开启 Push Notifications，必须重新生成 profile。[6]

可以在 Mac 终端检查 profile 是否包含生产 APNs entitlement：

```bash
security cms -D -i /路径/EChat_App_Store_0_9.mobileprovision > /tmp/echat-profile.plist
/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' /tmp/echat-profile.plist
/usr/libexec/PlistBuddy -c 'Print :Entitlements:aps-environment' /tmp/echat-profile.plist
```

预期 `application-identifier` 以 `.com.echat.app` 结尾，`aps-environment` 为 `production`，`TeamIdentifier` 包含目标 Team ID。部分旧 Apple 账号的 App ID Prefix 可能不等于 Team ID，不能把二者强制视为相同。[18] 如果之后要恢复仓库自带的 TestFlight 脚本，请先把 Debug/Release 重新设为 Automatic，并移除手工 profile specifier。

## 8. 创建 TestFlight 上传 API Key

此 Key 由 App Store Connect 创建，供 `scripts/ios-testflight.sh` 认证上传。它与 Developer Portal 中创建的 APNs Key 完全不同；Apple 明确说明 App Store Connect API Key 不能用于其他 Apple 服务。[4]

1. 以 App Store Connect Admin 登录。
2. 打开 **Users and Access → Integrations**。
3. 左侧选择 **App Store Connect API**。
4. 选择 **Team Keys**。
5. 点击 **Generate API Key** 或 **+**。
6. Name 填写 `EChat TestFlight Upload`。
7. Access 可先选择 **App Manager** 作为构建与应用管理的常用最小角色，但它不是对签名/provisioning 权限的保证。
8. 点击 Generate。
9. 记录页面上的 **Issuer ID** 和 10 位 **Key ID**。
10. 立即下载 `AuthKey_<KEY_ID>.p8`，保存到项目外安全目录。

Team Key 会按角色访问团队应用，不是单应用隔离 Key。**上传权限、Apple Developer 的 Certificates/Identifiers/Profiles 权限以及 Automatic Signing Controls 必须分别验证。** 当前脚本把同一 Team Key 同时传给 `xcodebuild -allowProvisioningUpdates` 和 `altool`；App Manager Key 可能能上传，却因团队签名控制而不能创建或更新 profile。首次应由 Account Holder/Admin 在 Xcode Organizer 完成自动签名和 Archive，再以最小角色测试脚本。不要因为一次失败就长期给 CI Admin 权限。Apple 的 Team API Key 私钥同样只可下载一次。[4] [16]

Mac 上传环境变量如下：

```bash
export APPLE_TEAM_ID='<10位Team ID>'
export APP_STORE_CONNECT_KEY_ID='<10位上传Key ID>'
export APP_STORE_CONNECT_ISSUER_ID='<Issuer UUID>'
export APP_STORE_CONNECT_API_KEY_PATH='/安全目录/AuthKey_xxx.p8'
export ECHAT_IOS_API_URL='https://你的正式E聊域名'
export ECHAT_IOS_BUILD_NUMBER='19'  # 每次上传必须唯一
pnpm ios:testflight
```

脚本会临时复制上传 Key 到 Apple CLI 约定目录，并在结束时删除临时副本。生成的 IPA 和上传元数据位于项目 `releases/`，Apple 私钥不会写入源码。该脚本使用 Xcode 26 环境中的 `xcrun altool --apiKey/--apiIssuer`，仍需在目标 Mac 实测；如果 validate/upload 参数不兼容，应改用 Xcode Organizer 或 Transporter，而不是降低签名安全设置。[3]

## 9. 配置 App Privacy

Apple 要求 iOS 应用提供公开的 Privacy Policy URL，并在 App Store Connect 解释应用及第三方合作方的数据处理。答案按应用级别管理；如果不同平台的数据行为不同，应选择覆盖所有平台的最完整答案。[12]

进入 **Apps → E聊 → App Privacy → Get Started**。按当前服务端实现，应选择 **Yes, we collect data from this app**，因为账号、消息、媒体、推送标识和登录地区会发送到服务端并保留。但下表是**当前代码盘点的建议映射，不是可以不经核对直接提交的固定答案**。提交前必须同时盘点生产数据库/日志、媒体存储、Capacitor/WebView 插件、崩溃分析、统计分析和其他第三方 SDK；只披露实际发送到设备外并保留的数据，并在实现变化后更新。[12]

| Apple 数据类型          | E聊对应数据                      | 与用户关联 | 用于跟踪 | 目的              |
| ----------------------- | -------------------------------- | ---------- | -------- | ----------------- |
| Name                    | 昵称、实名/企业资料中的名称      | 是         | 否       | App Functionality |
| Phone Number            | 用户可选手机号                   | 是         | 否       | App Functionality |
| Coarse Location         | 由登录 IP 推断的国家/地区/城市   | 是         | 否       | App Functionality |
| Contacts                | E聊服务端保存的好友关系和社交图  | 是         | 否       | App Functionality |
| Emails or Text Messages | 单聊、群聊、消息发送者和接收者   | 是         | 否       | App Functionality |
| Photos or Videos        | 聊天、朋友圈和反馈媒体           | 是         | 否       | App Functionality |
| Audio Data              | 语音消息和音视频通话音频         | 是         | 否       | App Functionality |
| Other User Content      | 文件、朋友圈文字、评论、举报内容 | 是         | 否       | App Functionality |
| Customer Support        | 意见反馈及回复                   | 是         | 否       | App Functionality |
| User ID                 | 账号、内部用户 ID                | 是         | 否       | App Functionality |
| Device ID               | E聊设备 ID、APNs/VoIP token      | 是         | 否       | App Functionality |
| Other Usage Data        | 在线状态、最后活跃时间           | 是         | 否       | App Functionality |
| Other Diagnostic Data   | 登录、离线、操作和错误诊断记录   | 是         | 否       | App Functionality |

Apple 的 Contacts 类型也包括应用内 social graph。即使 E聊不读取 iPhone 系统通讯录、也不需要 `NSContactsUsageDescription`，服务端保存好友关系时仍要评估并披露 Contacts。IP/GeoIP、诊断或使用数据是否属于“Collected”，应根据生产环境是否发送到设备外并持续保留判断，而不是仅根据客户端是否调用定位 API判断。

逐项进入每个 Data Type，回答用途、是否与身份关联和是否用于跟踪，保存后在右上角点击 Publish。隐私政策 URL 应说明账号注销、数据删除、保存期限、管理员访问明文消息的条件、用户内容举报机制、推送 token、IP 地区推断、第三方服务以及联系渠道。

## 10. 配置 TestFlight 信息

内部测试可先进行，但建议在首次上传前把基础信息填好。外部测试必须提供 Beta App Description 和 Feedback Email，并经过 TestFlight App Review。[13]

进入 **Apps → E聊 → TestFlight → Additional → Test Information**，填写：

| 字段                 | 可直接使用的建议文本                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beta App Description | `E聊是一款支持单聊、群聊、图片、文件、语音消息、朋友圈及音视频通话的即时通信应用。本次测试用于验证 iOS 通知、后台来电、相机、麦克风和通话稳定性。` |
| Feedback Email       | 填写有人持续查收的产品支持邮箱                                                                                                                     |
| Contact Information  | 填写能够回答审核问题的真实联系人、电话和邮箱                                                                                                       |
| Sign-in Information  | 按功能需要提供至少一个可重复使用的专用审核账号；双端通话或多角色流程再提供额外账号。账号应可撤销、无真实用户数据，不得使用后台超级管理员账号       |
| Notes                | 说明 PushKit 仅用于真实音视频来电，收到 VoIP push 后立即显示 CallKit；普通消息使用 APNs alert                                                      |

每个构建的 **What to Test** 可填写：

> 请重点测试：登录与多设备会话；前台、后台和锁屏时的普通消息通知；语音/视频来电 CallKit 界面；系统界面接听和拒接；双向声音、扬声器切换、摄像头和麦克风权限；对方接听或挂断后其他设备来电界面是否及时清除。

## 11. 上传构建并启用内部测试

E聊当前版本为 `0.9.0`、工程 build 18。若 App Store Connect 从未收到该 Bundle ID 的 build 18，可以使用 18；后续每次上传都必须使用新的 build string。项目脚本默认使用 UTC 到秒生成 build number，但它**不会查询 App Store Connect，也不构成严格唯一保证**。CI 应优先使用单调递增流水线编号；本机重跑前应显式设置未使用的 `ECHAT_IOS_BUILD_NUMBER`。

上传后等待 Apple 处理。若构建显示 **Missing Compliance**，进入 **TestFlight → Builds → iOS → 选择构建 → Provide Export Compliance Information**，按真实加密用途回答。E聊包含 HTTPS、WebCrypto AES-GCM/RSA-OAEP 历史消息兼容逻辑和服务端加密代码；不能仅凭“使用标准算法”预先认定出口合规结论。项目现阶段故意不在 `Info.plist` 固定 `ITSAppUsesNonExemptEncryption`，直到账号持有人完成实际功能、第三方 SDK、发布国家/地区和 Apple 问卷审查。确认属于豁免后再设置；如需文档，应先完成 Apple 流程。[15]

内部测试员必须先是 App Store Connect 用户。Apple 最多允许 100 名内部测试员，构建可测试 90 天。[14]

1. 进入 **Users and Access**，邀请内部测试人员并授予目标 App 的访问权限。
2. 进入 **Apps → E聊 → TestFlight**。
3. 点击 Internal Testing 旁的 **+**。
4. Group Name 填写 `E聊 iOS 内部测试`。
5. 可勾选 **Enable automatic distribution**。
6. 进入该组，点击 **Invite Testers**，选择团队用户。
7. 点击 **Add Builds**，选择处理完成的 0.9.0 构建。
8. 填写 What to Test，点击 Add。
9. 测试员在 iPhone 安装 Apple TestFlight，接受邮件邀请并安装 E聊。

### 11.1 外部 TestFlight 流程

外部测试员不是 App Store Connect 用户，最多 10,000 人。创建外部组前必须先创建至少一个内部组。第一次提交的外部 build 会接受完整 TestFlight App Review；同版本后续 build 可能不需要完整审核。[17]

1. 先完成公开隐私政策、App Privacy、Beta App Description、Feedback Email、审核联系人和专用登录账号。
2. 进入 **TestFlight**，点击 External Testing 旁的 **+**，创建 `E聊 iOS 外部测试`。
3. 进入外部组并点击 **Add Builds**，选择平台、版本和已处理 build。
4. 填写 **What to Test**；需要批准后自动通知时勾选 **Automatically notify testers**。
5. 根据按钮状态点击 **Submit Review**；如果该 build 已获批准，则点击 **Start Testing**。
6. 等待 TestFlight App Review。被拒绝时在 App Review 页面阅读原因、修复并上传新 build。
7. 批准后，通过测试员邮箱或 Public Link 邀请。Public Link 可限制人数、设备和 iOS 版本，但链接可能被转发。
8. 如果第 4 步未选自动通知，批准后在 build 行点击 **Notify Testers**。

不要使用标记为 **TestFlight Internal Only** 的 build 做外部测试；这类 build 不能用于外部测试或正式发布。[14] [17]

## 12. TestFlight 真机验收清单

| 场景            | 操作                                       | 通过标准                            |
| --------------- | ------------------------------------------ | ----------------------------------- |
| 安装和登录      | 从 TestFlight 安装，登录普通账号           | 不闪退，显示 iOS APNs/CallKit 状态  |
| 普通 APNs       | 退到后台后由另一账号发文字、表情和媒体消息 | 通知栏出现通用摘要，不泄露聊天正文  |
| 好友申请        | 后台接收好友申请                           | 收到系统通知，点击进入正确页面      |
| PushKit/CallKit | 锁屏或后台时由另一台设备发起语音/视频通话  | 立即出现系统来电界面，只出现一次    |
| CallKit 接听    | 在系统界面点击接听                         | 恢复 E聊并进入 WebRTC，双方听到声音 |
| CallKit 拒接    | 在系统界面点击拒接                         | 主叫方收到拒绝，来电界面清理        |
| 多设备清理      | 同一账号两台 iPhone 同时响铃，在一台接听   | 另一台系统来电及时结束              |
| 音频路由        | 切换听筒、扬声器和静音                     | 路由正确，无重复铃声                |
| 视频权限        | 首次视频通话允许摄像头、麦克风             | 双方画面和声音正常                  |
| 网络恢复        | Wi-Fi/蜂窝切换后重新发消息和通话           | SignalR 重连，无重复来电            |
| 注销            | 退出账号后再向该账号推送                   | 已注销设备 token 不继续使用         |

至少使用两台真实 iPhone 完成通话验收。iOS 模拟器、浏览器和 Linux 静态测试不能证明 APNs、PushKit、CallKit、摄像头或麦克风在真机可用。

## 13. 常见问题排查

| 症状                                         | 主要原因                                          | 处理方法                                                             |
| -------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| New App 按钮不可用                           | 角色不足或最新协议未接受                          | 让 Account Holder 接受 Business 协议，并确认账号为 App Manager/Admin |
| Bundle ID 不在下拉框                         | 选错 Team、App ID 未注册或角色无权访问            | 回 Developer Portal 检查显式 App ID `com.echat.app`                  |
| App name unavailable                         | 同语言名称已被占用                                | 改用 `E聊即时通讯` 等商店名称；应用内显示名可仍为 E聊                |
| Xcode 显示 No profiles                       | Team/Bundle ID/capability 不匹配                  | 开启自动签名，确认 Push Notifications 已在 App ID 和 target 同时启用 |
| Certificate 显示 Missing Private Key         | CSR 在另一台 Mac 生成                             | 从原 Mac 导入含私钥 `.p12`，或重新创建证书                           |
| Archive 的 `aps-environment` 不为 production | 使用了开发 profile 或 Release 配置错误            | 重新生成 App Store Connect profile，检查 Release build setting       |
| APNs `InvalidProviderToken`                  | Team ID、Key ID、私钥或服务器时钟错误             | 核对 10 位 ID、`.p8` 与 UTC 时间；撤销泄露 Key                       |
| APNs `BadDeviceToken`                        | Sandbox/Production 混用或 token 已变化            | TestFlight 使用 production；重新登录并注册 token                     |
| APNs `DeviceTokenNotForTopic`                | Bundle ID/topic/Team 不一致                       | 普通 topic 用 `com.echat.app`，VoIP 用 `com.echat.app.voip`          |
| 普通通知可用但 VoIP 失败                     | APNs Key 未覆盖 VoIP topic                        | 首次使用 Production Team Scoped Key，检查 `apns-push-type=voip`      |
| 上传后看不到构建                             | Bundle ID 不匹配、build 重复或仍在处理            | 检查 Activity/Build 状态，使用新的 build number                      |
| Missing Compliance                           | 出口合规问卷未完成                                | 在 TestFlight build 详情填写 Export Compliance [15]                  |
| 内部测试员不在列表                           | 不是 App Store Connect 用户或无 App access        | 先在 Users and Access 邀请并授权目标 App                             |
| 自动脚本忽略手工 profile                     | 当前脚本固定使用 Automatic signing                | 手工路线用 Organizer；不要混用第 6、7 节                             |
| 外部组无法添加 build                         | 未建内部组、使用 Internal Only build 或元数据不全 | 先建内部组，换可外部分发 build，并完成 Privacy/Test Information [17] |

## 14. 最终配置记录表

完成操作后，只记录 ID 和状态。私钥本体应放在秘密管理系统，不要写入此表。

| 项目                            | 值/状态                            |
| ------------------------------- | ---------------------------------- |
| Apple Team 名称                 |                                    |
| Apple Team ID                   |                                    |
| 最终 Bundle ID                  | `com.echat.app`                    |
| App Store Connect Apple ID      |                                    |
| App Store Name                  | `E聊`                              |
| SKU                             | `ECHAT-IOS-001`                    |
| APNs Key ID                     |                                    |
| APNs Key Environment/Type       | Production / Team Scoped           |
| APNs `.p8` 安全存储位置         | 只写密码库条目名称，不写路径或内容 |
| App Store Connect API Key ID    |                                    |
| Issuer ID                       |                                    |
| 上传 `.p8` 安全存储位置         | 只写密码库条目名称，不写路径或内容 |
| 最终签名路线                    | Automatic 或 Manual（二选一）      |
| Debug 签名状态                  |                                    |
| Release/Archive 签名状态        |                                    |
| Privacy Policy URL              |                                    |
| App Privacy 生产环境盘点人/日期 |                                    |
| 出口合规结论与审查人/日期       |                                    |
| TestFlight 内部组               | `E聊 iOS 内部测试`                 |
| 第一个已处理 Build              |                                    |
| 两台 iPhone 验收结果            |                                    |

完成第 3 至第 8 节、选择且只选择一种签名路线后，即具备在 Mac 上执行第一次 Archive 的前置条件。完成隐私政策、生产数据盘点、出口合规和第 9 至第 11 节后，即可进入相应的内外部 TestFlight 流程。只有第 12 节真机验收全部通过后，才能把本阶段状态标记为“已通过 TestFlight 测试”。

## References

[1]: https://developer.apple.com/help/account/identifiers/register-an-app-id/ "Apple Developer — Register an App ID"
[2]: https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/ "App Store Connect — Add a New App"
[3]: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/ "App Store Connect — Upload Builds"
[4]: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api "Apple Developer — Creating API Keys for App Store Connect API"
[5]: https://developer.apple.com/help/account/certificates/cloud-managed-certificates/ "Apple Developer — Cloud-Managed Certificates"
[6]: https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/ "Apple Developer — Create an App Store Connect Provisioning Profile"
[7]: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/ "App Store Connect — App Information Reference"
[8]: https://developer.apple.com/help/account/keys/create-a-private-key/ "Apple Developer — Create a Private Key to Access a Service"
[9]: https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns "Apple Developer — Establishing a Token-Based Connection to APNs"
[10]: https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request/ "Apple Developer — Create a Certificate Signing Request"
[11]: https://developer.apple.com/help/account/provisioning-profiles/create-a-development-provisioning-profile/ "Apple Developer — Create a Development Provisioning Profile"
[12]: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/ "App Store Connect — Manage App Privacy"
[13]: https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information/ "App Store Connect — Provide Test Information"
[14]: https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/ "App Store Connect — Add Internal Testers"
[15]: https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds/ "App Store Connect — Provide Export Compliance Information for Beta Builds"
[16]: https://developer.apple.com/help/account/access/automatic-signing-controls/ "Apple Developer — Automatic Signing Controls"
[17]: https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/ "App Store Connect — Invite External Testers"
[18]: https://developer.apple.com/library/archive/qa/qa1879/_index.html "Apple QA1879 — Resolving -34018 Errors from Keychain Services"
