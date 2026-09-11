import { ArrowLeft, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "一、适用范围",
    body: "本隐私政策适用于 E聊即时通讯（以下简称“E聊”）的网页端、iOS、Android、HarmonyOS 兼容客户端及 Windows 客户端。E聊由服务运营方提供即时消息、好友关系、音视频通话、推送通知和相关账户服务。",
  },
  {
    title: "二、我们收集的信息",
    body: "为提供和保护服务，我们可能收集以下信息：账户信息（账号、昵称、头像、个性签名及可选手机号）；社交与通信信息（好友关系、会话成员、消息及用户主动发送的图片、视频、语音和文件）；设备与标识信息（设备标识、推送 token、客户端版本、操作系统和网络信息）；服务与诊断信息（登录时间、连接状态、通话质量、崩溃和运行诊断日志）；粗略地区信息（根据登录 IP 推断的国家、地区或城市级别信息）。我们不会将消息内容用于跨应用跟踪或广告画像。",
  },
  {
    title: "三、信息使用目的",
    body: "我们使用上述信息来创建和维护账户、传递消息和推送通知、建立一对一及群组中的一对一音视频通话、显示好友和会话状态、提供安全验证与反滥用保护、诊断连接和音视频质量问题、响应用户反馈，以及履行法律义务。音视频通话使用 WebRTC 建立媒体连接；在直连不可用时，媒体可能经配置的 TURN 中继服务器传输。",
  },
  {
    title: "四、信息共享与第三方服务",
    body: "我们仅在提供服务所必需的范围内处理信息。消息、账户和通话信令由 E聊服务端处理；iOS 推送可能通过 Apple Push Notification service（APNs）传递，Android 推送可能通过系统推送服务传递；网络地区识别可能使用 IP 地区服务；音视频连接可能使用 TURN 中继服务。我们不会出售个人信息，也不会将个人信息用于跨应用跟踪。除非获得授权、为完成服务、保护安全，或法律要求，我们不会向无关第三方披露个人信息。",
  },
  {
    title: "五、保存与删除",
    body: "我们会在提供服务所需期间保存账户、好友、会话和消息数据，并根据安全、争议处理及法律要求确定合理保存期限。你可以通过应用内功能删除好友、撤回或清空会话内容，或联系运营方申请删除账户及相关个人信息；法律要求保留或确有必要用于安全与争议处理的信息除外。删除请求完成后，备份和日志中的残留信息会在合理期限内清理。",
  },
  {
    title: "六、信息安全",
    body: "我们采用访问控制、传输加密、认证令牌保护、推送 token 管理和运行诊断权限控制等措施保护信息。互联网传输和终端设备均存在固有风险，请妥善保管账户凭据，不要在聊天中发送不必要的敏感信息。",
  },
  {
    title: "七、你的权利",
    body: "在适用法律允许的范围内，你可以请求访问、更正、删除或导出与你有关的信息，也可以撤回非必要权限或停止使用服务。为保护账户安全，我们可能要求进行身份验证。请通过下方联系方式提交请求。",
  },
  {
    title: "八、未成年人",
    body: "E聊不面向不具备相应法律行为能力的儿童提供独立注册服务。若监护人发现未成年人未经同意提供了个人信息，请联系我们，我们会在核实后采取删除或限制处理措施。",
  },
  {
    title: "九、政策更新与联系我们",
    body: "我们可能根据服务、法律或安全要求更新本政策。重大变更会通过应用或网站提示。隐私相关问题、数据请求或删除请求请联系：tom88cloud@gmail.com。",
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-[#071421] px-5 py-10 text-slate-100 sm:px-8">
      <article className="mx-auto max-w-4xl rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-teal-950/30 backdrop-blur sm:p-10">
        <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-teal-300 transition hover:text-teal-200">
          <ArrowLeft size={16} /> 返回 E聊
        </a>
        <header className="border-b border-white/10 pb-8">
          <div className="mb-4 flex items-center gap-3 text-teal-300">
            <ShieldCheck size={28} />
            <span className="text-xs font-semibold tracking-[0.24em]">ECHAT · PRIVACY</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">E聊即时通讯隐私政策</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">最后更新：2026 年 9 月 11 日</p>
          <p className="mt-5 leading-7 text-slate-300">我们重视你的隐私。本政策说明 E聊收集、使用、保存和保护信息的方式，以及你可以如何管理自己的信息。</p>
        </header>
        <div className="divide-y divide-white/10">
          {sections.map(section => (
            <section key={section.title} className="py-7 first:pt-8">
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-300">{section.body}</p>
            </section>
          ))}
        </div>
        <footer className="border-t border-white/10 pt-7 text-sm leading-6 text-slate-400">
          本页面为 E聊服务的公开隐私政策。若本政策与适用法律存在冲突，以适用法律为准。
        </footer>
      </article>
    </main>
  );
}
