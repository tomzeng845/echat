# E聊视觉验证记录

- 2026-09-05：桌面视口 1440×900 登录页布局完整，左右信息层级清晰，表单无需滚动即可完成操作。
- 首次桌面截图发现 `/manus-storage` 品牌图片无法由 ASP.NET Core 自托管前端解析，已切换为 CDN 地址并重新构建。
- 2026-09-05：手机视口 390×844 登录页适配正确；品牌标记、标题、登录/注册切换、账号和密码输入框、主操作按钮均完整可见。
- 手机端没有横向溢出，重要点击目标尺寸满足触控需求。

## 浏览器交互验证

浏览器已成功打开 ASP.NET Core 在 2099 端口提供的 E聊页面，CDN 品牌标记显示正常。登录与注册切换按钮可用；注册模式会正确显示账号、昵称、密码、邀请码、协议勾选和安全注册按钮，预填的本地测试邀请码为 `ECHAT2026`。

注册表单已在真实浏览器中完成字段填充验证。账号、中文昵称、密码和邀请码均可正常输入，协议复选框可点击并显示已选中状态，注册按钮在满足条件后保持可操作。

浏览器真实提交注册后成功进入 E聊 主界面，证明注册 API、JWT 会话、本机 WebCrypto 身份密钥生成与公钥发布链路可用。联系人导航可正常切换，添加好友输入框、发送按钮和空状态均正确显示，桌面三栏结构没有溢出。

页面刷新后登录状态保持有效，说明浏览器会话持久化可用。联系人页成功加载由另一账号通过 API 发起的好友申请，申请附言和“接受”操作均正确呈现，前后端关系链数据已贯通。

接受好友申请后，联系人数量从 0 更新为 1，并出现成功反馈。点击好友后成功创建单聊，会话列表同步出现记录；聊天页明确显示“端到端加密”“AES-GCM-256”状态，证明浏览器已完成会话 AES 密钥生成、双方 RSA-OAEP 密钥信封创建、服务端会话持久化和本机密钥保存。

在真实浏览器中输入并发送中文消息后，消息成功显示在右侧气泡，发送时间、撤回入口、会话摘要和未读计数同步更新。客户端展示解密后的原文，而会话列表仅显示“加密消息”摘要，符合服务端不持有明文的设计边界。

最终复测发现并修复了内存仓库重启后的边界情况：JWT 仍有效但账号数据已消失时，旧实现会停留在空主界面并提示 Not Found。现已引入带状态码的 `ApiError`，启动阶段遇到 401/404 会清理本地会话并自动回到登录页；真实浏览器刷新验证通过。

## 最终自动化验证

最终 `pnpm check` 通过，TypeScript 与 ASP.NET Core 编译为 0 个错误、0 个警告。Vitest 共执行 3 项测试并全部通过；xUnit 共执行 3 项测试并全部通过。生产构建成功。扩展冒烟测试使用三账号验证了邀请注册、好友关系、单聊、群聊、消息幂等、消息补拉、撤回与已读游标，结果为 `E2E_OK`。

## 2026-09-05 富媒体、朋友圈与通话扩展验证

最新版预览已在 ASP.NET Core 2099 端口正常打开，登录页品牌、排版和注册切换均正常。真实浏览器进入注册模式后，账号、昵称、密码、邀请码、协议复选框和注册按钮均正确呈现。

浏览器已成功提交新账号 `richmedia2026` 的邀请注册，并进入 E聊主界面；JWT 会话、浏览器身份密钥生成和公钥发布在本轮变更后仍正常。桌面三栏布局无溢出，发现导航入口已呈现。

桌面端“发现”已切换为全宽朋友圈信息流，顶部品牌卡片、空状态和“发布动态”入口显示正常。发布弹窗可正常打开，包含 2000 字文本区、最多 9 个图片/视频槽位、好友可见提示和发布状态，布局完整无溢出。

真实浏览器已输入并发布一条朋友圈文字动态。发布成功后弹窗关闭，信息流立即显示作者、时间、正文、点赞、评论、评论输入框和本人删除入口，并出现成功提示，证明发布 API 与前端状态刷新链路可用。

浏览器点击点赞后计数立即变为 1，并显示点赞用户名；评论输入框可正常填写，发送按钮在有内容时切换为可操作状态。乐观更新与服务端刷新未出现重复点赞或布局跳动。

朋友圈评论提交后计数变为 1，评论区正确显示“富媒体体验官：点赞与评论功能正常。”。随后刷新页面仍保持登录状态并正常回到消息页，扩展功能没有破坏会话持久化。

联系人页成功加载由带有效 RSA 公钥的测试账号发起的好友申请；浏览器点击接受后好友数量从 0 更新为 1，并出现可进入聊天的联系人条目，证明新后端模型没有破坏关系链。

浏览器从联系人成功创建端到端加密单聊，会话头部同时显示语音通话、视频通话和更多入口；编辑器工具栏显示表情、文件/视频、图片和语音录制按钮。图片按钮可点击并触发文件选择流程，桌面聊天区布局稳定。

使用浏览器生成的合法 PNG 触发真实图片发送流程后，会话摘要更新为“[图片]”，消息气泡成功通过鉴权下载密文、使用会话 AES-GCM 密钥解密并以 blob URL 显示原图；时间与撤回入口同步出现。端到端富媒体链路验证通过。

浏览器发送文本文件后，会话摘要更新为“[文件]”，消息气泡显示原始文件名、31 B 大小、已加密状态和下载按钮。服务端仅收到 `.e2ee` 密文对象与资产编号，原始文件描述保存在消息密文中。

云端浏览器没有可用摄像头/麦克风，因此点击语音通话时按预期阻止了启动；界面现可针对无设备和权限拒绝给出明确提示。媒体设备之外的 SignalR 通话链路已由双账号脚本验证邀请、接受、ICE 转发和结束事件。最终服务重启后健康检查通过，旧内存账号会话安全回到登录页。

### 本轮最终结果

`pnpm check` 通过，TypeScript 与 ASP.NET Core 编译为 0 个错误、0 个警告；Vitest 3 项和 xUnit 4 项测试全部通过；生产构建成功。扩展 API 冒烟测试返回 `E2E_OK`，覆盖三账号、单聊、群聊、媒体上传与好友鉴权下载、富媒体消息、朋友圈发布、点赞、评论、消息幂等、撤回和已读。双账号 SignalR 通话测试返回 `CALL_SIGNAL_OK`，覆盖音视频邀请、定向拒接、接受、ICE 信令和结束事件。

## 2026-09-05 生产 API 500 排查

首次直连 `https://echatapp-favrlscm.manus.space` 出现 TLS 协议错误；经 HTTP 入口自动跳转后页面可正常加载。这说明发布容器已运行，但边缘 TLS 路径存在偶发握手异常，需要继续从浏览器内复现具体 API 请求。

已确认生产 500 根因为 `ADMIN_TOTP_SECRET` 缺失导致 `TotpService` 在认证控制器实例化时抛异常，因此普通注册也被阻断。修复后，生产模式在不配置该密钥时普通注册返回 200；管理员 TOTP 功能单独返回明确的 503。修复版开发预览正常加载，完整 API 冒烟测试返回 `E2E_OK`。

浏览器同源回归直接调用 `/api/auth/register`，响应为 HTTP 200、`success: true` 且返回有效访问令牌，确认用户看到的空白 500 已在修复版中消除。所有未处理服务端异常现在都会返回包含 `error` 与 `traceId` 的 JSON，便于后续定位。

## 2026-09-05 P1 与二维码功能验证

修复版桌面登录页已显示“使用二维码登录”入口。真实浏览器点击后成功生成 220px 登录二维码，弹窗完整显示两分钟有效期、刷新操作与“一次性且不包含密码/登录令牌”的安全提示；弹窗布局、背景遮罩和关闭操作在 1440×900 视口无溢出。

浏览器关闭二维码弹窗后通过新版注册接口创建 `P1体验官` 验证账号，HTTP 200 且返回带 `sessionId`、`deviceId` 的会话。客户端保存会话并刷新后可进入主应用，证明设备会话升级未破坏注册登录。

登录后的桌面主界面加载正常。P1 个人中心已显示“我的二维码”“扫一扫”“登录设备”“通话记录”和“实时能力”五个真实入口；本次账号正确显示 1 台当前设备、0 条通话记录和 P2P 模式，三栏布局无溢出。

个人中心“我的二维码”可正常生成个人名片二维码，显示账号、刷新操作和扫码后先预览再发送申请的提示。浏览器验证发现七天名片有效期只显示时分，容易误解为当天到期，已列入本轮即时修正。

“扫一扫”弹窗已在真实浏览器验证，提供摄像头、上传图片和粘贴二维码内容三条路径，并明确相机画面只在本机识别。云端浏览器无摄像头时会显示“请使用图片或手工输入”的可操作提示，不会卡在权限流程。

浏览器创建了第二个账号的七天名片码，并通过扫码器“粘贴内容”回退路径成功解析。结果页仅展示公开昵称与 E聊号，并在用户点击“发送好友申请”前保持二次确认，未自动建立关系。

扫码名片结果页点击“发送好友申请”后出现成功反馈并关闭弹窗，端到端兑换链路正常。随后切换至朋友圈，P1 隐私版标题、全宽信息流和“发布动态”入口均正常显示。

朋友圈发布器真实显示好友可见、仅自己可见、部分好友可见和不给谁看四种范围。浏览器已选择 `Private` 并提交“P1 仅自己可见动态”，验证前端可见范围字段已进入真实发布链路。

私密动态发布后信息流立即显示“刚刚 · 仅自己可见”标签和正文，确认 P1 可见范围序列化、保存和读取均正常。随后返回个人中心，导航与 P1 卡片状态保持稳定。

### P1 与二维码最终结果

`pnpm check` 通过，TypeScript 与 ASP.NET Core 编译为 0 个错误、0 个警告；Vitest 3 项与 xUnit 8 项测试全部通过；生产构建成功。主冒烟测试返回 `E2E_OK`，覆盖私密、指定、排除可见和举报；二维码测试返回 `P1_QR_OK`，覆盖一次性登录兑换、扫码名片与设备撤销；通话测试返回 `CALL_SIGNAL_OK`，覆盖拒接、接听、ICE、结束、两条历史记录和 RTC P2P 配置。登录设备页在真实浏览器中正确识别当前设备，并提供“退出所有其他设备”操作。个人名片七天有效期已改为日期与时间联合显示。

