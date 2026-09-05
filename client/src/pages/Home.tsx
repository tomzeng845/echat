import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CallManager, { type CallManagerHandle } from "@/components/chat/CallManager";
import RichMessageContent from "@/components/chat/RichMessageContent";
import VoiceRecorderButton from "@/components/chat/VoiceRecorderButton";
import MomentsPanel from "@/components/MomentsPanel";
import P1ProfilePanel from "@/components/P1ProfilePanel";
import MyContactQrDialog from "@/components/qr/MyContactQrDialog";
import QrLoginPanel from "@/components/qr/QrLoginPanel";
import QrScanFlow from "@/components/qr/QrScanFlow";
import {
  api,
  ApiError,
  connectRealtime,
  getDeviceId,
  getSession,
  setSession,
  type AuthResponse,
  type Contact,
  type Conversation,
  type FriendRequest,
  type Message,
  type User,
} from "@/lib/echat-api";
import { sendEncryptedMedia, type ChatMediaKind } from "@/lib/echat-media";
import {
  createConversationKey,
  decryptMessage,
  encryptMessage,
  ensureIdentity,
  getConversationKey,
  openKeyEnvelope,
  sealKeyFor,
  storeConversationKey,
} from "@/lib/echat-crypto";
import type { HubConnection } from "@microsoft/signalr";
import {
  Bell,
  Check,
  ChevronLeft,
  CircleUserRound,
  Compass,
  FileText,
  Image,
  LockKeyhole,
  MessageCircleMore,
  Mic,
  MonitorSmartphone,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  QrCode,
  ScanLine,
  SendHorizontal,
  Settings,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

const LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cBQkYfNchSuunZhX.png";
const ICON = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/ZvaASvnoRtznilUT.png";

type NavKey = "chats" | "contacts" | "discover" | "profile" | "admin";
type DecryptedMessage = Message & { plaintext: string };

function initials(name: string) {
  return Array.from(name.trim()).slice(-2).join("").toUpperCase() || "E";
}

function Avatar({ name, src, size = "md", online = false }: { name: string; src?: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const dimensions = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  return (
    <div className="relative shrink-0">
      <div className={`${dimensions} grid place-items-center overflow-hidden rounded-[16px] bg-gradient-to-br from-teal-400 to-emerald-600 font-semibold text-white shadow-sm`}>
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
      </div>
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />}
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthResponse) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("ECHAT2026");
  const [agreement, setAgreement] = useState(false);
  const [pendingToken, setPendingToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showQrLogin, setShowQrLogin] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      let result: AuthResponse;
      if (pendingToken) {
        result = await api<AuthResponse>("/api/auth/totp", { method: "POST", body: JSON.stringify({ pendingToken, code: totpCode, deviceName: navigator.userAgent }) });
      } else if (mode === "register") {
        result = await api<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ account, password, inviteCode, displayName, agreementAccepted: agreement, deviceName: navigator.userAgent, deviceId: getDeviceId() }) });
      } else {
        result = await api<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ account, password, deviceName: navigator.userAgent, deviceId: getDeviceId() }) });
      }
      if (result.requiresTotp && result.pendingToken) { setPendingToken(result.pendingToken); return; }
      if (!result.accessToken || !result.user) throw new Error(result.error || "登录失败");
      setSession(result); onAuthenticated(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请求失败，请重试"); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#071424] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-20rem] h-[42rem] w-[42rem] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -right-44 bottom-[-22rem] h-[46rem] w-[46rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.4)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>
      <section className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-14 px-5 py-10 lg:grid-cols-[1.12fr_.88fr] lg:px-12">
        <div className="hidden lg:block">
          <div className="mb-16 flex items-center gap-3">
            <img src={LOGO} alt="E聊" className="h-11 w-11 object-contain" />
            <span className="text-2xl font-semibold tracking-tight">E聊</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-teal-200">端到端加密</span>
          </div>
          <p className="mb-5 text-sm font-medium tracking-[.22em] text-teal-300">PRIVATE · FAST · YOURS</p>
          <h1 className="max-w-2xl text-6xl font-semibold leading-[1.08] tracking-[-.045em]">让每一句话，<br /><span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">都只属于彼此。</span></h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-slate-300">为重要关系而设计的即时通信空间。消息在你的设备上加密，服务器只负责可靠送达密文。</p>
          <div className="mt-12 grid max-w-xl grid-cols-3 gap-4">
            {[
              [ShieldCheck, "AES-GCM", "消息级加密"],
              [MonitorSmartphone, "多端同步", "断线自动补拉"],
              [MessageCircleMore, "实时送达", "SignalR 长连接"],
            ].map(([Icon, title, desc]) => (
              <div key={String(title)} className="rounded-2xl border border-white/[.08] bg-white/[.045] p-4 backdrop-blur">
                <Icon className="mb-5 h-5 w-5 text-teal-300" />
                <div className="text-sm font-semibold">{String(title)}</div>
                <div className="mt-1 text-xs text-slate-400">{String(desc)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[440px]">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <img src={LOGO} alt="E聊" className="h-10 w-10 object-contain" /><span className="text-2xl font-semibold">E聊</span>
          </div>
          <div className="rounded-[30px] border border-white/10 bg-white/[.07] p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-8">
            <div className="mb-8">
              <div className="text-xs font-medium tracking-[.18em] text-teal-300">WELCOME TO E聊</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{pendingToken ? "安全验证" : mode === "login" ? "欢迎回来" : "创建你的账号"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{pendingToken ? "请输入 Google Authenticator 中的 6 位动态验证码。" : mode === "login" ? "登录后继续你的加密会话。" : "需要有效邀请码才能加入 E聊。"}</p>
            </div>
            {!pendingToken && (
              <div className="mb-7 grid grid-cols-2 rounded-xl bg-black/20 p-1">
                {(["login", "register"] as const).map((item) => <button key={item} type="button" onClick={() => { setMode(item); setError(""); }} className={`rounded-[10px] py-2.5 text-sm transition ${mode === item ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"}`}>{item === "login" ? "登录" : "注册"}</button>)}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              {pendingToken ? (
                <label className="block"><span className="mb-2 block text-sm text-slate-300">动态验证码</span><input autoFocus value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000 000" className="auth-input text-center text-2xl tracking-[.45em]" /></label>
              ) : (
                <>
                  <label className="block"><span className="mb-2 block text-sm text-slate-300">账号</span><input value={account} onChange={e => setAccount(e.target.value)} autoComplete="username" placeholder="4–20 位字母、数字或下划线" className="auth-input" /></label>
                  {mode === "register" && <label className="block"><span className="mb-2 block text-sm text-slate-300">昵称</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="朋友看到的名字" className="auth-input" /></label>}
                  <label className="block"><span className="mb-2 block text-sm text-slate-300">密码</span><input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 8 位" className="auth-input" /></label>
                  {mode === "register" && <label className="block"><span className="mb-2 block text-sm text-slate-300">邀请码</span><input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="输入邀请码" className="auth-input font-mono tracking-wider" /></label>}
                  {mode === "register" && <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-400"><input type="checkbox" checked={agreement} onChange={e => setAgreement(e.target.checked)} className="mt-1 accent-teal-400" /><span>我已阅读并同意《服务协议》和《隐私政策》，理解 E聊 将在本设备生成加密密钥。</span></label>}
                </>
              )}
              {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
              <button disabled={busy || (pendingToken ? totpCode.length !== 6 : !account || !password)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 py-3.5 font-semibold text-[#04201d] shadow-lg shadow-teal-500/15 transition hover:brightness-105 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900/20 border-t-slate-900" /> : pendingToken ? "验证并进入后台" : mode === "login" ? "进入 E聊" : "安全注册"}
              </button>
            </form>
            {mode === "login" && !pendingToken && <button type="button" onClick={() => setShowQrLogin(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.05] py-3 text-sm text-teal-200 transition hover:bg-white/10"><QrCode size={17} />使用二维码登录</button>}
            {mode === "register" && !pendingToken && <p className="mt-5 text-center text-xs text-slate-500">本地预览邀请码：<span className="font-mono text-slate-300">ECHAT2026</span></p>}
          </div>
          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-slate-500"><span>ASP.NET Core 8</span><span className="h-1 w-1 rounded-full bg-slate-700" /><span>SignalR</span><span className="h-1 w-1 rounded-full bg-slate-700" /><span>MongoDB Ready</span></div>
        </div>
      </section>
      {showQrLogin && <QrLoginPanel onAuthenticated={onAuthenticated} onClose={() => setShowQrLogin(false)} />}
    </main>
  );
}

function Messenger({ session, onLogout }: { session: AuthResponse; onLogout: () => void }) {
  const user = session.user!;
  const [nav, setNav] = useState<NavKey>("chats");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [addAccount, setAddAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [adminOverview, setAdminOverview] = useState<Record<string, unknown> | null>(null);
  const [showGroup, setShowGroup] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showMyQr, setShowMyQr] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [realtimeConnection, setRealtimeConnection] = useState<HubConnection | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);
  const callManagerRef = useRef<CallManagerHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const filteredConversations = conversations.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
  const pendingRequestCount = requests.filter(item => item.status === "Pending").length;

  const decrypt = useCallback(async (message: Message): Promise<DecryptedMessage> => {
    if (message.state === "Recalled") return { ...message, plaintext: "这条消息已被撤回" };
    try {
      const key = await getConversationKey(message.conversationId);
      if (!key) return { ...message, plaintext: "此设备暂时无法解密该消息" };
      return { ...message, plaintext: await decryptMessage(key, message.ciphertext, message.nonce) };
    } catch { return { ...message, plaintext: "消息解密失败" }; }
  }, []);

  const loadData = useCallback(async () => {
    const [nextConversations, nextContacts, nextRequests] = await Promise.all([
      api<Conversation[]>("/api/conversations"), api<Contact[]>("/api/contacts"), api<FriendRequest[]>("/api/contacts/requests"),
    ]);
    for (const conversation of nextConversations) {
      if (!await getConversationKey(conversation.id) && conversation.keyEnvelope) {
        try { await storeConversationKey(conversation.id, await openKeyEnvelope(user.account, conversation.keyEnvelope)); } catch { /* Key belongs to a different device identity. */ }
      }
    }
    setConversations(nextConversations); setContacts(nextContacts); setRequests(nextRequests);
    setSelectedId(current => current && nextConversations.some(x => x.id === current) ? current : nextConversations[0]?.id ?? null);
  }, [user.account]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const encrypted = await api<Message[]>(`/api/conversations/${conversationId}/messages?after=0&limit=100`);
    setMessages(await Promise.all(encrypted.map(decrypt)));
    const latestSequence = encrypted.at(-1)?.sequence;
    if (latestSequence) await api<void>(`/api/conversations/${conversationId}/read/${latestSequence}`, { method: "POST" });
  }, [decrypt]);

  useEffect(() => {
    (async () => {
      try {
        const identity = await ensureIdentity(user.account);
        await api<void>("/api/users/me/public-key", { method: "PUT", body: JSON.stringify({ publicKeyJwk: identity.publicJwk }) });
        await loadData();
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 404)) {
          setSession(null);
          window.dispatchEvent(new Event("echat-session-expired"));
          return;
        }
        toast.error(cause instanceof Error ? cause.message : "初始化失败");
      }
    })();
  }, [loadData, user.account]);

  useEffect(() => {
    const connection = connectRealtime({
      onMessage: async message => {
        if (message.conversationId === selectedRef.current) {
          const value = await decrypt(message);
          setMessages(current => current.some(x => x.id === value.id) ? current : [...current, value].sort((a, b) => a.sequence - b.sequence));
        }
        loadData().catch(() => undefined);
      },
      onMessageUpdate: async message => {
        if (message.conversationId === selectedRef.current) {
          const value = await decrypt(message);
          setMessages(current => current.map(item => item.id === value.id ? value : item));
        }
      },
      onConversation: () => loadData().catch(() => undefined),
      onContactRequest: request => {
        setRequests(current => current.some(item => item.id === request.id) ? current : [request, ...current]);
        toast.info(`${request.sender?.displayName || "有新用户"}请求添加你为好友`);
        loadData().catch(() => undefined);
      },
      onContactUpdate: event => {
        if (event.status === "Friend") toast.success(`${event.peer?.displayName || "好友"}已加入联系人`);
        loadData().catch(() => undefined);
      },
      onMoment: () => window.dispatchEvent(new Event("echat-moment-updated")),
    });
    let disposed = false;
    let retryTimer: number | undefined;
    const start = async () => {
      if (disposed || connection.state !== "Disconnected") return;
      try {
        await connection.start();
        if (!disposed) await loadData();
      } catch {
        if (!disposed) retryTimer = window.setTimeout(start, 3000);
      }
    };
    connectionRef.current = connection;
    setRealtimeConnection(connection);
    connection.onreconnected(() => loadData().catch(() => undefined));
    connection.onclose(() => { if (!disposed) retryTimer = window.setTimeout(start, 3000); });
    start().catch(() => undefined);
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      setRealtimeConnection(null);
      connection.stop();
    };
  }, [decrypt, loadData]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") loadData().catch(() => undefined); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [loadData]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    loadMessages(selectedId).catch(cause => toast.error(cause.message));
    connectionRef.current?.invoke("JoinConversation", selectedId).catch(() => undefined);
  }, [loadMessages, selectedId]);

  async function addFriend() {
    if (!addAccount.trim()) return;
    setBusy(true);
    try {
      await api("/api/contacts/requests", { method: "POST", body: JSON.stringify({ requestId: crypto.randomUUID(), peerAccount: addAccount.trim(), note: "你好，我想添加你为好友", source: "account" }) });
      toast.success("好友申请已发送"); setAddAccount("");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "发送失败"); }
    finally { setBusy(false); }
  }

  async function acceptRequest(id: string) {
    try { await api(`/api/contacts/requests/${id}/accept`, { method: "POST" }); toast.success("已添加好友"); await loadData(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "操作失败"); }
  }

  async function startChat(contact: Contact) {
    setBusy(true);
    try {
      const existing = conversations.find(item => item.type === "Direct" && item.name === contact.user.displayName);
      if (existing) { setSelectedId(existing.id); setNav("chats"); setMobileDetail(true); return; }
      const peer = await api<{ id: string; account: string; displayName: string; publicKeyJwk: string }>(`/api/users/${contact.user.account}/public-key`);
      const identity = await ensureIdentity(user.account);
      const key = await createConversationKey();
      const keyEnvelopes: Record<string, string> = {};
      keyEnvelopes[user.id] = await sealKeyFor(key, identity.publicJwk);
      keyEnvelopes[peer.id] = await sealKeyFor(key, peer.publicKeyJwk);
      const conversation = await api<Conversation>("/api/conversations/direct", { method: "POST", body: JSON.stringify({ peerAccount: peer.account, keyEnvelopes }) });
      await storeConversationKey(conversation.id, key);
      await loadData(); setSelectedId(conversation.id); setNav("chats"); setMobileDetail(true);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "无法创建加密会话"); }
    finally { setBusy(false); }
  }

  async function createGroup() {
    if (!groupName.trim() || groupMembers.length < 2) return toast.warning("请输入群名称并选择至少两位好友");
    setBusy(true);
    try {
      const selectedContacts = contacts.filter(contact => groupMembers.includes(contact.user.id));
      const identity = await ensureIdentity(user.account);
      const key = await createConversationKey();
      const keyEnvelopes: Record<string, string> = { [user.id]: await sealKeyFor(key, identity.publicJwk) };
      for (const contact of selectedContacts) {
        const peer = await api<{ id: string; publicKeyJwk: string }>(`/api/users/${contact.user.account}/public-key`);
        keyEnvelopes[peer.id] = await sealKeyFor(key, peer.publicKeyJwk);
      }
      const conversation = await api<Conversation>("/api/conversations/groups", { method: "POST", body: JSON.stringify({ name: groupName.trim(), memberAccounts: selectedContacts.map(contact => contact.user.account), keyEnvelopes }) });
      await storeConversationKey(conversation.id, key);
      setShowGroup(false); setGroupName(""); setGroupMembers([]);
      await loadData(); setSelectedId(conversation.id); setNav("chats"); setMobileDetail(true);
      toast.success("加密群聊已创建");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "创建群聊失败"); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    const text = draft.trim(); if (!text || !selectedId || busy) return;
    setBusy(true); setDraft("");
    try {
      const key = await getConversationKey(selectedId); if (!key) throw new Error("本设备缺少会话密钥");
      const encrypted = await encryptMessage(key, text);
      const created = await api<Message>(`/api/conversations/${selectedId}/messages`, { method: "POST", body: JSON.stringify({ clientMessageId: crypto.randomUUID(), kind: "Text", ...encrypted }) });
      const value = { ...created, plaintext: text };
      setMessages(current => current.some(x => x.id === value.id) ? current : [...current, value]);
      await api<void>(`/api/conversations/${selectedId}/read/${created.sequence}`, { method: "POST" });
      await loadData();
    } catch (cause) { setDraft(text); toast.error(cause instanceof Error ? cause.message : "发送失败"); }
    finally { setBusy(false); }
  }

  async function sendMedia(file: File | Blob, kind: ChatMediaKind, duration?: number) {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const created = await sendEncryptedMedia(selectedId, file, kind, {
        fileName: file instanceof File ? file.name : `语音-${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}.webm`,
        mimeType: file.type,
        duration,
      });
      const value = await decrypt(created);
      setMessages(current => current.some(x => x.id === value.id) ? current : [...current, value]);
      await api<void>(`/api/conversations/${selectedId}/read/${created.sequence}`, { method: "POST" });
      await loadData();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "媒体发送失败"); }
    finally { setBusy(false); }
  }

  function pickFile(file: File | undefined, preferred?: ChatMediaKind) {
    if (!file) return;
    const kind: ChatMediaKind = preferred ?? (file.type.startsWith("video/") ? "Video" : file.type.startsWith("image/") ? "Image" : "File");
    sendMedia(file, kind);
  }

  async function recall(message: DecryptedMessage) {
    try { await api(`/api/conversations/${message.conversationId}/messages/${message.id}/recall`, { method: "POST" }); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "撤回失败"); }
  }

  async function showAdmin() {
    setNav("admin");
    try { setAdminOverview(await api<Record<string, unknown>>("/api/admin/overview")); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "无法访问管理后台"); }
  }

  const navItems = useMemo(() => [
    { id: "chats" as const, label: "消息", icon: MessageCircleMore },
    { id: "contacts" as const, label: "联系人", icon: Users },
    { id: "discover" as const, label: "发现", icon: Compass },
    { id: "profile" as const, label: "我的", icon: CircleUserRound },
  ], []);

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#eef2f5] text-slate-900">
      <div className="mx-auto flex h-full max-w-[1680px] bg-white shadow-2xl shadow-slate-300/30">
        <aside className="hidden w-[76px] shrink-0 flex-col items-center bg-[#091827] py-5 text-slate-400 md:flex">
          <img src={LOGO} alt="E聊" className="mb-8 h-10 w-10 object-contain" />
          <div className="flex flex-1 flex-col gap-2">
            {navItems.map(item => <button key={item.id} onClick={() => { setNav(item.id); if (item.id !== "chats") setMobileDetail(false); }} className={`group relative grid h-12 w-12 place-items-center rounded-2xl transition active:scale-95 ${nav === item.id ? "bg-teal-400 text-[#06211e]" : "hover:bg-white/10 hover:text-white"}`} title={item.label}><item.icon size={21} />{item.id === "chats" && conversations.some(x => x.lastSequence > x.readSequence) && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-400" />}{item.id === "contacts" && pendingRequestCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-[#091827]">{Math.min(99, pendingRequestCount)}</span>}</button>)}
          </div>
          {user.role === "Admin" && <button onClick={showAdmin} className={`mb-3 grid h-12 w-12 place-items-center rounded-2xl transition ${nav === "admin" ? "bg-teal-400 text-[#06211e]" : "hover:bg-white/10 hover:text-white"}`} title="管理后台"><Settings size={20} /></button>}
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" online />
        </aside>

        <section className={`${nav === "discover" ? "hidden" : mobileDetail && nav === "chats" ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200/80 bg-[#f7f9fa] md:w-[340px]`}>
          <header className="px-5 pb-4 pt-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-medium tracking-[.16em] text-teal-600">E聊</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{nav === "chats" ? "消息" : nav === "contacts" ? "联系人" : nav === "discover" ? "发现" : nav === "admin" ? "管理" : "我的"}</h1></div><button onClick={() => nav === "contacts" ? document.getElementById("add-account")?.focus() : nav === "chats" ? setShowGroup(true) : toast.info("请先返回消息或联系人页面")} className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-teal-600 active:scale-95"><Plus size={19} /></button></div>
            {(nav === "chats" || nav === "contacts") && <div className="relative mt-5"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={nav === "chats" ? "搜索会话" : "搜索联系人"} className="w-full rounded-xl border-0 bg-slate-200/70 py-2.5 pl-9 pr-3 text-sm outline-none ring-teal-400/40 transition placeholder:text-slate-400 focus:ring-2" /></div>}
          </header>

          <div className="flex-1 overflow-y-auto px-3 pb-24 md:pb-4">
            {nav === "chats" && (filteredConversations.length ? filteredConversations.map(item => (
              <button key={item.id} onClick={() => { setSelectedId(item.id); setMobileDetail(true); }} className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selectedId === item.id ? "bg-white shadow-sm ring-1 ring-slate-200/60" : "hover:bg-white/70"}`}>
                <Avatar name={item.name} src={item.avatarUrl} online={item.type === "Direct"} />
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{item.name}</span><time className="shrink-0 text-[11px] text-slate-400">{item.lastMessageAtUtc ? new Date(item.lastMessageAtUtc).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}</time></div><div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-xs text-slate-500">{item.lastMessagePreview}</p>{item.lastSequence > item.readSequence && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-teal-500 px-1 text-[10px] font-semibold text-white">{Math.min(99, item.lastSequence - item.readSequence)}</span>}</div></div>
              </button>
            )) : <EmptyState icon={MessageCircleMore} title="还没有会话" text="添加好友后即可发起端到端加密聊天。" />)}

            {nav === "contacts" && <div className="space-y-5 px-1">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus size={17} className="text-teal-600" />添加好友</div><div className="flex gap-2"><input id="add-account" value={addAccount} onChange={e => setAddAccount(e.target.value)} onKeyDown={e => e.key === "Enter" && addFriend()} placeholder="输入 E聊账号" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm outline-none ring-teal-400/40 focus:ring-2" /><button disabled={busy} onClick={addFriend} className="rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50">发送</button></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setShowScanner(true)} className="flex items-center justify-center gap-2 rounded-xl bg-teal-50 py-2.5 text-xs font-medium text-teal-700"><ScanLine size={15} />扫一扫</button><button onClick={() => setShowMyQr(true)} className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-600"><QrCode size={15} />我的二维码</button></div></div>
              {pendingRequestCount > 0 && <div><p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">新的朋友 · {pendingRequestCount}</p>{requests.filter(x => x.status === "Pending").map(item => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-rose-100"><Avatar name={item.sender?.displayName || "新朋友"} src={item.sender?.avatarUrl} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.sender?.displayName || "好友申请"}</p><p className="truncate text-xs text-slate-500">{item.sender?.account ? `@${item.sender.account} · ` : ""}{item.note || "请求添加你为好友"}</p></div><button onClick={() => acceptRequest(item.id)} className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">接受</button></div>)}</div>}
              <div><p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">我的好友 · {contacts.filter(x => x.status === "Friend").length}</p>{contacts.filter(x => x.status === "Friend" && x.user.displayName.toLowerCase().includes(search.toLowerCase())).map(contact => <button key={contact.user.id} onClick={() => startChat(contact)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-white"><Avatar name={contact.user.displayName} src={contact.user.avatarUrl} size="sm" online /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{contact.remark || contact.user.displayName}</p><p className="truncate text-xs text-slate-500">@{contact.user.account}</p></div><span className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 md:hidden">发消息</span><MessageCircleMore size={17} className="hidden text-slate-300 md:block" /></button>)}</div>
              {!contacts.some(x => x.status === "Friend") && <EmptyState icon={Users} title="联系人还是空的" text="通过账号发送好友申请，对方接受后即可聊天。" compact />}
            </div>}

            {nav === "profile" && <P1ProfilePanel user={user} onLogout={onLogout} onScan={() => setShowScanner(true)} onMyQr={() => setShowMyQr(true)} />}
            {nav === "admin" && <AdminPanel overview={adminOverview} />}
          </div>
        </section>

        <section className={`${nav === "discover" ? "flex" : mobileDetail && nav === "chats" ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#f3f6f7]`}>
          {nav === "discover" ? <MomentsPanel user={user} /> : selected ? (
            <>
              <header className="flex h-[76px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-6"><button onClick={() => setMobileDetail(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 md:hidden"><ChevronLeft size={20} /></button><Avatar name={selected.name} src={selected.avatarUrl} size="sm" online={selected.type === "Direct"} /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{selected.name}</h2><p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-600"><LockKeyhole size={11} />端到端加密 · {selected.type === "Group" ? `${selected.memberCount} 位成员` : "在线"}</p></div><div className="flex gap-1"><HeaderAction icon={Phone} label="语音通话" onClick={() => callManagerRef.current?.start(selected, "audio")} /><HeaderAction icon={Video} label="视频通话" onClick={() => callManagerRef.current?.start(selected, "video")} /><HeaderAction icon={MoreHorizontal} label="更多" onClick={() => toast.info("会话设置即将开放")} /></div></header>
              <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end"><div className="mb-5 flex items-center justify-center"><span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] text-slate-500">消息已使用 AES-GCM-256 加密</span></div>{messages.length ? messages.map(message => <MessageBubble key={message.id} message={message} mine={message.senderId === user.id} onRecall={() => recall(message)} />) : <div className="my-auto text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-sm"><LockKeyhole className="text-teal-500" /></div><p className="mt-4 text-sm font-medium">加密会话已建立</p><p className="mt-1 text-xs text-slate-500">从一声问候开始吧</p></div>}</div></div>
              <footer className="shrink-0 border-t border-slate-200/80 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-5"><div className="mx-auto max-w-3xl rounded-2xl bg-slate-100 p-2 ring-1 ring-transparent focus-within:bg-white focus-within:ring-teal-300/70"><div className="flex items-center gap-1 px-1 pb-1"><ComposerAction icon={SmilePlus} label="表情" /><button type="button" onClick={() => fileInputRef.current?.click()} title="发送文件或视频" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-teal-600"><Paperclip size={17} /></button><button type="button" onClick={() => imageInputRef.current?.click()} title="发送图片" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-teal-600"><Image size={17} /></button><VoiceRecorderButton disabled={busy} onRecorded={(blob, duration) => sendMedia(blob, "Voice", duration)} /><input ref={imageInputRef} type="file" accept="image/*" hidden onChange={event => { pickFile(event.target.files?.[0], "Image"); event.currentTarget.value = ""; }} /><input ref={fileInputRef} type="file" accept="*/*" hidden onChange={event => { pickFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />{busy && <span className="ml-2 text-[10px] text-teal-600">正在加密上传…</span>}</div><div className="flex items-end gap-2"><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={1} placeholder="输入消息" className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-slate-400" /><button aria-label="发送消息" disabled={!draft.trim() || busy} onClick={sendMessage} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500 text-white shadow-md shadow-teal-500/20 transition hover:bg-teal-600 active:scale-95 disabled:bg-slate-300 disabled:shadow-none"><SendHorizontal size={18} /></button></div></div></footer>
            </>
          ) : <EmptyChat />}
        </section>
      </div>

      <CallManager ref={callManagerRef} user={user} connection={realtimeConnection} />
      {showScanner && <QrScanFlow onClose={() => setShowScanner(false)} onFriendRequested={() => { toast.success("好友申请已发送"); loadData(); }} />}
      {showMyQr && <MyContactQrDialog user={user} onClose={() => setShowMyQr(false)} />}

      {showGroup && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[.16em] text-teal-600">New encrypted group</p><h2 className="mt-2 text-xl font-semibold">创建加密群聊</h2></div><button onClick={() => setShowGroup(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"><X size={18} /></button></div><label className="mt-6 block text-sm font-medium">群名称<input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="例如：周末计划" className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none ring-teal-400/40 focus:ring-2" /></label><p className="mb-2 mt-5 text-sm font-medium">选择好友 <span className="text-xs font-normal text-slate-400">至少 2 人</span></p><div className="max-h-64 space-y-1 overflow-y-auto">{contacts.filter(contact => contact.status === "Friend").map(contact => { const checked = groupMembers.includes(contact.user.id); return <button key={contact.user.id} onClick={() => setGroupMembers(current => checked ? current.filter(id => id !== contact.user.id) : [...current, contact.user.id])} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${checked ? "bg-teal-50" : "hover:bg-slate-50"}`}><Avatar name={contact.user.displayName} src={contact.user.avatarUrl} size="sm" /><span className="flex-1 text-sm font-medium">{contact.user.displayName}</span><span className={`grid h-5 w-5 place-items-center rounded-md border ${checked ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300"}`}>{checked && <Check size={13} />}</span></button>; })}{contacts.filter(contact => contact.status === "Friend").length < 2 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">至少需要两位好友才能创建群聊。你可以先在联系人页添加更多好友。</p>}</div><button disabled={busy || !groupName.trim() || groupMembers.length < 2} onClick={createGroup} className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition active:scale-[.98] disabled:opacity-40">创建并分发群组密钥</button></div></div>}

      {!(mobileDetail && nav === "chats") && <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">{navItems.map(item => <button key={item.id} onClick={() => { setNav(item.id); setMobileDetail(false); }} className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] ${nav === item.id ? "text-teal-600" : "text-slate-400"}`}><item.icon size={21} />{item.id === "contacts" && pendingRequestCount > 0 && <span className="absolute left-1/2 top-1 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">{Math.min(99, pendingRequestCount)}</span>}<span>{item.label}</span></button>)}</nav>}
    </main>
  );
}

function HeaderAction({ icon: Icon, label, onClick }: { icon: typeof Phone; label: string; onClick: () => void }) {
  return <button onClick={onClick} title={label} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95"><Icon size={18} /></button>;
}
function ComposerAction({ icon: Icon, label }: { icon: typeof Phone; label: string }) {
  return <button onClick={() => toast.info(`${label}消息将在后续迭代开放`)} title={label} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-teal-600"><Icon size={17} /></button>;
}
function MessageBubble({ message, mine, onRecall }: { message: DecryptedMessage; mine: boolean; onRecall: () => void }) {
  const rich = message.kind === "Image" || message.kind === "Voice" || message.kind === "Video" || message.kind === "File";
  return <div className={`group mb-4 flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] md:max-w-[68%] ${mine ? "items-end" : "items-start"}`}><div className={`rounded-[20px] text-sm leading-6 shadow-sm ${rich ? "p-1.5" : "px-4 py-3"} ${message.state === "Recalled" ? "bg-transparent text-xs text-slate-400 shadow-none" : mine ? "rounded-br-md bg-teal-500 text-white" : "rounded-bl-md bg-white text-slate-800"}`}><RichMessageContent message={message} /></div><div className={`mt-1.5 flex items-center gap-2 px-1 text-[10px] text-slate-400 ${mine ? "justify-end" : "justify-start"}`}><time>{new Date(message.sentAtUtc).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>{mine && message.state === "Accepted" && <><Check size={11} /><button onClick={onRecall} className="opacity-0 transition hover:text-slate-700 group-hover:opacity-100">撤回</button></>}</div></div></div>;
}
function EmptyState({ icon: Icon, title, text, compact = false }: { icon: typeof Users; title: string; text: string; compact?: boolean }) {
  return <div className={`${compact ? "py-7" : "py-20"} px-7 text-center`}><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-slate-300 shadow-sm"><Icon size={24} /></div><p className="mt-4 text-sm font-semibold text-slate-600">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{text}</p></div>;
}
function EmptyChat() {
  return <div className="grid flex-1 place-items-center bg-[#f3f6f7]"><div className="text-center"><img src={ICON} alt="" className="mx-auto h-24 w-24 rounded-[28px] object-cover shadow-xl shadow-slate-300/60" /><h2 className="mt-6 text-xl font-semibold tracking-tight">选择一个会话</h2><p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">E聊在你的设备上加密消息内容，服务器只保存无法直接阅读的密文。</p><div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs text-emerald-600 shadow-sm"><ShieldCheck size={14} />隐私连接已就绪</div></div></div>;
}
function ProfilePanel({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <div className="space-y-4 px-1"><div className="rounded-3xl bg-[#0a1b2b] p-5 text-white shadow-lg"><div className="flex items-center gap-4"><Avatar name={user.displayName} src={user.avatarUrl} size="lg" online /><div className="min-w-0"><p className="truncate text-lg font-semibold">{user.displayName}</p><p className="mt-1 text-xs text-slate-400">E聊号：{user.account}</p></div></div><div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[.06] px-3 py-2 text-xs text-teal-200"><LockKeyhole size={14} />本设备密钥已安全保存</div></div>{[[Bell, "消息通知", "已开启"], [MonitorSmartphone, "登录设备", "当前浏览器"], [ShieldCheck, "隐私与安全", "端到端加密"], [FileText, "服务协议", "2026-09"]].map(([Icon, title, value]) => <button key={String(title)} onClick={() => toast.info(`${title}设置即将开放`)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/50"><Icon size={18} className="text-slate-400" /><span className="flex-1 text-sm font-medium">{String(title)}</span><span className="text-xs text-slate-400">{String(value)}</span></button>)}<button onClick={onLogout} className="w-full rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-medium text-rose-600">退出当前账号</button></div>;
}
function AdminPanel({ overview }: { overview: Record<string, unknown> | null }) {
  return <div className="space-y-4 px-1"><div className="rounded-3xl bg-[#0a1b2b] p-5 text-white"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-400 text-[#06211e]"><ShieldCheck size={21} /></div><div><p className="font-semibold">管理控制台</p><p className="mt-1 text-xs text-slate-400">TOTP 双因素认证已启用</p></div></div></div><div className="grid grid-cols-2 gap-3">{[["API 状态", overview ? "正常" : "加载中"], ["数据存储", String(overview?.storage ?? "—")], ["消息加密", "AES-GCM"], ["管理认证", "TOTP"]].map(([title, value]) => <div key={title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"><p className="text-[11px] text-slate-400">{title}</p><p className="mt-2 truncate text-sm font-semibold">{value}</p></div>)}</div><p className="px-2 text-xs leading-5 text-slate-400">用户治理、举报工单、群组管理与审计日志接口将在后续管理端迭代中接入。</p></div>;
}

export default function Home() {
  const [session, setCurrentSession] = useState<AuthResponse | null>(() => getSession());
  const onLogout = () => { setSession(null); setCurrentSession(null); };
  useEffect(() => {
    const expire = () => setCurrentSession(null);
    window.addEventListener("echat-session-expired", expire);
    return () => window.removeEventListener("echat-session-expired", expire);
  }, []);
  return session?.accessToken && session.user ? <Messenger session={session} onLogout={onLogout} /> : <AuthScreen onAuthenticated={setCurrentSession} />;
}
