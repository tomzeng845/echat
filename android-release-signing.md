# E聊 Android 正式签名发布说明

## 发布状态

E聊 Android `0.9.0` 已使用独立发布证书生成正式签名 APK 与 AAB。应用编号为 `com.echat.app`，`versionCode` 为 `18`，最低 Android API 为 24，目标 API 为 36。APK 适合直接分发安装；AAB 用于 Google Play 等支持 Android App Bundle 的商店。

| 项目         | 结果                                                               |
| ------------ | ------------------------------------------------------------------ |
| 发布证书别名 | `echat_release`                                                    |
| 密钥类型     | PKCS12，RSA 4096 位，SHA256withRSA                                 |
| 证书有效期   | 2026-09-06 至 2054-01-22                                           |
| 证书 SHA-256 | `c7e9b9bdd7c3ce714de27e224d5fd947df95d151946be6a43c4ad5b870f3c898` |
| APK 签名     | APK Signature Scheme v2/v3 通过                                    |
| AAB 签名     | JAR 签名通过，证书与 APK 一致                                      |
| APK 对齐     | 16 KB zipalign 通过                                                |
| Bundle 校验  | Google bundletool 1.18.1 `validate` 与通用 APK 生成通过            |
| API 地址     | `https://echatapp-favrlscm.manus.space`                            |

## 交付文件

| 文件                                        | 用途                                   | SHA-256                                                            |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `EChat-0.9.0-release.apk`                   | 正式签名、可直接安装的完整 APK         | `0120960097b1dfb46a30e711ef28742f4295866b85cd8851193f81ca26004e5c` |
| `EChat-0.9.0-release.aab`                   | 提交 Google Play 或支持 AAB 的应用商店 | `6e9c9fd103fcf6c7c23b15023bead603a8a77bc9e3cd48431601d50080320302` |
| `EChat-0.9.0-release.sha256`                | APK/AAB 完整性校验清单                 | —                                                                  |
| `EChat-0.9.0-release-info.txt`              | 版本、证书和构建校验摘要               | —                                                                  |
| `EChat-release-certificate.pem`             | 发布证书公钥，可用于登记证书指纹       | —                                                                  |
| `EChat-Android-signing-backup.7z`           | AES-256 加密的发布密钥和签名凭据备份   | —                                                                  |
| `EChat-Android-signing-backup-password.txt` | 加密备份的解压密码，必须与备份分开保存 | —                                                                  |

> **发布密钥决定后续升级资格。** 如果发布密钥丢失，通常无法再用相同应用编号向现有非 Play App Signing 安装用户发布可覆盖升级的版本。请立即把加密备份和密码分别保存到两个受控位置，并把凭据导入密码管理器。

## 安装与升级注意事项

此前提供的 `debug` APK 使用 Android SDK 调试证书，正式 APK 使用新的独立发布证书。Android 不允许不同证书的同包名应用互相覆盖，因此首次改装正式版时需要先卸载 debug 版，再安装 `EChat-0.9.0-release.apk`。卸载会删除本机应用数据；服务器账号和服务端数据不受影响，但协议切换前只保存在设备上的历史密钥可能随应用数据一起丢失。

从本次正式版开始，只要后续版本继续使用同一个 `echat_release` 密钥，并递增 `versionCode`，即可直接覆盖升级正式版。

可使用 ADB 安装：

```bash
adb uninstall com.echat.app   # 仅当设备当前安装的是 debug 签名版本
adb install EChat-0.9.0-release.apk
```

## Google Play 发布

首次创建 Google Play 应用时，应使用 `EChat-0.9.0-release.aab`。如果启用 Play App Signing，需要在控制台明确本证书是应用签名密钥还是上传密钥，并按控制台流程保存 Google 管理的应用签名证书。无论选择哪种模式，都应永久保留本轮生成的密钥与证书记录。

AAB 已通过 bundletool 校验，并成功生成证书一致的通用 APK。上传商店前仍需在商店后台完成应用内容评级、隐私政策、数据安全表单、截图、图标和目标市场配置。

## 可重复构建

Gradle 只从环境变量读取正式签名信息，不读取或提交仓库内的密码文件。缺少任一签名变量时，release 构建会立即失败，不会静默生成未签名或调试签名产物。

```bash
export ECHAT_ANDROID_KEYSTORE='/secure/path/echat-release.jks'
export ECHAT_ANDROID_STORE_PASSWORD='从密码管理器读取'
export ECHAT_ANDROID_KEY_ALIAS='echat_release'
export ECHAT_ANDROID_KEY_PASSWORD='从密码管理器读取'
export JAVA_HOME='/usr/lib/jvm/java-21-openjdk-amd64'
export ANDROID_HOME='/path/to/android-sdk'

pnpm android:release
```

命令会执行 Android Web 资源同步、release 单元测试、release lint、`bundleRelease`、`assembleRelease`，并验证 APK 对齐、APK v2/v3 签名、AAB 签名、APK/AAB 证书一致性、包名、版本号和 SHA-256。

## 推送配置边界

正式签名不等于 Firebase 推送已启用。当前构建未包含项目方 `google-services.json`，服务器健康接口也仍显示 FCM 未配置。应用进程存活时的本地后台通知和无需 Firebase 的原生后台来电服务仍可使用；应用被系统完全终止后的可靠消息通知，需要后续配置与 `com.echat.app` 对应的 Firebase Android 应用和服务账号后重新签名构建。