## 2026-09-05 好友实时更新与手机发送按钮修复

根因一是好友接口只写数据库，未向 SignalR 用户组发送事件；根因二是手机聊天详情仍显示固定底部导航，并使用传统 `100vh`，导致编辑器在部分浏览器中被遮挡。本次新增 `contact.requested` 与 `contact.updated` 双端事件、首次连接/重连/恢复前台补拉、联系人待处理数字和申请人资料。手机详情改用 `100dvh`、隐藏底部导航、适配安全区并为发送按钮增加固定尺寸和无障碍标签。

自动化结果：`CONTACT_REALTIME_OK` 已验证两名在线用户无需刷新即可收到申请、显示申请人、接受后双方联系人同步；`MOBILE_CHAT_OK` 已在 Chromium 390×844 触摸视口完成实时收到申请、接受、点击“发消息”、进入加密会话、看到发送按钮并实际发送中文消息。发送按钮边界为 `(326,780)-(370,824)`，完整位于 390×844 视口内，输入区宽度 298px，底部导航在聊天详情中已隐藏。现有聊天、朋友圈、二维码、设备与通话端到端测试保持通过。

## 2026-09-05 未读消息数量清零修复

根因是已读接口虽然更新了服务端游标，但客户端未订阅 `receipt.updated`，且加载消息后没有同步更新本地 `conversations` 缓存，因此角标会一直保留到下一次全量刷新；此外，手机列表默认选中的会话会在详情尚未打开时提前加载消息。现已增加点击时乐观清零、服务端回执同步、打开会话全量已读和当前会话新消息自动已读，并限制手机端只有实际进入详情后才加载和消费消息。

`UNREAD_CLEAR_OK` 已在 390×844 触摸视口验证：进入前显示 3 条未读；点击进入后服务端 `readSequence` 到达 3；聊天打开期间收到第 4 条消息后自动到达 4；返回列表时未读角标为 0。截图中会话行已无数字角标。TypeScript/.NET 编译、Vitest 3 项、xUnit 8 项和生产构建均通过。

## 2026-09-05 桌面会话列表未读角标二次修复

用户截图确认问题发生在桌面双栏会话列表：打开 `abc` 会话后，列表右侧仍残留绿色数字 `1`。进一步定位到 `message.created` 处理同时触发“标记已读”和“全量刷新”，较早发出的 `/api/conversations` 请求可能带着旧 `readSequence` 后返回，从而覆盖已经乐观清零的本地状态；重复点击当前已选中的会话也不会再次触发依赖于 `selectedId` 的加载效果。

现已增加每个会话的待确认已读游标下限，旧列表响应不得覆盖更高的本地已读位置；收到服务端 `receipt.updated` 后再解除保护。点击任何会话（包括当前已选会话）都会立即清零角标并主动提交已读回执。`UNREAD_CLEAR_OK` 已同时覆盖 390×844 手机列表和 1280×720 桌面双栏：桌面未读 `1` 打开后为 `0`，打开期间实时收到第 2 条消息后仍为 `0`。复核截图中与用户截图相同的列表右侧已无数字角标。

## 2026-09-05 HTML5 管理后台首轮验证

桌面 1440×900 用户管理页布局完整：左侧包含运营概览、用户管理、举报处置、邀请码和审计日志；主区显示搜索、状态筛选、角色、设备数、最近活跃以及限制、停用、恢复、退出设备操作。默认管理员 `e_admin` 正确显示为 Admin，且当前管理员行不提供自我停用操作。

手机 390×844 首次自动截图发生在侧栏 200ms 滑入动画期间，只捕获到遮罩和侧栏边缘，无法作为最终移动视觉验收；已保留此发现并将等待动画完成后重新截图，不据此判断移动布局失败。

### HTML5 管理后台最终结果

E聊 0.4.0 已新增独立 `/admin` HTML5 管理后台。开发预览启动时幂等创建 `E_Admin`（标准化账号 `e_admin`），密码仅以 ASP.NET Core `PasswordHasher` 哈希保存；重复启动不会重置已有管理员。生产环境不会使用开发默认密码，必须配置 `ADMIN_BOOTSTRAP_PASSWORD`，且 Admin 登录继续要求 TOTP。

管理 API 已覆盖运营概览、用户搜索和状态治理、强制退出设备、邀请码维护、朋友圈举报队列与处置、管理员操作审计。`ADMIN_OK` 验证默认管理员登录、普通用户管理接口 403、用户停用后登录 403、恢复、邀请码注册、举报进入队列与处置、审计记录和两种响应式视口。桌面 1440×900 用户表格完整；手机 390×844 抽屉导航在动画完成后完整显示。Vitest 3 项、xUnit 9 项、TypeScript/.NET 编译和生产构建通过；聊天、联系人、未读、二维码与通话回归均通过。

## 2026-09-05 开发预览管理员登录修复

复核发现当前公开开发预览 API 使用 `E_Admin` / `Heibai@99` 可返回 HTTP 200，但旧数据中若已经注册过同名 `e_admin` 用户，原种子逻辑只提升角色、不更新旧密码；账号被停用、锁定或曾使用其他密码时，页面就会提示“账号或密码错误”。E聊 0.4.1 现会在 Development 环境启动时幂等校验该账号，必要时恢复 Admin 角色、Active 状态、清除登录锁定，并把密码重新哈希为文档中的开发预览密码。Production 环境不会重置已有密码。

修复后 TypeScript 与 .NET 编译通过，Vitest 3 项、xUnit 10 项全部通过，生产构建成功。服务重启后健康接口返回 0.4.1，`ADMIN_OK` 再次通过默认管理员登录、角色隔离、用户治理、邀请码、举报处置、审计及 1440×900/390×844 浏览器回归。

## 2026-09-05 管理员登录第二次排查

本次对两个实际地址执行相同请求后确认：开发端口 `2099-...manus.computer` 对 `E_Admin` / `Heibai@99` 返回 HTTP 200；用户实际使用的已发布域名 `echatapp-favrlscm.manus.space` 仍运行旧部署，对相同凭据返回 HTTP 401。此前修复仅进入开发检查点，未同步到旧发布域名，因此用户持续看到相同错误。

E聊 0.4.2 现在把“未配置 MongoDB 的临时发布环境”识别为演示预览，启动时创建和恢复预览管理员，并允许密码登录；一旦配置 MongoDB，就自动恢复正式生产安全策略，必须显式配置管理员密码和 TOTP。管理登录页会显示当前 API 版本与预览管理员状态，并提供“一键预览管理员登录”。生产模式无数据库回归返回 `preview_admin_status=200`，Vitest 3 项、xUnit 12 项、生产构建和公开开发端口的 `ADMIN_OK` 全部通过。

## 2026-09-05 四大后台系统视觉验证

E聊 0.5.0 已按参考截图重构为深色分组折叠侧栏。桌面 1440×900 验证显示首页、账户系统、资金系统、管理系统和聊天系统层级清晰，子菜单缩进、分隔线、展开箭头和移动高亮一致；群邀请码页面的新增表单、状态标签、记录卡片和删除操作完整显示。手机 390×844 验证显示抽屉遮罩、关闭按钮、账户系统与聊天系统同时展开，账户 5 项和聊天菜单可在独立滚动区继续浏览，底部管理员信息保持可用，主内容不会横向溢出。

### 四大后台系统最终结果

E聊 0.5.0 已完成首页和截图所示账户、资金、管理、聊天四大系统，共 30 个可访问页面。后台 API 覆盖用户治理、登录/离线日志、失败 IP 聚合、反馈处置、额度台账、管理账号、角色/资源/配置、安卓推送通道、公告、图片、异常、会话/群聊、客服、任务及日志、群发、通讯录、短信、机器人和群邀请码。关键写操作全部写入管理员审计日志，公告与群发通过 SignalR `admin.notice` 到达在线客户端。

最终 `pnpm check` 为 0 个错误和 0 个警告；Vitest 3 项与 xUnit 13 项全部通过；生产构建成功。主聊天冒烟返回 `E2E_OK`。管理脚本返回 `ADMIN_050_OK modules=12 pages=30 role_guard=403`，同时验证普通用户无法访问管理 API、额度调整、管理账号、图片上传、意见反馈、群发实时事件和审计日志。桌面 1440×900 与手机 390×844 浏览器回归均通过。

最终格式化版本再次执行 `ADMIN_050_OK modules=12 pages=30 audits=21 role_guard=403`，SignalR 在线群发事件已由真实双端连接确认；健康接口返回 `version: 0.5.0` 与 `status: healthy`。

## 2026-09-05 用户管理 0.5.1 视觉验证

用户管理已按参考图改为高密度运营表格。桌面 1440×900 视口可同时看到顶部批量新增、新增用户和导出数据按钮，分页与每页条数，角色/实名/企业认证快速筛选，账号、在线、手机号、注册来源、锁定、注销、红号、时间、IP 与失败次数高级筛选，以及带两级分组表头和横向滚动的用户数据表。操作菜单固定显示在表格上方，包含同 IP 检测、复制、修改邀请码/昵称、限制登录 IP、强制下线、三类锁定、注销、红号、密码重置和账户状态操作；红号用户行使用浅红背景提示。页面无横向撑破外层布局，宽表在独立滚动区域内浏览。

### 用户管理 0.5.1 最终结果

用户管理 API 已升级为分页响应，并支持账号/昵称/手机号/用户 ID、角色、账户状态、在线状态、手机号、实名、企业认证、今日上线、账号锁定、登录锁定、注销、红号、注册来源、注册/最后在线日期、三类 IP 和登录失败次数筛选。新增单用户开户、最多 200 个批量开户、筛选结果 CSV 导出、资料修改、同 IP 检测、复制用户、密码重置、强制下线及安全状态变更接口。CSV 对公式前缀做安全转义；密码只保存哈希；锁定、注销和密码重置会撤销会话并记录审计。

