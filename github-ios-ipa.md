# E聊 GitHub Actions 签名 IPA 构建说明

## 当前用途

仓库中的 `.github/workflows/ios-ipa.yml` 使用 GitHub-hosted `macos-26` runner 和 Xcode 26 生成 **App Store Connect 分发签名**的 E聊 IPA。工作流只在手工点击 Run workflow 时执行，不会在普通 push 或 pull request 中自动运行，也不会自动上传 TestFlight。

> App Store Connect 分发 IPA 不能像企业包或 Ad Hoc 包一样直接安装。生成后可作为受控发布产物下载、校验，并在 App Store Connect 应用记录准备完成后上传 TestFlight。

## 构建路线与安全边界

| 项目            | 设置                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| Runner          | GitHub-hosted `macos-26`                                                   |
| Xcode           | runner 默认 Xcode 26.x，工作流会输出实际版本                               |
| Node.js / pnpm  | Node.js 22、pnpm 10.4.1                                                    |
| Bundle ID       | `com.echat.app`                                                            |
| 默认版本        | `0.9.0`                                                                    |
| 默认 Build      | `18` + GitHub workflow run number，从现有 Build 18 之后开始且随新 run 递增 |
| API 地址        | 手工触发时填写的生产 HTTPS 地址                                            |
| 签名方式        | Manual，Apple Distribution `.p12` + App Store Connect `.mobileprovision`   |
| Artifact 保存   | 14 天，仅仓库有权用户可下载                                                |
| TestFlight 上传 | 不执行；生成 IPA 后另行上传                                                |

工作流仅请求 `contents: read`，不会向仓库写代码。Apple 证书、密码和 provisioning profile 只从 GitHub Environment Secrets 读取，写入 runner 临时目录和临时 Keychain，结束时执行清理。GitHub-hosted runner 随任务销毁，签名材料不会进入 artifact。

## 前置条件

在运行 workflow 前，必须完成以下 Apple 资源：

| 资源                                   | 要求                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Apple Developer Team                   | 会员有效，并记录 10 位 Team ID                                                       |
| App ID                                 | 显式 App ID `com.echat.app`                                                          |
| Capability                             | App ID 和 Xcode target 均启用 Push Notifications                                     |
| Apple Distribution 证书                | 证书与私钥同时存在于创建证书的 Mac Keychain                                          |
| App Store Connect provisioning profile | Bundle ID 为 `com.echat.app`，包含该 Distribution 证书，`aps-environment=production` |
| GitHub 仓库                            | 必须是私有仓库；Actions 可用                                                         |

完整 Apple 操作请参阅 `apple-app-store-connect-setup-guide.md` 的手工签名章节。不要把 Development 证书、开发 profile、Ad Hoc profile 或 sandbox profile 用于本 workflow。

## 导出 Apple Distribution `.p12`

在创建 Apple Distribution 证书的 Mac 上打开 Keychain Access：

1. 进入 **login → My Certificates**。
2. 找到 `Apple Distribution: 你的名称 (TEAMID)`。
3. 展开证书，确认下面显示 private key。如果没有 private key，当前 Mac 无法导出可签名的 `.p12`。
4. 选中证书和其 private key，右键选择 **Export 2 items**。
5. 文件名建议为 `EChat_Distribution.p12`。
6. 设置一个新的强密码。此密码只用于 CI 导入，保存到密码管理器。

不要从其他项目复用不明来源的 `.p12`，也不要撤销仍被其他应用使用的团队证书。

## 下载 App Store Connect provisioning profile

在 Apple Developer 的 **Certificates, Identifiers & Profiles → Profiles** 创建或下载 App Store Connect profile：

| 字段              | 值                                   |
| ----------------- | ------------------------------------ |
| Distribution 类型 | App Store Connect                    |
| App ID            | `com.echat.app`                      |
| Certificate       | 上一步对应的 Apple Distribution 证书 |
| Profile Name      | 建议 `EChat App Store 0.9`           |

下载为 `.mobileprovision`。如果 App ID 的 Push Notifications capability 在 profile 创建后才启用，必须重新生成 profile。

可在 Mac 本地验证：

```bash
security cms -D -i EChat_App_Store_0_9.mobileprovision > /tmp/echat-profile.plist
/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' /tmp/echat-profile.plist
/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' /tmp/echat-profile.plist
/usr/libexec/PlistBuddy -c 'Print :Entitlements:aps-environment' /tmp/echat-profile.plist
```

预期依次得到目标 Team ID、以 `.com.echat.app` 结尾的 application identifier，以及 `production`。部分旧 Apple 账号的 App ID Prefix 可能不等于 Team ID，因此只要求 bundle suffix 匹配，Team Identifier 另行精确校验。

## 在 GitHub 创建受保护环境和 Secrets

打开私有仓库，进入 **Settings → Environments → New environment**，名称必须精确填写：

```text
ios-production
```

如团队支持审批，可为该环境配置 Required reviewers。然后在 **Environment secrets** 添加以下四项：

| Secret 名称                      | 内容                                      | 来源                       |
| -------------------------------- | ----------------------------------------- | -------------------------- |
| `APPLE_TEAM_ID`                  | 10 位 Team ID                             | Apple Developer Membership |
| `BUILD_CERTIFICATE_BASE64`       | 整个 `.p12` 文件的单行 Base64             | `EChat_Distribution.p12`   |
| `P12_PASSWORD`                   | 导出 `.p12` 时设置的密码                  | 密码管理器                 |
| `BUILD_PROVISION_PROFILE_BASE64` | 整个 `.mobileprovision` 文件的单行 Base64 | Apple Developer Profiles   |