最终 `ADMIN_051_OK modules=12 pages=30 users=1 audits=31 role_guard=403`。自动化真实验证了新增、批量、复制、分页筛选、CSV 内容、昵称/手机号/邀请码更新、风险值、实名/企业认证、红号、账号/登录/银行卡锁定、注销、旧访问令牌失效、密码重置、同 IP 检测、普通用户 403 隔离、新增/批量弹窗，以及 390×844 手机端外层不溢出且用户宽表可独立横向滚动。聊天、好友实时、未读、二维码、通话和手机发送消息回归均通过。全量回归还发现并修复了限流中间件位于认证之前导致同一出口 IP 用户共用 240 次配额的问题。

最终构建重启后再次返回 `ADMIN_051_OK modules=12 pages=30 users=1 audits=31 role_guard=403`；健康接口返回 `version: 0.5.1`、`status: healthy`，README、开发清单与验证记录完整性检查通过。

## 2026-09-05 每账号分级操作菜单视觉复核

0.5.2 首次桌面截图确认每一行账号（包括当前管理账号）都显示“操作”按钮，主菜单已与参考图一致显示同 IP 检测、修改邀请码、修改昵称、限制登录 IP、状态变更和登录密码；状态变更子菜单能够展开。截图同时发现子菜单中部会被宽表粘性表头覆盖，导致银行卡锁定和注销开启两项视觉上被遮挡，因此继续提高当前操作单元格的临时层级后再做最终验收。

二次视觉复核确认层级修复有效：状态变更子菜单完整显示强制下线、账户锁定、登录锁定、银行卡锁定、注销开启和设置红号六项，均未再被粘性表头遮挡。账号资料功能弹窗在 1440×900 视口居中显示，清楚标注目标昵称与账号，表单、取消、确认执行和遮罩层完整；自动化同时确认所有可见账号行（包括当前管理账号）的操作按钮数量与数据行数量一致。

### 每账号操作菜单 0.5.2 最终结果

最终回归返回 `ADMIN_052_OK modules=12 pages=30 users=1 audits=33 role_guard=403 account_menus=all viewports=1440x900,390x844`。浏览器断言数据行数与“操作”按钮数完全一致，并实际打开同 IP 检测、修改邀请码、登录密码和银行卡锁定功能弹窗；自动化 API 覆盖昵称/手机号/邀请码、登录 IP 限制、账号/登录/银行卡锁定、注销、红号、强制下线、密码重置、旧令牌失效和同 IP 检测。二级菜单六个按钮逐项通过 `elementFromPoint` 遮挡检测。

## 2026-09-05 账号菜单定位与关闭交互 0.5.3

账号操作菜单已移除固定页面坐标，点击时读取对应按钮的 `getBoundingClientRect()`，以 8px 间距显示在按钮右侧；右侧空间不足时自动显示在左侧，接近视口底部时自动上移。状态二级菜单围绕触发项居中展开，六个选项在屏幕范围内完整可见。全局 `pointerdown` 只忽略菜单和按钮自身，点击其他空白区域会立即关闭；滚动、窗口尺寸变化和 Esc 同样关闭。浏览器回归已验证菜单与按钮垂直及水平间距均不超过 12px，并在空白处点击后等待菜单 DOM 消失。

最终 0.5.3 截图确认主菜单以 8px 间距紧贴首行“操作”按钮右侧，状态子菜单完整展开且未超出视口。最终自动化返回 `ADMIN_053_OK modules=12 pages=30 users=1 audits=33 role_guard=403 menu_anchor=button outside_click=closed viewports=1440x900,390x844`；健康接口返回 `version: 0.5.3` 和 `status: healthy`。

## 2026-09-05 后台需求文档 0.6.0 视觉检查

桌面 1440×900 验证显示后台版本为 `ADMIN 0.6.0`，账户系统已增加“邀请码设置”，资金系统仅保留“额度增减科目/记录”，群邀请码页面可选择真实群聊并配置次数和有效期。原资源管理、系统配置、定时任务、定时任务日志和短信管理菜单已删除。手机 390×844 侧栏完整展示会话、客服、群监控、群发言、通讯录、机器人和群邀请码，抽屉未横向溢出，页面主体保持遮罩与安全关闭入口。

### 后台需求文档 0.6.0 最终结果

`pnpm check` 通过，TypeScript 与 ASP.NET Core 编译为 0 个错误、0 个警告；Vitest 3 项与 xUnit 14 项全部通过；生产构建成功。业务回归依次返回 `E2E_OK`、`P1_QR_OK`、`CALL_SIGNAL_OK`、`CONTACT_REALTIME_OK` 和 `UNREAD_CLEAR_OK`。专用后台 API 回归返回 `ADMIN_REQUIREMENTS_060_OK verification=approved fund=12.34 totp=active push=configured announcement=revoke group_speech=sent e2ee=protected retired_modules=4`；后台浏览器回归返回 `ADMIN_060_OK modules=7 pages=25 role_guard=403 viewports=1440x900,390x844`。

## 2026-09-06 后台需求文档 V2 0.7.0 视觉检查

桌面 1440×900 预览显示 `ADMIN 0.7.0`，侧栏已按 V2 精简：资金系统新增“交易明细”，管理系统删除厂商推送，聊天系统删除通讯录并将“群监控”更名为“群管理”。页面标题、刷新、健康状态、卡片和表单层级完整。手机 390×844 抽屉可完整看到聊天系统的会话管理、客服管理、群管理、群发言、机器人发信息、抢红包机器人和群邀请码，页面主体未发生横向溢出；用户密集表格保持自身横向滚动。

### 后台 V2 0.7.0 最终结果

`pnpm check` 通过，TypeScript 与 ASP.NET Core 编译为 0 个错误、0 个警告；Vitest 3 项和 xUnit 15 项全部通过；生产构建成功。聊天、好友、未读、二维码与通话回归分别返回 `E2E_OK`、`CONTACT_REALTIME_OK`、`UNREAD_CLEAR_OK`、`P1_QR_OK` 与 `CALL_SIGNAL_OK`。后台文档 API 验收返回 `ADMIN_REQUIREMENTS_070_OK`，覆盖认证审核、八位邀请码选择、增强日志、失败 IP、交易明细、Admin 独立 TOTP、公告、加密建群/改名、群发言、群邀请码、密文边界与五类下线模块；管理浏览器验收返回 `ADMIN_070_OK modules=7 pages=24 users=1 audits=50 role_guard=403`，并覆盖图片分类标签编辑/删除、角色权限白名单、普通用户/Admin 隔离和桌面/手机布局。

## 2026-09-06 GeoIP 登录地区 0.7.1 验证

服务重启并清空进程缓存后，`geoip-smoke.mjs` 使用 `X-Forwarded-For: 8.8.8.8` 完成 Admin 登录，并使用 `1.1.1.1` 注册新用户。第三方 HTTPS 查询成功把用户地址解析为“澳大利亚 · 昆士蘭州 · 布里斯班”；用户资料 `lastLoginAddress` 与登录日志 `data.address` 完全一致。`/api/health` 返回 `version: 0.7.1`、`provider: ipwho.is`、`enabled: true` 和 `cachedEntries: 2`，重复请求没有增加缓存数量。

GeoIP 单元测试使用模拟 HTTP 响应验证中文国家/省州/城市拼接、ISP 返回和缓存命中，并确认私网地址不会触发外部请求。代码路径同时覆盖登录、离线、强制下线、管理员操作审计和未处理异常日志；第三方失败、超时或非公网地址均回退到 `RequestMetadata.Address(ip)`，不改变认证成功条件。

### GeoIP 0.7.1 最终结果

`pnpm check` 通过，TypeScript 与 ASP.NET Core 编译为 0 个错误、0 个警告；Vitest 3 项与 xUnit 16 项全部通过；`pnpm build` 生产构建成功。全量业务回归依次返回 `E2E_OK`、`ADMIN_REQUIREMENTS_071_OK`、`ADMIN_071_OK modules=7 pages=24 users=1 audits=50 role_guard=403 menu_anchor=button outside_click=closed viewports=1440x900,390x844` 和 `GEOIP_OK provider=ipwho.is address=澳大利亚 · 昆士蘭州 · 布里斯班 cached=2`。GeoIP 只表示基于公网 IP 的近似地区，不表示精确物理住址。

## 2026-09-06 Android APP 0.8.0 验证

Capacitor 8.5.1 已生成包名 `com.echat.app` 的原生 Android 工程，`aapt dump badging` 确认 `versionCode=8`、`versionName=0.8.0`、`minSdkVersion=24`、`targetSdkVersion=36`。Manifest 包含 Internet、Camera、Record Audio、Modify Audio Settings、Post Notifications、Vibrate 与 Wake Lock 权限，并把摄像头和麦克风声明为非强制硬件能力。Gradle `testDebugUnitTest lintDebug assembleDebug` 完整通过；最终 APK 使用 Android debug 证书和 APK Signature Scheme v2 验证成功，大小约 7.1 MB，SHA-256 为 `fb85a802ebe81fed116e8acc7f7755660da18470c635fa00290037c81b72f29d`。

Android WebView 构建内置生产 API 地址 `https://echatapp-favrlscm.manus.space`；REST、刷新令牌和 SignalR 均通过统一地址解析。临时 Production 实例的 CORS 回归确认 `https://localhost` 返回 `Access-Control-Allow-Origin`，非白名单 `https://evil.example` 不返回该响应头。Android Manifest 禁止明文 HTTP。

Capacitor System Bars 以 CSS 变量注入系统 inset。`android-safe-area-smoke.mjs` 在 390×844 视口模拟顶部 30 px 刘海、左右 8 px 挖孔和底部 34 px 系统导航栏，结果为 `ANDROID_SAFE_AREA_OK`：主界面边界为 `top=30, right=382, bottom=810, left=8`，底部 APP 菜单按钮最下缘为 810，没有进入系统导航区域。扫码、语音录制和音视频通话分别在操作前请求 Camera、Microphone 或两者权限；Capacitor WebChromeClient 再完成 WebView 媒体授权。

服务端新增 FCM HTTP v1 OAuth 发送、MongoDB/内存推送设备持久化、失效令牌停用及消息、好友申请、音视频来电高优先级通知。通知数据只含事件与资源编号，不含端到端加密消息明文。客户端实现 Android 13+ 通知权限、消息/通话频道、令牌注册、退出注销、前台状态及点击通知跳转。`ANDROID_PUSH_OK provider=Firebase Cloud Messaging server_enabled=false registered=1 disabled=1` 验证设备 API；xUnit 新增令牌更新、用户隔离与停用测试，总数为 17 项。当前未提供项目方 `google-services.json` 和 FCM 服务账号，因此真实设备 FCM 实发尚未执行，health 正确返回 `push.enabled=false`，客户端显示“待配置 FCM”而不影响聊天和媒体能力。

### Android 0.8.0 最终结果

`pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 4 项（含个人中心“待配置 FCM”状态映射）、xUnit 17 项、生产 Web 构建和 Android APK 构建均通过。完整业务回归返回 `E2E_OK`、`ADMIN_REQUIREMENTS_080_OK`、`ADMIN_080_OK modules=7 pages=24 users=1 audits=50 role_guard=403 menu_anchor=button outside_click=closed viewports=1440x900,390x844`、`GEOIP_OK provider=ipwho.is address=澳大利亚 · 昆士蘭州 · 布里斯班 cached=2`、`ANDROID_PUSH_OK` 与 `ANDROID_SAFE_AREA_OK`。交付 APK 是便于安装验证的 debug 包；上架应用商店前仍需项目方 Firebase 配置、独立 release 签名、真机通知/通话验证及 AAB 发布流程。

## 2026-09-06 Android APP 0.8.1 登录闪退修复

0.8.0 debug APK 未包含项目方 `google-services.json`，登录成功进入 Messenger 后仍会自动调用 Capacitor Push Notifications 的 `register()`。插件源码中的 `FirebaseMessaging.getInstance()` 要求已经创建 Firebase 默认应用，因此这是缺少客户端 Firebase 配置时最直接的原生异常路径。

0.8.1 在任何原生推送调用前先请求 `/api/push/status`。当前生产服务返回 `push.enabled=false` 时，客户端立即进入“待配置 FCM”，不会添加推送监听、检查/请求通知权限、创建通知频道、调用 `register()`，甚至不会调用 Firebase 客户端能力检查。服务端日后启用 FCM 后，原生桥接还会检查 APK 是否包含 `google_app_id`；只有服务端与 APK 两端配置均完整时才初始化 FCM。

新增直接回归通过：`mobile-native-guard.test.ts` 模拟 Android 登录后服务端 FCM 关闭，确认 `getCapabilities`、`addListener`、`checkPermissions`、`requestPermissions`、`createChannel` 和 `register` 均为零调用；四种客户端/服务端组合门控与个人中心状态映射也通过。最终为 Vitest 6 项、xUnit 17 项。

无 `google_app_id` 条件下，Android `testDebugUnitTest`、`lintDebug`、`assembleDebug` 全部成功。新包经 16 KB zipalign 与 APK Signature Scheme v2 验证，`aapt` 确认包名 `com.echat.app`、`versionCode=9`、`versionName=0.8.1`；SHA-256 为 `921fef26902f6552d042c88fa2f47f0661acdf45962e37dd095ee085ece0ebee`。全量回归返回 `E2E_OK`、`ADMIN_REQUIREMENTS_081_OK`、`ADMIN_081_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK` 与 `ANDROID_SAFE_AREA_OK`。

## 2026-09-06 Android APP 0.8.2 消息解密与通话音频修复

消息问题由两类路径共同导致：旧协议只在账号保存一个 RSA 公钥，新 Android WebView 身份可能无法打开已有会话信封；同时发送者自身的 SignalR 回显可能先以失败占位进入列表，而 POST 成功响应只去重、不替换。0.8.2 改为按 `deviceId` 保存公钥，会话和消息带 `keyVersion`，新设备无法打开当前信封时会为所有成员设备生成下一版本密钥信封；服务端以 409 拒绝过期版本继续发送。发送文字和富媒体后的本地成功结果现在会替换同编号回显。历史消息没有对应旧密钥时明确显示“该消息发送于本设备加入加密会话之前”，不再把它误报为新消息发送失败。

`ANDROID_E2EE_OK conversation=20d2cda8c8bc47388949dea0ac21870d versions=1,2,3 devices=3 legacy=decryptable app=decryptable peer=decryptable stale=409 ui=ok` 使用三个独立 RSA 身份完成旧浏览器、Android 新设备和好友设备的三版本轮换；真实 React 页面自行更新设备公钥、自动轮换到版本 3、发送消息，并由好友私钥成功解密。另行验证部分旧成员尚未登记设备公钥时不会阻塞会话列表和未读回执，`UNREAD_CLEAR_OK mobile=3>0 live=4>0 desktop=1>0 live=2>0` 通过。

通话无声的直接原因是纯语音通话没有把远端 `MediaStream` 绑定到任何音频元素。0.8.2 为每个远端流挂载自动播放的 `audio`，视频元素在 `loadedmetadata` 和 `canplay` 后也主动调用 `play()`。Android 原生桥进入 `MODE_IN_COMMUNICATION`，使用 `USAGE_VOICE_COMMUNICATION`、`CONTENT_TYPE_SPEECH` 与临时音频焦点；Android 12+ 通过 `setCommunicationDevice` 切换听筒/扬声器，旧系统使用 speakerphone，挂断时清除路由并释放焦点。通话控制栏新增可见“打开/关闭扬声器”按钮，语音默认听筒，视频默认扬声器。

双端真实 WebRTC 回归返回 `ANDROID_CALL_AUDIO_OK conversation=a7b199632fd64eb793148700a8b93283 peers=2 voice_tracks=1,1 video_audio_tracks=1,1 autoplay=true speaker=toggle video_speaker=default_on`：语音和视频两种模式下双方均收到一条启用的远端音轨，自动播放已启用，扬声器按钮可切换；390×844 手机界面另返回 `MOBILE_CHAT_OK ... speaker=toggle`。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 8 项、xUnit 17 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。全量遇错即停回归同时返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_082_OK`、`ADMIN_082_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK` 和 `ANDROID_CALL_AUDIO_OK`。

最终 APK 经 16 KB zipalign 与 APK Signature Scheme v2 验证；`aapt` 确认包名 `com.echat.app`、`versionCode=10`、`versionName=0.8.2`、最低 API 24、目标 API 36。文件 `EChat-0.8.2-debug.apk` 的 SHA-256 为 `894cc5727c217eb40920a950bd2f2777b5dc4b2e425f9ae065ed8d7ce4058f73`。

## 2026-09-06 Android APP 0.8.3 新消息密钥恢复与提示音

新消息误显示“该消息发送于本设备加入加密会话之前”包含两个并发条件：`message.created` 可能先于 `conversation.updated` 的会话刷新到达；同一 `deviceId` 重装后，SignalR 也可能在新 RSA 公钥发布前触发密钥轮换。0.8.3 强制先发布当前设备公钥，再加载会话和启动 SignalR；内存仓库与 MongoDB 另外按会话编号及 `keyVersion` 保存不可变设备信封。客户端本地缺少某条消息对应密钥时，会调用成员鉴权的指定版本信封 API，以当前设备不可导出私钥导入并保存后再解密。真正没有历史设备信封的旧消息仍保留原安全提示。

真实三设备回归主动删除接收端 IndexedDB 中的版本 3 会话密钥，再由好友发送版本 3 新消息。最终返回 `ANDROID_E2EE_OK ... realtime_recovery=ok message_sound=once`：SignalR 新消息已到达，客户端从 API 恢复当前设备信封并正常显示明文，提示音事件只触发一次。该回归同时覆盖同一设备编号更换 RSA 身份时先发布公钥再轮换，以及版本 1 历史消息仍由旧设备解密、过期版本发送返回 409。

Android 原生层已打包 `echat_message.wav` 和 `echat_call.wav`。前台其他账号新消息播放一次短提示音；语音或视频来电循环播放铃声，接听、拒绝、结束或 Activity 销毁时停止。前台 SignalR 与 FCM 按消息/通话编号在 5 秒内去重；后台通知分别使用带自定义声音的 `messages-v2` 和 `calls-v2` 频道。双端真实 WebRTC 回归返回 `ANDROID_CALL_AUDIO_OK ... alerts=voice,video stopped=accept`，确认语音和视频两类来电都触发提示并在接听时停止，同时双方远端音轨、自动播放和扬声器切换继续正常。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 9 项、xUnit 18 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。全量遇错即停回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_083_OK`、`ADMIN_083_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK` 和 `ANDROID_CALL_AUDIO_OK`。

最终 APK 经 16 KB zipalign 与 APK Signature Scheme v2 验证；`aapt` 确认包名 `com.echat.app`、`versionCode=11`、`versionName=0.8.3`、最低 API 24、目标 API 36，且两个 `res/raw` 提示音均已打包。文件 `EChat-0.8.3-debug.apk` 的 SHA-256 为 `e9be67864cfbe53153892d378d0573871cc4e56dfe0e7dacc8ca1beae4eb6d90`。

## 2026-09-06 Android APP 0.8.4 错误密钥缓存自愈

生产域名 `https://echatapp-favrlscm.manus.space` 已确认运行 0.8.3 密钥信封 API，因此本轮继续复现客户端升级遗留状态。根因是 0.8.3 只在 IndexedDB 完全缺少某个 `keyVersion` 时恢复信封；如果相同版本已经保存了错误 AES 密钥，客户端会直接信任该缓存，解密失败后显示“该消息发送于本设备加入加密会话之前”，主动发送还可能产生其他成员无法解开的同版本密文。

0.8.4 在每次应用生命周期内实际使用当前设备不可导出 RSA 私钥验证服务器当前设备信封，验证后才信任对应本地 AES 密钥；不能解封时按成员最新设备公钥自动轮换。消息第一次解密失败会绕过缓存，重新获取指定版本设备信封、覆盖 IndexedDB 后重试。发送文字和富媒体前也强制以服务器信封校准；当前设备没有服务器信封时会阻止发送，不会继续产生无法解密的消息。