在 Mac 上生成单行 Base64：

```bash
base64 -i EChat_Distribution.p12 | pbcopy
# 将剪贴板内容粘贴到 BUILD_CERTIFICATE_BASE64 后立即清空剪贴板

base64 -i EChat_App_Store_0_9.mobileprovision | pbcopy
# 将剪贴板内容粘贴到 BUILD_PROVISION_PROFILE_BASE64 后立即清空剪贴板
```

请只把值粘贴到 GitHub Encrypted Secrets 表单。不要粘贴到聊天、Issue、Actions input、README、仓库文件或 workflow YAML。完成后删除本机临时 Base64 文本；原始 `.p12` 和 profile 应保存在受控加密位置。

`APNS_PRIVATE_KEY` 和 App Store Connect 上传 `.p8` **不需要**配置到这个“只生成 IPA”的 workflow。APNs Key 只属于服务端推送；上传 Key 只在后续自动上传 TestFlight 时使用。

## 运行 workflow

1. 打开仓库的 **Actions**。
2. 选择 **Build signed iOS IPA**。
3. 点击 **Run workflow**。
4. Branch 选择保存本工作流的主分支。
5. Version 保持 `0.9.0`。
6. Build number 可留空，工作流使用 `18` 加 GitHub run number（例如首次 run 为 `181`）。若填写，必须是 1–18 位且从未上传过的数字。
7. API URL 填写生产 HTTPS 地址，例如 `https://echatapp-favrlscm.manus.space`。
8. 点击绿色 **Run workflow**。

workflow 会依次完成：输入与 Secret 校验、依赖安装、临时 Keychain、profile Team/Bundle/APNs 校验、Capacitor iOS sync、TypeScript 检查、Swift Package 解析、Xcode Archive、手工签名 export、IPA 解包和 `codesign` 校验、Bundle ID/版本/Build 校验，以及 artifact 上传。

## 下载和验证 IPA

任务成功后，在 workflow Summary 底部下载名称类似以下格式的 artifact：

```text
EChat-iOS-0.9.0-19
```

解压 artifact 后应包含：

```text
EChat-iOS-0.9.0-19.ipa
EChat-iOS-0.9.0-19.ipa.sha256
EChat-iOS-0.9.0-19-build.txt
```

在 Mac 或 Linux 验证 SHA-256：

```bash
shasum -a 256 -c EChat-iOS-0.9.0-19.ipa.sha256
```

Linux 也可使用：

```bash
sha256sum -c EChat-iOS-0.9.0-19.ipa.sha256
```

`.ipa.sha256` 必须返回 `OK`。`-build.txt` 只包含 Bundle ID、版本、Build、API URL、profile UUID 和 GitHub run ID，不包含私钥或密码。

## 常见失败

| 错误                                                | 原因                                          | 处理                                                      |
| --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Environment `ios-production` not found              | GitHub 环境未创建或名称错误                   | 创建精确名称的 environment                                |
| Missing ios-production environment secret           | Secret 放在错误环境或名称不一致               | 在 `ios-production` 的 Environment secrets 中检查四项名称 |
| p12 does not contain an Apple Distribution identity | 导出了证书但没有私钥，或使用 Development 证书 | 在原 Mac Keychain 展开证书并重新导出证书+private key      |
| Provisioning profile Team ID does not match         | Team ID 或 profile 来自不同 Team              | 使用同一 Team 的证书、profile 和 `APPLE_TEAM_ID`          |
| profile does not match `com.echat.app`              | Bundle ID 选错                                | 重新创建显式 App ID 对应的 App Store profile              |
| production APNs profile required                    | 使用了 development/sandbox profile            | 创建 App Store Connect distribution profile               |
| No signing certificate found                        | `.p12` 密码错误或证书已失效                   | 检查 `P12_PASSWORD`、证书有效期和撤销状态                 |
| Xcode archive fails in Swift Package resolution     | GitHub 或 Swift Package 网络抖动              | 重新运行一次；持续失败时检查依赖版本与 GitHub 状态        |
| artifact not found                                  | Archive/export 或验证步骤失败                 | 先查看第一个红色步骤，而不是重复运行隐藏根因              |

## 后续上传 TestFlight

生成 IPA 只完成了发布构建，不等于已经通过 TestFlight。后续仍要创建 App Store Connect 应用记录、完成 App Privacy 和出口合规、上传 IPA、等待处理、分配内部测试员并在真机验证 APNs/PushKit/CallKit。

当前仓库另有 `scripts/ios-testflight.sh` 用于受控 Mac 上自动 Archive 与上传。GitHub workflow 目前故意不读取上传 API Key，也不会产生不可逆的外部发布动作。确认 IPA 构建成功、App Store Connect 记录完成后，再为 CI 增加独立的 TestFlight 上传 job。

## 官方参考资料

- [GitHub：在 macOS runner 安装 Apple 证书和 provisioning profile](https://docs.github.com/actions/use-cases-and-examples/deploying/installing-an-apple-certificate-on-macos-runners-for-xcode-development)
- [GitHub：macOS 26 runner image](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md)
- [GitHub：upload-artifact](https://github.com/actions/upload-artifact)
- [Apple：Create an App Store Connect provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/)