三设备真实 React 页面回归先把版本 3 本地缓存替换为随机错误 AES 密钥，再由好友发送新消息，确认接收端强制恢复并显示明文；随后再次写入错误密钥，由 APP 主动发送，确认发送前自动校准、本机显示正常且好友端成功解密。最终输出 `ANDROID_E2EE_OK ... realtime_recovery=ok send_key_repair=ok message_sound=once`。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 9 项、xUnit 18 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。全量回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_084_OK`、`ADMIN_084_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK` 和 `ANDROID_CALL_AUDIO_OK`。

最终 APK 经 16 KB zipalign 与 APK Signature Scheme v2 验证；`aapt` 确认包名 `com.echat.app`、`versionCode=12`、`versionName=0.8.4`、最低 API 24、目标 API 36。文件 `EChat-0.8.4-debug.apk` 的 SHA-256 为 `1ca3a379f12b42bde5df3f9d6847062894707a4af018da22ae4ca396fd95c650`。

## 2026-09-06 Android APP 0.8.5 后台通知栏回退

生产域名健康接口在修复前返回 `push.enabled=false`，说明项目方尚未配置 FCM 服务账号；因此 0.8.4 只有 APP 前台的 SignalR 提示音，切到后台后没有系统通知。0.8.5 加入 Capacitor Local Notifications：登录后独立检查 Android 13+ 通知权限并创建 `messages-v2` 与 `calls-v2` 频道，通过 `App.appStateChange` 记录前后台状态。进程仍存活时，新消息在后台立即调度本地通知，语音/视频来电使用高优先级通话频道；点击通知通过 `extra` 中的会话编号返回对应聊天。通知正文只描述“加密消息/图片/语音/视频/文件”，不包含端到端加密明文。

Vitest 直接模拟服务端 `enabled=false`、APP 由前台切到后台的场景，验证没有调用任何 Firebase API，但已检查本地通知权限、创建两个频道，并通过 `LocalNotifications.schedule()` 写入 `messages-v2` 通知和会话跳转数据。个人中心状态测试确认显示“后台通知已开启”。Android `cap sync` 确认 APK 注册 `com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin`；合并 Manifest 包含 `POST_NOTIFICATIONS`、通知发布/恢复 Receiver 与文件 Provider，打包配置包含通知图标、颜色和声音。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 9 项、xUnit 18 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。全量回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_085_OK`、`ADMIN_085_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK` 和 `ANDROID_CALL_AUDIO_OK`。

最终 APK 经 16 KB zipalign 与 APK Signature Scheme v2 验证；`aapt` 确认包名 `com.echat.app`、`versionCode=13`、`versionName=0.8.5`，并声明 `android.permission.POST_NOTIFICATIONS`。文件 `EChat-0.8.5-debug.apk` 的 SHA-256 为 `cc600c4060f8c3c7c726871abec0b883fb4143eba688a2f2c9a2a1b69d8343fc`。

本地通知只覆盖 APP 位于后台且进程/SignalR 仍存活的情况；设备进入 Doze、系统冻结 WebView、用户强制停止或进程被杀死后，可靠通知仍需配置 Firebase 客户端与服务端凭据。已配置 FCM 时，后台由 FCM 负责，客户端不会重复调度本地通知。

## 2026-09-06 Android APP 0.8.6 常驻后台来电

0.8.5 的本地通知仍依赖 WebView 内 SignalR；Android 暂停 WebView 或回收普通进程后，`call.invited` 无法到达 JavaScript。本轮按用户选定的“Android 常驻来电服务（无需 Firebase）”方案新增 `CallListenerService`：服务声明为 `remoteMessaging` 前台服务，使用 Microsoft SignalR 8 Java 客户端维护独立 WSS 连接，运行时显示低优先级“E聊正在接收来电”常驻通知；网络断开后按 1、3、8、15、30、60 秒阶梯重连，系统重建服务时从应用私有存储恢复配置。

`POST /api/calls/listener-token` 签发七天有效、绑定当前 session 与 device 的 `scope=call_listener` JWT。ASP.NET Core 默认授权策略继续只接受 `scope=app`；ChatHub 仅允许监听 scope 建立连接，并让它只加入 `user:{userId}`，不加入会话组。所有可调用 Hub 方法在入口再次要求 app scope。端到端脚本确认该令牌访问 `/api/calls` 返回 403，调用 `MarkRead` 返回 `LISTENER_SCOPE_READ_ONLY`，但能接收来电邀请和清理事件。

来电邀请由会话组广播改为向每位接听者的用户组发送；`android-call-listener-smoke.mjs` 特意先建立原生监听连接、再创建好友关系与会话，随后发起视频邀请，仍收到完整 `call.invited`。接听、拒绝和结束统一向参与者用户组发送 `call.listener.cleared`。最终输出 `ANDROID_CALL_LISTENER_OK ... scope=readonly api=403 late_conversation=received events=invited,cleared`；原有 `CALL_SIGNAL_OK` 同时通过，确认现有浏览器通话信令未受影响。

APK 后台收到邀请时使用 `CATEGORY_CALL` 高优先级通知和循环 `echat_call.wav`；点击通知恢复现有 Activity，并把一次性来电载荷交给 React。来电载荷会在 WebRTC SignalR 尚未就绪时缓存，接听、拒绝或结束后清除；原生服务按当前用户编号过滤自己发起的通话，前台由 JavaScript 处理时也不会生成重复通知。退出账号或会话过期会停止服务并清除受限令牌。个人中心增加“后台来电 / 常驻服务运行中”状态。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 9 项、xUnit 19 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。14 组全量回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_086_OK`、`ADMIN_086_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK`、`ANDROID_CALL_AUDIO_OK` 和 `ANDROID_CALL_LISTENER_OK`。

最终 APK 的合并 Manifest 包含 `FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_REMOTE_MESSAGING` 和 `foregroundServiceType=remoteMessaging`；DEX 同时包含 `com.echat.app.CallListenerService` 与 `com.microsoft.signalr`。16 KB zipalign 和 APK Signature Scheme v2 验证通过；`aapt` 确认包名 `com.echat.app`、`versionCode=14`、`versionName=0.8.6`、最低 API 24、目标 API 36。文件 `EChat-0.8.6-debug.apk` 的 SHA-256 为 `d29037fa3d2d4f2095c044a6326aa3a9db4968a127fce6ec9c6a08739eaf134e`。

系统边界：Android 用户执行“强制停止”后，系统会禁止 APP 的后台组件继续运行，必须重新打开 APP；部分厂商的极限省电策略也可能终止前台服务，需要允许 E聊后台运行。常驻服务解决音视频后台来电，不替代 APP 被完全终止后的普通消息 FCM 推送。

## 2026-09-06 Android APP 0.8.7 鸿蒙后台来电与通话状态修复

接听后重复出现来电且没有声音的根因是状态含义混淆：服务端在 `CallAccept` 后发送 `call.listener.cleared`，原生服务需要用它清除通知和铃声，但 React 端此前无条件执行 `finish(false)`，导致刚建立的 WebRTC、媒体轨道和通话音频模式立即被关闭；原生待处理来电缓存又可能在 effect 重新挂载时恢复同一邀请。0.8.7 增加 `answering` 状态，清理事件只关闭仍处于 `incoming` 的来电，并在接听、原生清理和通知恢复时按 `callId` 消费缓存。接听前最多等待 8 秒让后台恢复后的 SignalR 重新连接，接通后继续保留远端音轨和通信音频模式。

语音和视频呼出进入 `calling` 后播放独立循环资源 `echat_ringback.wav`，对方接听、拒绝、结束、呼叫失败或本机挂断时停止。`android-call-audio-smoke.mjs` 建立双端语音与视频通话，确认双方远端音轨均为 1、自动播放开启、语音扬声器可切换、视频默认扬声器；它还在接通后模拟原生清理事件，确认通话未结束，并验证两次呼出等待铃声均启动且接听时停止。最终输出 `ANDROID_CALL_AUDIO_OK ... ringback=voice,video stopped=accept`。

针对支持 Android APK 的华为/荣耀鸿蒙设备，来电服务改为 `:calls` 独立进程并持有受控 `PARTIAL_WAKE_LOCK`；原生 SignalR 使用 15 秒 keepalive、45 秒服务器超时与阶梯重连。连接重建后，ChatHub 会补发最近 90 秒仍处于 Ringing 的来电；跨进程广播直接携带完整 payload，避免 SharedPreferences 多进程缓存不一致。首次登录请求电池优化豁免，个人中心显示制造商、授权状态，并可打开华为/荣耀应用启动管理。系统仍要求用户手动允许自启动、关联启动和后台运行；强制停止无法由应用绕过。纯原生 HarmonyOS NEXT 不支持 Android APK，需独立 ArkTS/HAP 客户端。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 11 项、xUnit 19 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。14 组全量回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_087_OK`、`ADMIN_087_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK`、`ANDROID_CALL_AUDIO_OK` 和 `ANDROID_CALL_LISTENER_OK`；监听回归额外确认 `reconnect_replay=received`。

最终 APK 的合并 Manifest 包含 `android:process=":calls"`、`foregroundServiceType=remoteMessaging`、`WAKE_LOCK` 与电池优化请求权限；包内包含 `echat_message.wav`、`echat_call.wav` 和 `echat_ringback.wav`。16 KB zipalign 与 APK Signature Scheme v2 验证通过；`aapt` 确认包名 `com.echat.app`、`versionCode=15`、`versionName=0.8.7`、最低 API 24、目标 API 36。文件 `EChat-0.8.7-debug.apk` 的 SHA-256 为 `ed1cd7e0fbb18b44145bea2f217b984245aec9223cc75ce77c7842336ae24d34`。

## 2026-09-06 Android APP 0.8.8 鸿蒙接听握手与音频恢复

0.8.7 已避免 React 把通知清理误当成挂断，但在用户点击“接听”到麦克风/摄像头采集完成之间，服务端记录仍处于 `Ringing`。鸿蒙若在这个窗口重建 `:calls` 进程或原生 SignalR 连接，会再次补发同一 `callId`。0.8.8 新增 `CallPrepareAnswer`：客户端点击接听后先把当前账号写入 `AnsweringAtUtc` 并立即清除原生通知，然后才请求媒体并执行 `CallAccept`。监听重连补发跳过最近 30 秒正在接听的账号；群聊仍允许不同成员分别准备和依次接听。

原生 `CallListenerService` 同时在独立进程内存和应用私有存储保留两分钟 `callId` 清理墓碑。迟到的用户组事件、跨进程广播、通知 Intent、待处理 SharedPreferences 和 Capacitor 事件都会先检查墓碑；来电事件不再使用 retained replay。通知冷启动直接读取 Intent 载荷。`android-call-listener-smoke.mjs` 在接听准备后断开并重建监听连接，确认没有再次收到同一邀请；未接来电断线后仍能正常补发，最终输出 `ANDROID_CALL_LISTENER_OK ... answering_replay=suppressed reconnect_replay=received`。

接听音频恢复同时强化：远端 audio/video 显式 `muted=false`、`volume=1`，在挂载、`loadedmetadata`、`canplay`、250 ms、1 秒和 2.5 秒重试播放；远端音轨到达及接通后再次应用通信音频路由。原生层解除麦克风静音，现代通信设备 API 失败时回退 speakerphone。呼出等待铃声在原生层明确走扬声器。双端回归人为延迟接听方媒体采集 1.2 秒，确认准备握手先持久化；语音和视频双方远端音轨均为 1、未静音、音量为 1，两次呼出等待铃声都在接听时停止，最终输出 `ANDROID_CALL_AUDIO_OK ... volume=1 answering_handshake=ok ... ringback=voice,video stopped=accept`。原有 `CALL_SIGNAL_OK` 同时通过。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 11 项、xUnit 19 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。14 组全量回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_088_OK`、`ADMIN_088_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK`、`ANDROID_CALL_AUDIO_OK` 和 `ANDROID_CALL_LISTENER_OK`。

最终 APK 的合并 Manifest 保留 `android:process=":calls"` 与 `foregroundServiceType=remoteMessaging`，包内包含来电铃声与呼出等待铃声。16 KB zipalign 与 APK Signature Scheme v2 验证通过；`aapt` 确认包名 `com.echat.app`、`versionCode=16`、`versionName=0.8.8`、最低 API 24、目标 API 36。文件 `EChat-0.8.8-debug.apk` 的 SHA-256 为 `889d240114c1397033b4cdf07ec520cab05fc4f9dba48348946b6bb7ef8e2096`。

沙箱没有可用 Android/鸿蒙真机或 KVM，因此自动化验证覆盖协议、浏览器双端 WebRTC、Android Java 编译、Manifest 和 APK 产物；仍需在目标鸿蒙设备允许 E聊忽略电池优化，并在系统应用启动管理中开启自启动、关联启动和后台运行。Android“强制停止”会禁用所有后台组件，必须重新打开 APP。

## 2026-09-06 Android APP 0.8.9 加密表情消息

聊天输入栏原有“后续开放”表情按钮已替换为真实响应式面板。面板包含最近使用以及笑脸、手势、动物、食物、活动、旅行、物品、符号九类入口，支持中文和英文关键词搜索；最近使用在设备本地去重保存，最多 24 个。触摸设备打开面板不会自动唤起软键盘，390×844 真机等效视口检查确认面板四边均位于可视区域内。

选择表情后，客户端使用当前会话 `keyVersion` 的 AES-GCM 密钥加密 Unicode 字符并以独立 `MessageKind.Emoji` 发送。服务端只持久化密文、随机数、算法和类型；消息解密后显示为大号无底色气泡并沿用两分钟撤回。内存仓库与 MongoDB 的会话预览统一为“[表情]”，FCM 与本地后台通知只显示“发来一个表情”，不把实际表情字符写入服务端预览或通知载荷。

Vitest 新增分类、中文/英文搜索、最近使用去重和本地持久化覆盖，最终 13 项通过；xUnit 新增 `Emoji` 类型和“[表情]”预览覆盖，最终 20 项通过。API 冒烟输出 `E2E_OK ... emoji=Emoji:[表情]`；390×844 真实 React 页面完成打开面板、搜索“爱心”、发送 `❤️`、检查独立消息类型与会话预览，输出 `MOBILE_CHAT_OK ... emoji=searched:sent:preview`。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告，`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。14 组全量回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_089_OK`、`ADMIN_089_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`ANDROID_E2EE_OK`、`ANDROID_CALL_AUDIO_OK` 和 `ANDROID_CALL_LISTENER_OK`。

最终 APK 包含表情搜索文案和生产 API 地址。16 KB zipalign 与 APK Signature Scheme v2 验证通过；`aapt` 确认包名 `com.echat.app`、`versionCode=17`、`versionName=0.8.9`、最低 API 24、目标 API 36。文件 `EChat-0.8.9-debug.apk` 的 SHA-256 为 `d174ae6814447b8f2c2972956bd598ebde0ec1b0173c32de1857ee77a2fd53e4`。

## 2026-09-06 E聊 0.9.0 后台文档功能改造

本轮按《后台管理的功能需求对接-3》完成四项页面/API 改造。意见反馈页加入管理员“新增”入口，可提交完整文字、联系方式和最多 6 张图片；图片使用独立 `AdminFeedback` 媒体用途，管理员通过鉴权地址预览。角色管理固定为超级管理员、运营管理员、财务管理员、审计员、客服五类，角色和权限全部中文回显；禁止新增、删除或改名，允许更新状态与权限。MongoDB 启动迁移会补齐固定角色并删除旧动态角色，同时保留固定角色已调整的权限数据。账户系统登录日志排除全部后台角色，管理系统登录日志只显示后台账号。

按文档要求，新发送的文字和表情使用 `content` 明文保存；图片、文件、语音和视频按原文件上传到受鉴权媒体存储。会话列表直接生成文字预览，APP 聊天气泡直接显示内容，后台会话详情可读取明文。协议切换前的 AES-GCM 消息、版本化设备信封和加密附件没有批量迁移或改写，仍可由原设备兼容读取；新客户端不再把新消息宣传为端到端加密，登录页、注册告知、聊天状态和个人资料页均已同步为明文消息说明。

专项 API 回归返回 `PLAINTEXT_MESSAGES_OK ... text=visible emoji=visible media=original admin=readable`；后台需求回归返回 `ADMIN_REQUIREMENTS_090_OK ... login_logs=user-only admin_logs=isolated conversations=plaintext feedback=text+image roles=fixed-five`。后台 1440×900 浏览器回归确认：新增反馈弹窗完整显示文字、联系方式和多图片控件；角色页仅有五个固定中文角色、权限字段和下拉选项均为中文且无删除按钮；账户登录日志不显示 E_Admin；聊天记录弹窗显示“后台可直接查看的明文验收消息”并标识历史密文。

最终 `pnpm check` 为 0 个 TypeScript/.NET 错误和 0 个 .NET 警告；Vitest 13 项、xUnit 21 项、`pnpm build`、Android `testDebugUnitTest`、`lintDebug` 与 `assembleDebug` 全部成功。15 组遇错即停回归返回 `E2E_OK`、`CALL_SIGNAL_OK`、`P1_QR_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`ADMIN_REQUIREMENTS_090_OK`、`ADMIN_090_OK`、`GEOIP_OK`、`ANDROID_PUSH_OK`、`ANDROID_SAFE_AREA_OK`、`PLAINTEXT_MESSAGES_OK`、`LEGACY_E2EE_COMPAT_OK`、`ANDROID_CALL_AUDIO_OK` 和 `ANDROID_CALL_LISTENER_OK`。

最终 APK 内置生产 API `https://echatapp-favrlscm.manus.space`。16 KB zipalign 与 APK Signature Scheme v2 验证通过；`aapt` 确认包名 `com.echat.app`、`versionCode=18`、`versionName=0.9.0`、最低 API 24、目标 API 36。文件 `EChat-0.9.0-debug.apk` 的 SHA-256 为 `5cb6916233d20074247c62ead3af9916749a315063c7c9f7d9980878049c9356`。

## 2026-09-06 Android 0.9.0 正式签名 AAB/APK

本轮为 `com.echat.app` 新建独立 Android 发布身份：PKCS12 keystore、RSA 4096 位私钥、`SHA256withRSA`，别名为 `echat_release`，证书有效期从 2026-09-06 至 2054-01-22。证书 SHA-256 为 `c7e9b9bdd7c3ce714de27e224d5fd947df95d151946be6a43c4ad5b870f3c898`。私钥与签名凭据没有写入项目；二者已放入 AES-256、文件名加密的 `EChat-Android-signing-backup.7z`，解压密码保存为独立文件，归档完整性测试通过。

Gradle release 签名只读取 `ECHAT_ANDROID_KEYSTORE`、`ECHAT_ANDROID_STORE_PASSWORD`、`ECHAT_ANDROID_KEY_ALIAS` 和 `ECHAT_ANDROID_KEY_PASSWORD`。缺少变量时，`scripts/android-release.sh` 以退出码 2 明确失败。完整发布命令执行 Android Web 资源同步、`testReleaseUnitTest`、`lintRelease`、`bundleRelease` 与 `assembleRelease`，随后自动验证产物并生成 SHA-256 清单。

`EChat-0.9.0-release.apk` 的 SHA-256 为 `0120960097b1dfb46a30e711ef28742f4295866b85cd8851193f81ca26004e5c`；APK Signature Scheme v2 和 v3 均通过，16 KB zipalign 通过。`EChat-0.9.0-release.aab` 的 SHA-256 为 `6e9c9fd103fcf6c7c23b15023bead603a8a77bc9e3cd48431601d50080320302`；AAB JAR 签名通过，并确认与 APK 使用同一证书。Google 官方 bundletool 1.18.1 `validate` 成功，并从 AAB 生成可验证的通用 APK。两个产物均为 `versionName=0.9.0`、`versionCode=18`、最低 API 24、目标 API 36，并连接 `https://echatapp-favrlscm.manus.space`。

此前 debug APK 使用 Android SDK 调试证书，不能被本次正式证书直接覆盖。设备首次切换正式版时必须先卸载 debug 版；从本次正式版开始，后续构建必须永久复用本轮发布密钥并递增 `versionCode`。正式签名不自动启用 Firebase；当前构建仍未包含项目方 `google-services.json`，系统进程被完全终止后的可靠普通消息推送仍需后续配置 FCM。

## 2026-09-06 iOS 0.9.0、APNs、PushKit/CallKit 与 TestFlight 准备

Capacitor 8 iOS 工程已生成并同步最新 React 客户端，Bundle ID 为 `com.echat.app`，marketing version 为 0.9.0，build 为 18，deployment target 为 iOS 15。`SceneDelegate` 与 Storyboard 均加载 `MyViewController`，确保自定义 `MediaPermissionsPlugin` 实例实际注册。AppDelegate 已转发普通 APNs token，PushKit 获取独立 VoIP token，CallKit 使用服务端 UUID `callId` 报告系统来电，并处理系统接听、拒接、远端接听及挂断。服务端的结束 VoIP push 会清理同一账号其他 iPhone 上仍显示的系统来电。

服务端 APNs 实现使用 HTTP/2 与 P-256 ES256 provider token；普通通知 topic 为 Bundle ID，VoIP topic 为 `{BundleId}.voip`，VoIP push 使用 priority 10、即时过期和 `callId` collapse ID。Android、iOS alert 与 iOS VoIP token 可在同一设备上共存；删除设备会停用全部平台；410、BadDeviceToken 与 Unregistered 会停用对应 token。MongoDB 旧 user/device 唯一索引会迁移到 user/device/platform，并修复了迁移时修改不可变 `_id` 的风险。

Apple 隐私清单不再错误声明“未收集数据”。当前声明 E聊发送到服务端并保留的账号/昵称、可选手机号、好友社交图、消息、照片/视频、语音、其他用户内容、反馈、用户/设备标识、活跃/登录诊断和由 IP 推断的粗略地区；全部与账号关联、用于 App Functionality、不用于跨应用跟踪。UserDefaults Required Reason 为 `CA92.1`。账号持有人仍须在 App Store Connect 按最终生产部署确认隐私营养标签、隐私政策和出口合规。

### 自动化结果

`pnpm check`、`pnpm test` 和 `pnpm build` 全部通过。Vitest 为 15/15，其中 iOS 专项覆盖普通 APNs 与 PushKit token 分平台上传、CallKit `answerRequested` Web 事件和 iOS 不调度 Android 本地通知；xUnit 为 25/25，其中 APNs 专项覆盖 JWT、payload、production VoIP endpoint、topic、push type、即时过期、collapse ID、主叫资料、多平台 token 共存与停用。ASP.NET Core 编译为 0 warning、0 error，React/Vite 和 .NET Release publish 成功。

`pnpm ios:sync` 成功，Capacitor 检出 App、Local Notifications 与 Push Notifications 三个 iOS 插件，且同步前后的 AppDelegate、SceneDelegate、entitlement 和隐私清单哈希一致。Bundle ID 迁移后，`scripts/validate-ios-project.py` 返回 `IOS_STATIC_OK bundle=com.tomzeng845.echat version=0.9.0 build=18 ios_min=15 apns=ready pushkit=ready callkit=ready`，验证 plist、PBX 资源引用、APNs Debug/Release 环境、版本、图标、PCM 铃声、隐私数据类型和仓库中无 Apple 私钥。

Android 防回归执行 `testDebugUnitTest lintDebug assembleDebug`，Gradle 返回 `BUILD SUCCESSFUL`。推送 API 分别返回 `ANDROID_PUSH_OK ... registered=1 disabled=1` 和 `IOS_PUSH_API_OK ... registered=2 platforms=ios,ios-voip disabled=2 ios_enabled=false`；`ios_enabled=false` 是因为当前服务端没有注入 Apple Key，属于安全降级预期。健康接口保持版本 0.9.0，并新增 `androidEnabled=false` 与 `iosEnabled=false`。

业务回归最终返回 `E2E_OK`、`CONTACT_REALTIME_OK`、`MOBILE_CHAT_OK`、`UNREAD_CLEAR_OK`、`P1_QR_OK`、`PLAINTEXT_MESSAGES_OK`、`LEGACY_E2EE_COMPAT_OK`、`CALL_SIGNAL_OK`、`ANDROID_CALL_LISTENER_OK`、`ANDROID_CALL_AUDIO_OK`、`ANDROID_SAFE_AREA_OK`、`ADMIN_REQUIREMENTS_090_OK`、`ADMIN_090_OK` 和 `GEOIP_OK`。后台 UI 脚本依赖后台需求脚本创建的明文会话验收数据，按 `admin-requirements-smoke` 后执行即通过全部 24 页、菜单锚定、空白关闭与 1440×900/390×844 布局检查。

### 初始阶段尚未验证的 Apple 侧边界

本节记录源码初始就绪时的环境边界；后续 GitHub-hosted macOS 26 已完成 Xcode Archive、Apple 签名和 IPA 导出，详见本文末尾。`altool` 上传、App Store Connect 处理、TestFlight 安装、真实 APNs/PushKit/CallKit 和 iPhone 相机/麦克风仍未执行。

### 2026-09-06 Apple 配置指南独立审校修正

独立审校确认 APNs 普通 topic 与 VoIP 派生 topic、Debug sandbox/Release production 和 PushKit/CallKit 方向正确，同时发现预设出口合规结论、自动/手工签名混用、上传 Key 与 provisioning 权限混淆、隐私政策缺失及外部 TestFlight 步骤不完整等风险。Apple 注册后，正式普通 topic 为 `com.tomzeng845.echat`，VoIP topic 为 `com.tomzeng845.echat.voip`。现已移除 `Info.plist` 中未经账号持有人审查的 `ITSAppUsesNonExemptEncryption=false`，静态检查改为要求该值保持未设置，直至完成 AES-GCM/RSA-OAEP、第三方 SDK、发布地区和 Apple 问卷审查。指南已把 Automatic 与 Manual 定义为互斥路线，明确现有脚本只支持 Automatic，拆分上传角色与 Developer Portal 权限，加入隐私政策硬门槛、生产数据盘点、外部 TestFlight Review 和 Organizer/Transporter 回退流程。TestFlight 脚本默认 build number 精度由分钟提升到秒，但文档仍要求使用单调递增 CI 编号或人工确认未占用。

## 2026-09-06 GitHub macOS 26 签名 IPA 工作流

新增 `.github/workflows/ios-ipa.yml`，仅允许 `workflow_dispatch` 手工触发，并绑定受保护的 `ios-production` environment。工作流使用 GitHub-hosted `macos-26`、Node.js 22、pnpm 10.4.1、Xcode 26 和项目现有 Capacitor SPM 工程；通过 Apple Distribution `.p12`、App Store Connect production provisioning profile 与 Manual signing 执行 archive/export。默认 build number 为字符串 `18` 加 GitHub workflow run number，避免低于当前 build 18；也允许显式传入未使用的 1–18 位数字。

工作流在签名前校验 Team ID、独立 App ID Prefix 后的精确 Bundle ID、production APNs、`get-task-allow=false`、无 `ProvisionedDevices`/`ProvisionsAllDevices`、UUID 与过期时间，从而拒绝 Development、Ad Hoc、Enterprise、过期或错误 Bundle 的 profile。导出后解包 IPA，执行 `codesign --verify`，再次验证内嵌 profile、Bundle ID、版本与 build，并生成可在 artifact 根目录直接验证的 SHA-256。签名秘密只在校验、证书导入和 archive 三个必要步骤可见；证书、profile、Keychain、Archive 和解包目录在 `always()` 清理步骤删除。三个 GitHub 官方 Action 固定到经核验的 v6/v7 commit SHA，artifact 保存 14 天且不自动上传 TestFlight。

本地验证使用 actionlint 1.7.12 与 ShellCheck 0.9.0，GitHub Actions YAML、表达式和内嵌 Bash 均无告警。`scripts/validate-apple-profile.py` 的合成测试确认：旧账号 App ID Prefix 不等于 Team ID 时仍接受正确 App Store profile，并拒绝 Ad Hoc、过期及错误 Bundle profile。`pnpm ios:validate`、`pnpm check`、Vitest 15 项和 xUnit 25 项通过。此处记录的是 workflow 首次实现时的状态；后续私有仓库、Secrets、macOS runner 和 IPA 已完成，结果见下文。

## 2026-09-06 Apple 资源实配与 iOS Bundle ID 迁移

Apple Developer Program 续订已生效，Team 为 `PPY8H6QWB5`。原计划的 `com.echat.app` 被 Apple 判定为不可注册；经用户确认后，已注册显式 App ID `com.tomzeng845.echat`，Description 为 `EChat iOS`，并启用 Push Notifications。Android 正式包名仍保持 `com.echat.app`，不因 iOS 标识迁移而改变。

已创建 Apple Distribution 证书 `Apple Distribution: zhihai zeng (PPY8H6QWB5)`；证书公钥与本次 CSR 私钥完全匹配，有效期至 2027-09-06。已生成密码保护的临时 PKCS#12，签名材料未进入项目或 Git。已创建 `EChat App Store 2026` App Store Connect production provisioning profile，UUID 为 `be3ef7da-d200-4d97-b5df-41cebabdca07`，`application-identifier` 为 `PPY8H6QWB5.com.tomzeng845.echat`，`aps-environment=production`，不含开发、Ad Hoc 或 Enterprise 标记，有效期至 2027-09-06。

Capacitor 配置现在通过 `ECHAT_CAPACITOR_APP_ID` 支持平台独立标识：`pnpm ios:sync` 固定生成 `com.tomzeng845.echat`，普通 `pnpm android:sync` 继续生成 `com.echat.app`。Xcode Debug/Release、TestFlight 脚本、GitHub workflow、APNs 测试、静态校验和发布文档已同步迁移。`pnpm ios:sync`、`pnpm ios:validate`、`pnpm android:sync`、TypeScript/.NET 编译、Vitest、xUnit 和生产构建均通过；同步后的两个原生 `capacitor.config.json` 分别包含正确平台标识。

私有仓库 `tomzeng845/echat` 已创建 `ios-production` Environment，限制为 `main`，并安全配置 Team、PKCS#12、密码和 production profile Secrets。检查点 `9d7a476600288dfcde481910fb24137ba6b80182` 已推送至 `main`。

## 2026-09-06 签名 IPA 实际构建结果

GitHub-hosted macOS 26 workflow run `34024319750`、attempt 1 在 2 分 6 秒内成功。证书/profile Secret 校验、依赖安装、Capacitor iOS sync、Swift Package resolve、Manual archive/export、codesign、内嵌 profile、Bundle ID、版本/build、artifact 上传、构建摘要和 `always()` 签名清理全部通过。构建时间为 `2026-09-06T09:21:32Z`，API 为 `https://echatapp-favrlscm.manus.space`。

首次仅构建 run 下载的 `EChat-iOS-0.9.0-181.ipa` 和当时保存的副本均通过 SHA-256 校验；该次文件大小为 6,957,995 bytes，SHA-256 为 `e99ffe0e7b4d658eb9cbc7ef83915cc161fa5dd1ac947b334573b7e2f3eb044d`。二次解包验证确认 Bundle ID `com.tomzeng845.echat`、版本 `0.9.0`、build `181`、最低 iOS `15.0`、Mach-O 主程序、`PrivacyInfo.xcprivacy`、三类提示音、`Assets.car` 和内嵌 profile 均存在；包内未发现 `.p8`、`.p12`、`.key` 或 `.pem`。后续上传 run 重新构建并替换最终交付副本，见本文末尾。

内嵌 profile 再次通过项目校验器：UUID `be3ef7da-d200-4d97-b5df-41cebabdca07`，application identifier `PPY8H6QWB5.com.tomzeng845.echat`，`aps-environment=production`，到期 `2027-09-06T08:27:52Z`。短期 GitHub PAT 与两次临时 Deploy Key 均已从 GitHub 撤销；本地 PAT、Distribution 私钥、CSR、PKCS#12、密码和三个 Base64 Secret 文本已删除。GitHub Environment Secrets 保留供后续可重复构建。

在首次仅构建 run 完成时，该 IPA 尚未上传 App Store Connect；此历史阶段的 TestFlight 上传、Apple 处理、出口合规回答和内部测试员分配已在后续章节完成。APNs production Key 和至少两台 iPhone 的消息/通话真机验收仍为待办。

## 2026-09-06 App Store Connect 记录与 TestFlight 上传门控

App Store Connect 已创建绑定 `com.tomzeng845.echat` 的 iOS 应用记录，商店名称为“E聊即时通讯”，Apple ID 为 `6809145695`，主语言为简体中文，SKU 为 `echat-ios-20260906`。原申请名称“E聊”被 Apple 判定已占用；IPA 内 `CFBundleDisplayName` 保持“E聊”，不改变设备桌面显示名。

`.github/workflows/ios-ipa.yml` 新增布尔输入 `upload_testflight`，默认 `false`。关闭时行为与成功的 run `34024319750` 一致，只生成并保存签名 IPA；开启时才要求 `APP_STORE_CONNECT_KEY_ID`、`APP_STORE_CONNECT_ISSUER_ID` 和 `APP_STORE_CONNECT_API_KEY_BASE64`，在独立上传步骤验证 `.p8` 后调用 `xcrun altool --validate-app` 与 `--upload-app`。上传秘密不暴露给依赖安装、编译、签名或 summary 步骤；临时 `AuthKey_*.p8` 无论成功失败都会在清理步骤删除。该阶段 workflow 已通过 Prettier、actionlint、ShellCheck 和 iOS 静态检查；上传 Key 创建和实际 TestFlight 上传随后由 run `34028293524` 完成。

## 2026-09-06 TestFlight 实际上传与内部测试开放

App Store Connect API 访问条款经账号持有人确认后提交并即时获批。创建了 Developer 角色 Team API Key `EChat TestFlight CI`，并将 Key ID、Issuer ID 和一次性 `.p8` 的 Base64 安全写入私有仓库 `ios-production` Environment Secrets。`.p8` 上传附件在写入后删除；本地未保留私钥正文。

GitHub-hosted macOS 26 / Xcode 26.6 workflow run `34028293524` 成功完成证书/profile 校验、Capacitor iOS sync、Swift package resolve、Manual archive/export、`codesign`、artifact 上传、`altool --validate-app` 和 `altool --upload-app`。GitHub 全部步骤均为成功；上传日志明确返回 `No errors uploading archive` 和 `UPLOAD SUCCEEDED with no errors`，Apple Delivery UUID 为 `f1b7e7d8-a6e1-4a56-8363-da16ba37cc18`。最初后台任务的非零退出发生在 workflow 成功之后，是本地 `gh run view` JSON 重定向为空造成的结果解析错误，不是 Xcode、签名或 Apple 上传失败。

重新通过 GitHub Actions REST API 下载并验证 artifact。最终 `releases/EChat-0.9.0-TestFlight.ipa` 大小为 6,957,997 bytes，SHA-256 为 `d2f53d9a4b72387b5c7500c3f7d157b6b1af39f3bbdeb902656e444d8c024542`。二次解包确认 Bundle ID `com.tomzeng845.echat`、版本 `0.9.0`、build `181`、设备显示名“E聊”、生产 API `https://echatapp-favrlscm.manus.space`、`PrivacyInfo.xcprivacy`、embedded provisioning profile 和三类提示音均存在。

App Store Connect 已处理 Build 181。账号持有人确认应用使用标准 AES-GCM/RSA-OAEP/SHA-256 加密作为 Apple 操作系统加密能力的补充或替代，并确认当前不在法国分发；Apple 接受答案并移除 Missing Export Compliance。随后创建自动分发的 `E聊内部测试` 组，Build 181 已加入，账号持有人状态为“已邀请”。

用于写入 GitHub Secrets 和监控本次上传的一天期 fine-grained token 已永久撤销，GitHub 显示无 fine-grained token；本地 token、Token 页面 HTML 和 `.p8` 附件均已删除。仍待完成：创建并部署 APNs production Key、在 iPhone 接受 TestFlight 邀请、至少两台真机完成普通推送与 PushKit/CallKit/音视频验收，以及正式发布前完成 App Privacy、隐私政策和需要时的外部 Beta App Review。

## 2026-09-06 APNs Production Key 验证结果

Apple Developer 已创建 Production Team Scoped APNs Key `35STBCJUCJ`，覆盖 E聊普通 alert topic `com.tomzeng845.echat` 与 VoIP topic `com.tomzeng845.echat.voip`。用户上传的 `AuthKey_35STBCJUCJ.p8` 未写入仓库；在隔离的本地 API 进程中以完整 PEM 注入后，新增 Vitest `server/apns-production-secret.test.ts` 通过，健康响应确认 `version=0.9.0`、`push.enabled=true`、`push.iosEnabled=true`，provider 为 Apple Push Notification service。

尝试通过 WebDev Secrets 更新正式 `APNS_PRIVATE_KEY` 时，当前服务仍收到无 PEM 头尾的自动生成/旧值，连续健康测试显示 `iosEnabled=false`；WebDev Secrets 的最新更新请求未能保存用户上传文件内容。正式 API 因此没有被误报为 APNs 已启用，也没有把私钥写入代码、GitHub 或日志。其余 `APNS_TEAM_ID`、`APNS_KEY_ID`、`APNS_BUNDLE_ID` 和 `APNS_USE_SANDBOX=false` 配置值已确认；剩余阻断是安全注入正确 p8 私钥后重启服务并再次通过该测试。

## 2026-09-06 APNs Key 更换完成

Apple Developer 页面确认旧 Key `35STBCJUCJ` 实际显示为 Sandbox，已按用户授权撤销。重新创建并下载 APNs Key `5FLA6SLK3N`（`EChat APNs Production 2026 v2`），将匹配的 p8 通过 WebDev Secrets 安全更新为 `APNS_PRIVATE_KEY`，同时更新 `APNS_KEY_ID`，随后重启服务。现正式 `/api/health` 返回 `version=0.9.0`、`push.enabled=true`、`push.iosEnabled=true`、provider 为 Apple Push Notification service；`server/apns-production-secret.test.ts` 通过。项目和日志中没有保存 p8 文件。

Apple Developer 列表当前只保留新 Key；页面仍显示其 APNs 环境标签为 Sandbox，因此后续真机 TestFlight 推送验收若出现 `BadDeviceToken`，应优先在 Apple Developer 重新核对 Key 的 Environment 选项与 TestFlight token 环境，不应把本次健康检查当作真实设备推送成功证明。


## 2026-09-07 iPhone 后台/锁屏来电排查（当前状态）

针对 TestFlight 用户反馈“APP 切到后台或锁屏后收不到语音/视频来电”，已完成代码静态审查、服务端 topic 修正和部署健康验证。正式服务的 `APNS_BUNDLE_ID` 已更新为 `com.tomzeng845.echat`，普通 topic 为 `com.tomzeng845.echat`，VoIP topic 为 `com.tomzeng845.echat.voip`；`APNS_USE_SANDBOX` 未启用，服务使用 production endpoint。重启后的 `/api/health` 返回 `version=0.9.0`、`push.enabled=true`、`iosEnabled=true`、provider 为 Apple Push Notification service；部署 Vitest 通过。

AppDelegate 已在启动时创建 `PKPushRegistry` 并声明 `.voIP`，VoIP push 收到后立即调用 `reportNewIncomingCall`；CallKit 接听、拒接、远端结束按 `callId` 清理。当前尚未完成 iPhone 真机重现，因此不能把健康检查当作来电投递成功证明。

Apple Developer 后续会话已过期，无法重新核对 Key `5FLA6SLK3N` 的环境标签；页面此前显示其环境仍需确认。下一步必须确认该 Key 为 Production，然后让 TestFlight 设备重新登录 E聊并上传新的 `ios-voip` token，再测试锁屏语音和视频来电。若仍失败，检查 `/api/push/status` 是否存在同一设备的 `ios` 与 `ios-voip` 记录，以及服务日志中的 APNs 状态码，但不得记录 token 或私钥。

当前结论：服务端 Bundle ID/topic 已修正、APNs 健康检查通过；真实锁屏来电仍待 Apple Key 环境确认和 iPhone 真机验收。
