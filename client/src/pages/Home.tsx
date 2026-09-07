import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CallManager, {
  type CallManagerHandle,
} from "@/components/chat/CallManager";
import EmojiPicker from "@/components/chat/EmojiPicker";
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
  type ConversationKeyEnvelope,
  type ConversationMember,
  type FriendRequest,
  type Message,
  type User,
} from "@/lib/echat-api";
import { sendChatMedia, type ChatMediaKind } from "@/lib/echat-media";
import { useAuthenticatedImage } from "@/hooks/useAuthenticatedImage";
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
import {
  consumePendingNotification,
  notifyIncomingEvent,
  registerNativePush,
  unregisterNativePush,
  type NativeNotificationTarget,
} from "@/lib/mobile-native";
import type { HubConnection } from "@microsoft/signalr";
import {
  Ban,
  Bell,
  Check,
  ChevronLeft,
  CircleUserRound,
  Compass,
  FileText,
  Image,
  Maximize2,
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
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

const LOGO =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cBQkYfNchSuunZhX.png";
const ICON =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/ZvaASvnoRtznilUT.png";

type NavKey = "chats" | "contacts" | "discover" | "profile" | "admin";
type DecryptedMessage = Message & { plaintext: string; decryptError?: boolean };

function initials(name: string) {
  return Array.from(name.trim()).slice(-2).join("").toUpperCase() || "E";
}

async function sealKeyForDevices(
  key: CryptoKey,
  userId: string,
  devices: Array<{ deviceId: string; publicKeyJwk: string }>,
  envelopes: Record<string, string>
) {
  const unique = new Map(devices.map(device => [device.deviceId, device]));
  for (const device of Array.from(unique.values())) {
    const envelopeKey = device.deviceId.startsWith("legacy")
      ? userId
      : `${userId}:${device.deviceId}`;
    envelopes[envelopeKey] = await sealKeyFor(key, device.publicKeyJwk);
  }
}

function Avatar({
  name,
  src,
  size = "md",
  online = false,
}: {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}) {
  const imageUrl = useAuthenticatedImage(src);
  const dimensions =
    size === "lg"
      ? "h-12 w-12 text-base"
      : size === "sm"
        ? "h-9 w-9 text-xs"
        : "h-11 w-11 text-sm";
  return (
    <div className="relative shrink-0">
      <div
        className={`${dimensions} grid place-items-center overflow-hidden rounded-[16px] bg-gradient-to-br from-teal-400 to-emerald-600 font-semibold text-white shadow-sm`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
      )}
    </div>
  );
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthResponse) => void;
}) {
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
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      let result: AuthResponse;
      if (pendingToken) {
        result = await api<AuthResponse>("/api/auth/totp", {
          method: "POST",
          body: JSON.stringify({
            pendingToken,
            code: totpCode,
            deviceName: navigator.userAgent,
          }),
        });
      } else if (mode === "register") {
        result = await api<AuthResponse>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            account,
            password,
            inviteCode,
            displayName,
            agreementAccepted: agreement,
            deviceName: navigator.userAgent,
            deviceId: getDeviceId(),
          }),
        });
      } else {
        result = await api<AuthResponse>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            account,
            password,
            deviceName: navigator.userAgent,
            deviceId: getDeviceId(),
          }),
        });
      }
      if (result.requiresTotp && result.pendingToken) {
        setPendingToken(result.pendingToken);
        return;
      }
      if (!result.accessToken || !result.user)
        throw new Error(result.error || "登录失败");
      setSession(result);
      onAuthenticated(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请求失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full bg-[#071424] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-20rem] h-[42rem] w-[42rem] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -right-44 bottom-[-22rem] h-[46rem] w-[46rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.4)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>
      <section className="relative mx-auto grid min-h-full max-w-7xl items-center gap-14 px-5 py-10 lg:grid-cols-[1.12fr_.88fr] lg:px-12">
        <div className="hidden lg:block">
          <div className="mb-16 flex items-center gap-3">
            <img src={LOGO} alt="E聊" className="h-11 w-11 object-contain" />
            <span className="text-2xl font-semibold tracking-tight">E聊</span>
          </div>
          <p className="mb-5 text-sm font-medium tracking-[.22em] text-teal-300">
            CONNECTED · FAST · YOURS
          </p>
          <h1 className="max-w-2xl text-6xl font-semibold leading-[1.08] tracking-[-.045em]">
            让每一句话，
            <br />
            <span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">
              都能及时抵达。
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-slate-300">
            为重要关系而设计的即时通信空间。消息实时同步，获得授权的运营后台可按需查看。
          </p>
          <div className="mt-12 grid max-w-xl grid-cols-3 gap-4">
            {[
              [ShieldCheck, "权限控制", "鉴权访问"],
              [MonitorSmartphone, "多端同步", "断线自动补拉"],
              [MessageCircleMore, "实时送达", "SignalR 长连接"],
            ].map(([Icon, title, desc]) => (
              <div
                key={String(title)}
                className="rounded-2xl border border-white/[.08] bg-white/[.045] p-4 backdrop-blur"
              >
                <Icon className="mb-5 h-5 w-5 text-teal-300" />
                <div className="text-sm font-semibold">{String(title)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {String(desc)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[440px]">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <img src={LOGO} alt="E聊" className="h-10 w-10 object-contain" />
            <span className="text-2xl font-semibold">E聊</span>
          </div>
          <div className="rounded-[30px] border border-white/10 bg-white/[.07] p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-8">
            <div className="mb-8">
              <div className="text-xs font-medium tracking-[.18em] text-teal-300">
                WELCOME TO E聊
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {pendingToken
                  ? "安全验证"
                  : mode === "login"
                    ? "欢迎回来"
                    : "创建你的账号"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {pendingToken
                  ? "请输入 Google Authenticator 中的 6 位动态验证码。"
                  : mode === "login"
                    ? "登录后继续你的实时会话。"
                    : "需要有效邀请码才能加入 E聊。"}
              </p>
            </div>
            {!pendingToken && (
              <div className="mb-7 grid grid-cols-2 rounded-xl bg-black/20 p-1">
                {(["login", "register"] as const).map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setError("");
                    }}
                    className={`rounded-[10px] py-2.5 text-sm transition ${mode === item ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    {item === "login" ? "登录" : "注册"}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              {pendingToken ? (
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">
                    动态验证码
                  </span>
                  <input
                    autoFocus
                    value={totpCode}
                    onChange={e =>
                      setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    placeholder="000 000"
                    className="auth-input text-center text-2xl tracking-[.45em]"
                  />
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-2 block text-sm text-slate-300">
                      账号
                    </span>
                    <input
                      value={account}
                      onChange={e => setAccount(e.target.value)}
                      autoComplete="username"
                      placeholder="4–20 位字母、数字或下划线"
                      className="auth-input"
                    />
                  </label>
                  {mode === "register" && (
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-300">
                        昵称
                      </span>
                      <input
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="朋友看到的名字"
                        className="auth-input"
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className="mb-2 block text-sm text-slate-300">
                      密码
                    </span>
                    <input
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      type="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder="至少 8 位"
                      className="auth-input"
                    />
                  </label>
                  {mode === "register" && (
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-300">
                        邀请码
                      </span>
                      <input
                        value={inviteCode}
                        onChange={e =>
                          setInviteCode(e.target.value.toUpperCase())
                        }
                        placeholder="输入邀请码"
                        className="auth-input font-mono tracking-wider"
                      />
                    </label>
                  )}
                  {mode === "register" && (
                    <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-400">
                      <input
                        type="checkbox"
                        checked={agreement}
                        onChange={e => setAgreement(e.target.checked)}
                        className="mt-1 accent-teal-400"
                      />
                      <span>
                        我已阅读并同意《服务协议》和《隐私政策》，理解 E聊
                        会在服务端保存新消息内容。
                      </span>
                    </label>
                  )}
                </>
              )}
              {error && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
              <button
                disabled={
                  busy ||
                  (pendingToken ? totpCode.length !== 6 : !account || !password)
                }
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 py-3.5 font-semibold text-[#04201d] shadow-lg shadow-teal-500/15 transition hover:brightness-105 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900/20 border-t-slate-900" />
                ) : pendingToken ? (
                  "验证并进入后台"
                ) : mode === "login" ? (
                  "进入 E聊"
                ) : (
                  "安全注册"
                )}
              </button>
            </form>
            {mode === "login" && !pendingToken && (
              <button
                type="button"
                onClick={() => setShowQrLogin(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.05] py-3 text-sm text-teal-200 transition hover:bg-white/10"
              >
                <QrCode size={17} />
                使用二维码登录
              </button>
            )}
            {mode === "login" && !pendingToken && (
              <a
                href="/admin"
                className="mt-4 block text-center text-xs text-slate-500 transition hover:text-teal-300"
              >
                进入管理后台
              </a>
            )}
            {mode === "register" && !pendingToken && (
              <p className="mt-5 text-center text-xs text-slate-500">
                本地预览邀请码：
                <span className="font-mono text-slate-300">ECHAT2026</span>
              </p>
            )}
          </div>
          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <span>ASP.NET Core 8</span>
            <span className="h-1 w-1 rounded-full bg-slate-700" />
            <span>SignalR</span>
            <span className="h-1 w-1 rounded-full bg-slate-700" />
            <span>MongoDB Ready</span>
          </div>
        </div>
      </section>
      {showQrLogin && (
        <QrLoginPanel
          onAuthenticated={onAuthenticated}
          onClose={() => setShowQrLogin(false)}
        />
      )}
    </main>
  );
}

function Messenger({
  session,
  onLogout,
  onProfileUpdated,
}: {
  session: AuthResponse;
  onLogout: () => void;
  onProfileUpdated: (user: User) => void;
}) {
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
  const [adminOverview, setAdminOverview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [showGroup, setShowGroup] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showMyQr, setShowMyQr] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [identityReady, setIdentityReady] = useState(false);
  const [realtimeConnection, setRealtimeConnection] =
    useState<HubConnection | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);
  const callManagerRef = useRef<CallManagerHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const readFloorRef = useRef(new Map<string, number>());
  const keySyncRef = useRef(new Map<string, Promise<number>>());
  const validatedKeyEnvelopesRef = useRef(new Set<string>());
  const handledMessageIdsRef = useRef(new Set<string>());
  const chatVisible =
    nav === "chats" &&
    (mobileDetail || window.matchMedia("(min-width: 768px)").matches);
  selectedRef.current = chatVisible ? selectedId : null;
  conversationsRef.current = conversations;

  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const selectedContact =
    selected?.type === "Direct"
      ? contacts.find(
          contact =>
            contact.status === "Friend" && contact.user.id === selected.peerId
        ) ?? null
      : null;
  const filteredConversations = conversations.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );
  const pendingRequestCount = requests.filter(
    item => item.status === "Pending"
  ).length;

  const resolveConversationKey = useCallback(
    async (conversationId: string, version: number, forceRefresh = false) => {
      if (!forceRefresh) {
        const stored = await getConversationKey(conversationId, version);
        if (stored) return stored;
      }
      try {
        const record = await api<ConversationKeyEnvelope>(
          `/api/conversations/${conversationId}/keys/${version}`
        );
        const imported = await openKeyEnvelope(
          user.account,
          record.keyEnvelope
        );
        await storeConversationKey(conversationId, imported, version);
        validatedKeyEnvelopesRef.current.add(
          `${conversationId}:${version}:${record.keyEnvelope}`
        );
        return imported;
      } catch {
        return undefined;
      }
    },
    [user.account]
  );

  const decrypt = useCallback(
    async (message: Message): Promise<DecryptedMessage> => {
      if (message.state === "Recalled")
        return { ...message, plaintext: "这条消息已被撤回" };
      if (message.algorithm === "PLAINTEXT")
        return { ...message, plaintext: message.content || "" };
      try {
        const version = message.keyVersion || 1;
        const key = await resolveConversationKey(
          message.conversationId,
          version
        );
        if (!key)
          return {
            ...message,
            plaintext: "该消息发送于本设备加入加密会话之前",
            decryptError: true,
          };
        try {
          return {
            ...message,
            plaintext: await decryptMessage(
              key,
              message.ciphertext,
              message.nonce
            ),
          };
        } catch {
          const refreshed = await resolveConversationKey(
            message.conversationId,
            version,
            true
          );
          if (!refreshed) throw new Error("MESSAGE_KEY_UNAVAILABLE");
          return {
            ...message,
            plaintext: await decryptMessage(
              refreshed,
              message.ciphertext,
              message.nonce
            ),
          };
        }
      } catch {
        return {
          ...message,
          plaintext: "该消息发送于本设备加入加密会话之前",
          decryptError: true,
        };
      }
    },
    [resolveConversationKey]
  );

  const ensureConversationKey = useCallback(
    async (conversation: Conversation) => {
      const version = conversation.keyVersion || 1;
      const stored = await getConversationKey(conversation.id, version);
      const validationId = `${conversation.id}:${version}:${conversation.keyEnvelope || ""}`;
      if (
        stored &&
        conversation.keyEnvelope &&
        validatedKeyEnvelopesRef.current.has(validationId)
      )
        return;
      const pending = keySyncRef.current.get(conversation.id);
      if (pending) {
        conversation.keyVersion = await pending;
        return;
      }
      const task = (async () => {
        if (conversation.keyEnvelope) {
          try {
            await storeConversationKey(
              conversation.id,
              await openKeyEnvelope(user.account, conversation.keyEnvelope),
              version
            );
            validatedKeyEnvelopesRef.current.add(validationId);
            return version;
          } catch {
            /* The envelope belongs to an older device identity. */
          }
        }
        const members = await api<ConversationMember[]>(
          `/api/conversations/${conversation.id}/members`
        );
        if (
          !members.length ||
          members.some(member => !member.encryptionDevices?.length)
        )
          return version;
        const key = await createConversationKey();
        const keyEnvelopes: Record<string, string> = {};
        for (const member of members)
          await sealKeyForDevices(
            key,
            member.userId,
            member.encryptionDevices,
            keyEnvelopes
          );
        const nextVersion = version + 1;
        try {
          await api<void>(`/api/conversations/${conversation.id}/key`, {
            method: "PUT",
            body: JSON.stringify({ keyVersion: nextVersion, keyEnvelopes }),
          });
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
          const latest = (await api<Conversation[]>("/api/conversations")).find(
            item => item.id === conversation.id
          );
          if (!latest?.keyEnvelope) throw cause;
          const latestVersion = latest.keyVersion || nextVersion;
          await storeConversationKey(
            conversation.id,
            await openKeyEnvelope(user.account, latest.keyEnvelope),
            latestVersion
          );
          validatedKeyEnvelopesRef.current.add(
            `${conversation.id}:${latestVersion}:${latest.keyEnvelope}`
          );
          conversation.keyVersion = latestVersion;
          conversation.keyEnvelope = latest.keyEnvelope;
          return latestVersion;
        }
        await storeConversationKey(conversation.id, key, nextVersion);
        conversation.keyVersion = nextVersion;
        conversation.keyEnvelope = keyEnvelopes[`${user.id}:${getDeviceId()}`];
        if (conversation.keyEnvelope)
          validatedKeyEnvelopesRef.current.add(
            `${conversation.id}:${nextVersion}:${conversation.keyEnvelope}`
          );
        return nextVersion;
      })();
      keySyncRef.current.set(conversation.id, task);
      try {
        await task;
      } finally {
        keySyncRef.current.delete(conversation.id);
      }
    },
    [user.account, user.id]
  );

  const loadData = useCallback(async () => {
    const [nextConversations, nextContacts, nextRequests] = await Promise.all([
      api<Conversation[]>("/api/conversations"),
      api<Contact[]>("/api/contacts"),
      api<FriendRequest[]>("/api/contacts/requests"),
    ]);
    for (const conversation of nextConversations)
      await ensureConversationKey(conversation);
    setConversations(
      nextConversations.map(next => {
        const pendingRead = readFloorRef.current.get(next.id) ?? 0;
        if (next.readSequence >= pendingRead)
          readFloorRef.current.delete(next.id);
        return pendingRead > next.readSequence
          ? { ...next, readSequence: pendingRead }
          : next;
      })
    );
    setContacts(nextContacts);
    setRequests(nextRequests);
    setSelectedId(current =>
      current && nextConversations.some(x => x.id === current)
        ? current
        : (nextConversations[0]?.id ?? null)
    );
  }, [ensureConversationKey]);

  const markConversationRead = useCallback(
    async (conversationId: string, sequence: number) => {
      if (sequence <= 0) return;
      const knownLastSequence =
        conversationsRef.current.find(item => item.id === conversationId)
          ?.lastSequence ?? sequence;
      const targetSequence = Math.min(sequence, knownLastSequence);
      readFloorRef.current.set(
        conversationId,
        Math.max(readFloorRef.current.get(conversationId) ?? 0, targetSequence)
      );
      setConversations(current =>
        current.map(item =>
          item.id === conversationId
            ? {
                ...item,
                readSequence: Math.max(
                  item.readSequence,
                  Math.min(sequence, item.lastSequence)
                ),
              }
            : item
        )
      );
      try {
        await api<void>(
          `/api/conversations/${conversationId}/read/${sequence}`,
          { method: "POST" }
        );
      } catch (cause) {
        readFloorRef.current.delete(conversationId);
        loadData().catch(() => undefined);
        throw cause;
      }
    },
    [loadData]
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const encrypted = await api<Message[]>(
        `/api/conversations/${conversationId}/messages?after=0&limit=100`
      );
      setMessages(await Promise.all(encrypted.map(decrypt)));
      if (encrypted.length)
        await markConversationRead(conversationId, Number.MAX_SAFE_INTEGER);
    },
    [decrypt, markConversationRead]
  );

  useEffect(() => {
    (async () => {
      try {
        const identity = await ensureIdentity(user.account);
        await api<void>("/api/users/me/public-key", {
          method: "PUT",
          body: JSON.stringify({
            publicKeyJwk: identity.publicJwk,
            deviceId: getDeviceId(),
          }),
        });
        setIdentityReady(true);
        await loadData();
      } catch (cause) {
        if (
          cause instanceof ApiError &&
          (cause.status === 401 || cause.status === 404)
        ) {
          setSession(null);
          window.dispatchEvent(new Event("echat-session-expired"));
          return;
        }
        toast.error(cause instanceof Error ? cause.message : "初始化失败");
      }
    })();
  }, [loadData, user.account]);

  useEffect(() => {
    registerNativePush().catch(() => undefined);
  }, [user.id]);

  useEffect(() => {
    if (!identityReady) return;
    const openTarget = async (target: NativeNotificationTarget | null) => {
      if (!target) return;
      await loadData().catch(() => undefined);
      if (target.type === "contact-request") {
        setNav("contacts");
        setMobileDetail(false);
      } else if (target.conversationId) {
        setNav("chats");
        setSelectedId(target.conversationId);
        setMobileDetail(true);
      }
    };
    const onOpen = (event: Event) =>
      openTarget((event as CustomEvent<NativeNotificationTarget>).detail);
    window.addEventListener("echat-open-notification", onOpen);
    openTarget(consumePendingNotification()).catch(() => undefined);
    return () => window.removeEventListener("echat-open-notification", onOpen);
  }, [identityReady, loadData]);

  const handleIncomingMessage = useCallback(
    async (message: Message) => {
      if (handledMessageIdsRef.current.has(message.id)) return;
      handledMessageIdsRef.current.add(message.id);
      if (handledMessageIdsRef.current.size > 500)
        handledMessageIdsRef.current.delete(
          handledMessageIdsRef.current.values().next().value as string
        );
      if (message.senderId !== user.id) {
        const conversation = conversationsRef.current.find(
          item => item.id === message.conversationId
        );
        const labels: Record<Message["kind"], string> = {
          Text: "新消息",
          Emoji: "表情消息",
          Image: "图片消息",
          Voice: "语音消息",
          Video: "视频消息",
          File: "文件消息",
          System: "系统消息",
        };
        notifyIncomingEvent({
          kind: "message",
          eventId: message.id,
          title: conversation?.name || "E聊新消息",
          body: `收到一条${labels[message.kind]}`,
          target: { type: "message", conversationId: message.conversationId },
        }).catch(() => undefined);
      }
      if (message.conversationId === selectedRef.current) {
        const value = await decrypt(message);
        setMessages(current =>
          current.some(x => x.id === value.id)
            ? current
            : [...current, value].sort((a, b) => a.sequence - b.sequence)
        );
        await markConversationRead(
          message.conversationId,
          message.sequence
        ).catch(() => undefined);
      }
      loadData().catch(() => undefined);
    },
    [decrypt, loadData, markConversationRead, user.id]
  );

  useEffect(() => {
    if (!identityReady) return;
    const connection = connectRealtime({
      onMessage: handleIncomingMessage,
      onMessageAvailable: handleIncomingMessage,
      onMessageUpdate: async message => {
        if (message.conversationId === selectedRef.current) {
          const value = await decrypt(message);
          setMessages(current =>
            current.map(item => (item.id === value.id ? value : item))
          );
        }
      },
      onConversation: event => {
        const conversationId = event?.conversationId;
        if (conversationId)
          connectionRef.current
            ?.invoke("JoinConversation", conversationId)
            .catch(() => undefined);
        loadData().catch(() => undefined);
      },
      onContactRequest: request => {
        setRequests(current =>
          current.some(item => item.id === request.id)
            ? current
            : [request, ...current]
        );
        toast.info(
          `${request.sender?.displayName || "有新用户"}请求添加你为好友`
        );
        loadData().catch(() => undefined);
      },
      onContactUpdate: event => {
        if (event.status === "Friend")
          toast.success(`${event.peer?.displayName || "好友"}已加入联系人`);
        loadData().catch(() => undefined);
      },
      onProfileUpdate: updated => {
        if (updated.id === user.id) onProfileUpdated(updated);
        setContacts(current =>
          current.map(contact =>
            contact.user.id === updated.id
              ? { ...contact, user: updated }
              : contact
          )
        );
        setConversations(current =>
          current.map(conversation =>
            conversation.peerId === updated.id
              ? {
                  ...conversation,
                  name: updated.displayName,
                  avatarUrl: updated.avatarUrl,
                }
              : conversation
          )
        );
        setProfileUser(current =>
          current?.id === updated.id ? updated : current
        );
      },
      onReceipt: receipt => {
        if (receipt.userId !== user.id) return;
        if (
          receipt.readSequence >=
          (readFloorRef.current.get(receipt.conversationId) ?? 0)
        )
          readFloorRef.current.delete(receipt.conversationId);
        setConversations(current =>
          current.map(item =>
            item.id === receipt.conversationId
              ? {
                  ...item,
                  readSequence: Math.max(
                    item.readSequence,
                    receipt.readSequence
                  ),
                }
              : item
          )
        );
      },
      onMoment: () => window.dispatchEvent(new Event("echat-moment-updated")),
      onAdminNotice: notice => toast.info(notice.content, { duration: 8000 }),
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
    connection.onclose(() => {
      if (!disposed) retryTimer = window.setTimeout(start, 3000);
    });
    start().catch(() => undefined);
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      setRealtimeConnection(null);
      connection.stop();
    };
  }, [handleIncomingMessage, identityReady, loadData, onProfileUpdated, user.id]);

  useEffect(() => {
    const refresh = () => {
      if (identityReady && document.visibilityState === "visible")
        loadData().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [identityReady, loadData]);

  useEffect(() => {
    if (!selectedId || !chatVisible) {
      if (!selectedId) setMessages([]);
      return;
    }
    loadMessages(selectedId).catch(cause => toast.error(cause.message));
    connectionRef.current
      ?.invoke("JoinConversation", selectedId)
      .catch(() => undefined);
  }, [chatVisible, loadMessages, selectedId]);

  async function addFriend() {
    if (!addAccount.trim()) return;
    setBusy(true);
    try {
      await api("/api/contacts/requests", {
        method: "POST",
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          peerAccount: addAccount.trim(),
          note: "你好，我想添加你为好友",
          source: "account",
        }),
      });
      toast.success("好友申请已发送");
      setAddAccount("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function acceptRequest(id: string) {
    try {
      await api(`/api/contacts/requests/${id}/accept`, { method: "POST" });
      toast.success("已添加好友");
      await loadData();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
    }
  }

  async function startChat(contact: Contact) {
    setBusy(true);
    try {
      const existing = conversations.find(
        item => item.type === "Direct" && item.name === contact.user.displayName
      );
      if (existing) {
        setSelectedId(existing.id);
        setNav("chats");
        setMobileDetail(true);
        return;
      }
      const conversation = await api<Conversation>(
        "/api/conversations/direct",
        {
          method: "POST",
          body: JSON.stringify({ peerAccount: contact.user.account }),
        }
      );
      await loadData();
      setSelectedId(conversation.id);
      setNav("chats");
      setMobileDetail(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "无法创建会话");
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!groupName.trim() || groupMembers.length < 2)
      return toast.warning("请输入群名称并选择至少两位好友");
    setBusy(true);
    try {
      const selectedContacts = contacts.filter(contact =>
        groupMembers.includes(contact.user.id)
      );
      const conversation = await api<Conversation>(
        "/api/conversations/groups",
        {
          method: "POST",
          body: JSON.stringify({
            name: groupName.trim(),
            memberAccounts: selectedContacts.map(
              contact => contact.user.account
            ),
          }),
        }
      );
      setShowGroup(false);
      setGroupName("");
      setGroupMembers([]);
      await loadData();
      setSelectedId(conversation.id);
      setNav("chats");
      setMobileDetail(true);
      toast.success("群聊已创建");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "创建群聊失败");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !selectedId || !selected || busy) return;
    setBusy(true);
    setDraft("");
    try {
      const created = await api<Message>(
        `/api/conversations/${selectedId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            clientMessageId: crypto.randomUUID(),
            kind: "Text",
            keyVersion: 0,
            algorithm: "PLAINTEXT",
            content: text,
            ciphertext: "",
            nonce: "",
          }),
        }
      );
      const value = { ...created, plaintext: text };
      setMessages(current =>
        current.some(x => x.id === value.id)
          ? current.map(item => (item.id === value.id ? value : item))
          : [...current, value]
      );
      await api<void>(
        `/api/conversations/${selectedId}/read/${created.sequence}`,
        { method: "POST" }
      );
      await loadData();
    } catch (cause) {
      setDraft(text);
      toast.error(cause instanceof Error ? cause.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmoji(emoji: string) {
    if (!emoji || !selectedId || !selected || busy) return;
    const conversationId = selectedId;
    setBusy(true);
    try {
      const created = await api<Message>(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            clientMessageId: crypto.randomUUID(),
            kind: "Emoji",
            keyVersion: 0,
            algorithm: "PLAINTEXT",
            content: emoji,
            ciphertext: "",
            nonce: "",
          }),
        }
      );
      const value = { ...created, plaintext: emoji };
      setMessages(current =>
        current.some(item => item.id === value.id)
          ? current.map(item => (item.id === value.id ? value : item))
          : [...current, value]
      );
      await api<void>(
        `/api/conversations/${conversationId}/read/${created.sequence}`,
        { method: "POST" }
      );
      await loadData();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "表情发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function sendMedia(
    file: File | Blob,
    kind: ChatMediaKind,
    duration?: number
  ) {
    if (!selectedId || !selected || busy) return;
    setBusy(true);
    try {
      const created = await sendChatMedia(selectedId, file, kind, {
        fileName:
          file instanceof File
            ? file.name
            : `语音-${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}.webm`,
        mimeType: file.type,
        duration,
      });
      const value = await decrypt(created);
      setMessages(current =>
        current.some(x => x.id === value.id)
          ? current.map(item => (item.id === value.id ? value : item))
          : [...current, value]
      );
      await api<void>(
        `/api/conversations/${selectedId}/read/${created.sequence}`,
        { method: "POST" }
      );
      await loadData();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "媒体发送失败");
    } finally {
      setBusy(false);
    }
  }

  function pickFile(file: File | undefined, preferred?: ChatMediaKind) {
    if (!file) return;
    const kind: ChatMediaKind =
      preferred ??
      (file.type.startsWith("video/")
        ? "Video"
        : file.type.startsWith("image/")
          ? "Image"
          : "File");
    sendMedia(file, kind);
  }

  async function recall(message: DecryptedMessage) {
    try {
      await api(
        `/api/conversations/${message.conversationId}/messages/${message.id}/recall`,
        { method: "POST" }
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "撤回失败");
    }
  }

  async function updateFriendRelation(peerId: string, action: "delete" | "block") {
    if (action === "block")
      await api<void>(`/api/contacts/${peerId}/block`, { method: "POST" });
    else await api<void>(`/api/contacts/${peerId}`, { method: "DELETE" });
    setProfileUser(null);
    if (selected?.peerId === peerId) {
      setSelectedId(null);
      setMobileDetail(false);
    }
    await loadData();
    toast.success(action === "block" ? "已将该好友拉黑" : "好友已删除");
  }

  async function showAdmin() {
    setNav("admin");
    try {
      setAdminOverview(
        await api<Record<string, unknown>>("/api/admin/overview")
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "无法访问管理后台");
    }
  }

  const navItems = useMemo(
    () => [
      { id: "chats" as const, label: "消息", icon: MessageCircleMore },
      { id: "contacts" as const, label: "联系人", icon: Users },
      { id: "discover" as const, label: "发现", icon: Compass },
      { id: "profile" as const, label: "我的", icon: CircleUserRound },
    ],
    []
  );

  return (
    <main className="h-full overflow-hidden bg-[#eef2f5] text-slate-900">
      <div className="mx-auto flex h-full max-w-[1680px] bg-white shadow-2xl shadow-slate-300/30">
        <aside className="hidden w-[76px] shrink-0 flex-col items-center bg-[#091827] py-5 text-slate-400 md:flex">
          <img src={LOGO} alt="E聊" className="mb-8 h-10 w-10 object-contain" />
          <div className="flex flex-1 flex-col gap-2">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setNav(item.id);
                  if (item.id !== "chats") setMobileDetail(false);
                }}
                className={`group relative grid h-12 w-12 place-items-center rounded-2xl transition active:scale-95 ${nav === item.id ? "bg-teal-400 text-[#06211e]" : "hover:bg-white/10 hover:text-white"}`}
                title={item.label}
              >
                <item.icon size={21} />
                {item.id === "chats" &&
                  conversations.some(x => x.lastSequence > x.readSequence) && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-400" />
                  )}
                {item.id === "contacts" && pendingRequestCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-[#091827]">
                    {Math.min(99, pendingRequestCount)}
                  </span>
                )}
              </button>
            ))}
          </div>
          {user.role === "Admin" && (
            <button
              onClick={showAdmin}
              className={`mb-3 grid h-12 w-12 place-items-center rounded-2xl transition ${nav === "admin" ? "bg-teal-400 text-[#06211e]" : "hover:bg-white/10 hover:text-white"}`}
              title="管理后台"
            >
              <Settings size={20} />
            </button>
          )}
          <Avatar
            name={user.displayName}
            src={user.avatarUrl}
            size="sm"
            online
          />
        </aside>

        <section
          className={`${nav === "discover" ? "hidden" : mobileDetail && nav === "chats" ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200/80 bg-[#f7f9fa] md:w-[340px]`}
        >
          <header className="px-5 pb-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium tracking-[.16em] text-teal-600">
                  E聊
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {nav === "chats"
                    ? "消息"
                    : nav === "contacts"
                      ? "联系人"
                      : nav === "discover"
                        ? "发现"
                        : nav === "admin"
                          ? "管理"
                          : "我的"}
                </h1>
              </div>
              <button
                onClick={() =>
                  nav === "contacts"
                    ? document.getElementById("add-account")?.focus()
                    : nav === "chats"
                      ? setShowGroup(true)
                      : toast.info("请先返回消息或联系人页面")
                }
                className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-teal-600 active:scale-95"
              >
                <Plus size={19} />
              </button>
            </div>
            {(nav === "chats" || nav === "contacts") && (
              <div className="relative mt-5">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={nav === "chats" ? "搜索会话" : "搜索联系人"}
                  className="w-full rounded-xl border-0 bg-slate-200/70 py-2.5 pl-9 pr-3 text-sm outline-none ring-teal-400/40 transition placeholder:text-slate-400 focus:ring-2"
                />
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-3 pb-24 md:pb-4">
            {nav === "chats" &&
              (filteredConversations.length ? (
                filteredConversations.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setConversations(current =>
                        current.map(value =>
                          value.id === item.id
                            ? { ...value, readSequence: value.lastSequence }
                            : value
                        )
                      );
                      markConversationRead(item.id, item.lastSequence).catch(
                        () => undefined
                      );
                      setSelectedId(item.id);
                      setMobileDetail(true);
                    }}
                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selectedId === item.id ? "bg-white shadow-sm ring-1 ring-slate-200/60" : "hover:bg-white/70"}`}
                  >
                    <Avatar
                      name={item.name}
                      src={item.avatarUrl}
                      online={item.type === "Direct"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {item.name}
                        </span>
                        <time className="shrink-0 text-[11px] text-slate-400">
                          {item.lastMessageAtUtc
                            ? new Date(
                                item.lastMessageAtUtc
                              ).toLocaleTimeString("zh-CN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </time>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-slate-500">
                          {item.lastMessagePreview}
                        </p>
                        {item.lastSequence > item.readSequence && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-teal-500 px-1 text-[10px] font-semibold text-white">
                            {Math.min(
                              99,
                              item.lastSequence - item.readSequence
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState
                  icon={MessageCircleMore}
                  title="还没有会话"
                  text="添加好友后即可发起实时聊天。"
                />
              ))}

            {nav === "contacts" && (
              <div className="space-y-5 px-1">
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <UserPlus size={17} className="text-teal-600" />
                    添加好友
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="add-account"
                      value={addAccount}
                      onChange={e => setAddAccount(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addFriend()}
                      placeholder="输入 E聊账号"
                      className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm outline-none ring-teal-400/40 focus:ring-2"
                    />
                    <button
                      disabled={busy}
                      onClick={addFriend}
                      className="rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
                    >
                      发送
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowScanner(true)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-teal-50 py-2.5 text-xs font-medium text-teal-700"
                    >
                      <ScanLine size={15} />
                      扫一扫
                    </button>
                    <button
                      onClick={() => setShowMyQr(true)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-600"
                    >
                      <QrCode size={15} />
                      我的二维码
                    </button>
                  </div>
                </div>
                {pendingRequestCount > 0 && (
                  <div>
                    <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      新的朋友 · {pendingRequestCount}
                    </p>
                    {requests
                      .filter(x => x.status === "Pending")
                      .map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-rose-100"
                        >
                          <Avatar
                            name={item.sender?.displayName || "新朋友"}
                            src={item.sender?.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.sender?.displayName || "好友申请"}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {item.sender?.account
                                ? `@${item.sender.account} · `
                                : ""}
                              {item.note || "请求添加你为好友"}
                            </p>
                          </div>
                          <button
                            onClick={() => acceptRequest(item.id)}
                            className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700"
                          >
                            接受
                          </button>
                        </div>
                      ))}
                  </div>
                )}
                <div>
                  <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    我的好友 ·{" "}
                    {contacts.filter(x => x.status === "Friend").length}
                  </p>
                  {contacts
                    .filter(
                      x =>
                        x.status === "Friend" &&
                        x.user.displayName
                          .toLowerCase()
                          .includes(search.toLowerCase())
                    )
                    .map(contact => (
                      <button
                        key={contact.user.id}
                        onClick={() => startChat(contact)}
                        className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-white"
                      >
                        <Avatar
                          name={contact.user.displayName}
                          src={contact.user.avatarUrl}
                          size="sm"
                          online
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {contact.remark || contact.user.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            @{contact.user.account}
                          </p>
                        </div>
                        <span className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 md:hidden">
                          发消息
                        </span>
                        <MessageCircleMore
                          size={17}
                          className="hidden text-slate-300 md:block"
                        />
                      </button>
                    ))}
                </div>
                {!contacts.some(x => x.status === "Friend") && (
                  <EmptyState
                    icon={Users}
                    title="联系人还是空的"
                    text="通过账号发送好友申请，对方接受后即可聊天。"
                    compact
                  />
                )}
              </div>
            )}

            {nav === "profile" && (
              <P1ProfilePanel
                user={user}
                onLogout={onLogout}
                onScan={() => setShowScanner(true)}
                onMyQr={() => setShowMyQr(true)}
                onProfileUpdated={onProfileUpdated}
              />
            )}
            {nav === "admin" && <AdminPanel overview={adminOverview} />}
          </div>
        </section>

        <section
          className={`${nav === "discover" ? "flex" : mobileDetail && nav === "chats" ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#f3f6f7]`}
        >
          {nav === "discover" ? (
            <MomentsPanel user={user} />
          ) : selected ? (
            <>
              <header className="flex h-[76px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-6">
                <button
                  onClick={() => setMobileDetail(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 md:hidden"
                >
                  <ChevronLeft size={20} />
                </button>
                <Avatar
                  name={selected.name}
                  src={selected.avatarUrl}
                  size="sm"
                  online={selected.type === "Direct"}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">
                    {selected.name}
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-600">
                    <MessageCircleMore size={11} />
                    {selected.type === "Group"
                      ? `${selected.memberCount} 位成员`
                      : "在线"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <HeaderAction
                    icon={Phone}
                    label="语音通话"
                    onClick={() =>
                      callManagerRef.current?.start(selected, "audio")
                    }
                  />
                  <HeaderAction
                    icon={Video}
                    label="视频通话"
                    onClick={() =>
                      callManagerRef.current?.start(selected, "video")
                    }
                  />
                  <div className="relative">
                    <HeaderAction
                      icon={MoreHorizontal}
                      label="更多"
                      onClick={() => setShowConversationMenu(value => !value)}
                    />
                    {showConversationMenu && (
                      <div className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200">
                        {selected.type === "Direct" && (
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setShowConversationMenu(false);
                              selectedContact
                                ? setProfileUser(selectedContact.user)
                                : toast.info("好友资料正在同步，请稍后重试");
                            }}
                          >
                            <CircleUserRound size={16} className="text-slate-400" />
                            好友资料
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-100"
                          onClick={() => {
                            setShowConversationMenu(false);
                            toast.info("会话设置即将开放");
                          }}
                        >
                          <Settings size={16} className="text-slate-400" />
                          会话设置
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
                <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end">
                  {messages.length ? (
                    messages.map(message => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        mine={message.senderId === user.id}
                        onRecall={() => recall(message)}
                      />
                    ))
                  ) : (
                    <div className="my-auto text-center">
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-sm">
                        <MessageCircleMore className="text-teal-500" />
                      </div>
                      <p className="mt-4 text-sm font-medium">会话已建立</p>
                      <p className="mt-1 text-xs text-slate-500">
                        从一声问候开始吧
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <footer className="shrink-0 border-t border-slate-200/80 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-5">
                <div className="mx-auto max-w-3xl rounded-2xl bg-slate-100 p-2 ring-1 ring-transparent focus-within:bg-white focus-within:ring-teal-300/70">
                  <div className="flex items-center gap-1 px-1 pb-1">
                    <EmojiPicker disabled={busy} onSelect={sendEmoji} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="发送文件或视频"
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-teal-600"
                    >
                      <Paperclip size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      title="发送图片"
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-teal-600"
                    >
                      <Image size={17} />
                    </button>
                    <VoiceRecorderButton
                      disabled={busy}
                      onRecorded={(blob, duration) =>
                        sendMedia(blob, "Voice", duration)
                      }
                    />
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={event => {
                        pickFile(event.target.files?.[0], "Image");
                        event.currentTarget.value = "";
                      }}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="*/*"
                      hidden
                      onChange={event => {
                        pickFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    {busy && (
                      <span className="ml-2 text-[10px] text-teal-600">
                        正在上传…
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      rows={1}
                      placeholder="输入消息"
                      className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-slate-400"
                    />
                    <button
                      aria-label="发送消息"
                      disabled={!draft.trim() || busy}
                      onClick={sendMessage}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500 text-white shadow-md shadow-teal-500/20 transition hover:bg-teal-600 active:scale-95 disabled:bg-slate-300 disabled:shadow-none"
                    >
                      <SendHorizontal size={18} />
                    </button>
                  </div>
                </div>
              </footer>
            </>
          ) : (
            <EmptyChat />
          )}
        </section>
      </div>

      <CallManager
        ref={callManagerRef}
        user={user}
        connection={realtimeConnection}
      />
      {profileUser && (
        <UserProfileDialog
          user={profileUser}
          onClose={() => setProfileUser(null)}
          onDelete={() => updateFriendRelation(profileUser.id, "delete")}
          onBlock={() => updateFriendRelation(profileUser.id, "block")}
        />
      )}
      {showScanner && (
        <QrScanFlow
          onClose={() => setShowScanner(false)}
          onFriendRequested={() => {
            toast.success("好友申请已发送");
            loadData();
          }}
        />
      )}
      {showMyQr && (
        <MyContactQrDialog user={user} onClose={() => setShowMyQr(false)} />
      )}

      {showGroup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[.16em] text-teal-600">
                  New group
                </p>
                <h2 className="mt-2 text-xl font-semibold">创建群聊</h2>
              </div>
              <button
                onClick={() => setShowGroup(false)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-6 block text-sm font-medium">
              群名称
              <input
                value={groupName}
                onChange={event => setGroupName(event.target.value)}
                placeholder="例如：周末计划"
                className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none ring-teal-400/40 focus:ring-2"
              />
            </label>
            <p className="mb-2 mt-5 text-sm font-medium">
              选择好友{" "}
              <span className="text-xs font-normal text-slate-400">
                至少 2 人
              </span>
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {contacts
                .filter(contact => contact.status === "Friend")
                .map(contact => {
                  const checked = groupMembers.includes(contact.user.id);
                  return (
                    <button
                      key={contact.user.id}
                      onClick={() =>
                        setGroupMembers(current =>
                          checked
                            ? current.filter(id => id !== contact.user.id)
                            : [...current, contact.user.id]
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${checked ? "bg-teal-50" : "hover:bg-slate-50"}`}
                    >
                      <Avatar
                        name={contact.user.displayName}
                        src={contact.user.avatarUrl}
                        size="sm"
                      />
                      <span className="flex-1 text-sm font-medium">
                        {contact.user.displayName}
                      </span>
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-md border ${checked ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300"}`}
                      >
                        {checked && <Check size={13} />}
                      </span>
                    </button>
                  );
                })}
              {contacts.filter(contact => contact.status === "Friend").length <
                2 && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                  至少需要两位好友才能创建群聊。你可以先在联系人页添加更多好友。
                </p>
              )}
            </div>
            <button
              disabled={busy || !groupName.trim() || groupMembers.length < 2}
              onClick={createGroup}
              className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition active:scale-[.98] disabled:opacity-40"
            >
              创建群聊
            </button>
          </div>
        </div>
      )}

      {!(mobileDetail && nav === "chats") && (
        <nav className="fixed bottom-0 left-[var(--echat-safe-left)] right-[var(--echat-safe-right)] z-20 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[var(--echat-safe-bottom)] backdrop-blur md:hidden">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setNav(item.id);
                setMobileDetail(false);
              }}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] ${nav === item.id ? "text-teal-600" : "text-slate-400"}`}
            >
              <item.icon size={21} />
              {item.id === "contacts" && pendingRequestCount > 0 && (
                <span className="absolute left-1/2 top-1 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {Math.min(99, pendingRequestCount)}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}

function HeaderAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95"
    >
      <Icon size={18} />
    </button>
  );
}
function MessageBubble({
  message,
  mine,
  onRecall,
}: {
  message: DecryptedMessage;
  mine: boolean;
  onRecall: () => void;
}) {
  const rich =
    message.kind === "Image" ||
    message.kind === "Voice" ||
    message.kind === "Video" ||
    message.kind === "File";
  const emoji = message.kind === "Emoji" && message.state === "Accepted";
  if (message.kind === "System")
    return (
      <div className="mb-5 flex justify-center">
        <span className="rounded-full bg-slate-200/70 px-3 py-1.5 text-[11px] text-slate-500">
          {message.plaintext}
        </span>
      </div>
    );
  return (
    <div
      className={`group mb-4 flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[82%] md:max-w-[68%] ${mine ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-[20px] shadow-sm ${emoji ? "bg-transparent px-1 py-0 text-[42px] leading-none shadow-none" : `text-sm leading-6 ${rich ? "p-1.5" : "px-4 py-3"} ${message.state === "Recalled" ? "bg-transparent text-xs text-slate-400 shadow-none" : mine ? "rounded-br-md bg-teal-500 text-white" : "rounded-bl-md bg-white text-slate-800"}`}`}
        >
          <RichMessageContent message={message} />
        </div>
        <div
          className={`mt-1.5 flex items-center gap-2 px-1 text-[10px] text-slate-400 ${mine ? "justify-end" : "justify-start"}`}
        >
          <time>
            {new Date(message.sentAtUtc).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {mine && message.state === "Accepted" && (
            <>
              <Check size={11} />
              <button
                onClick={onRecall}
                className="opacity-0 transition hover:text-slate-700 group-hover:opacity-100"
              >
                撤回
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  text,
  compact = false,
}: {
  icon: typeof Users;
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "py-7" : "py-20"} px-7 text-center`}>
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-slate-300 shadow-sm">
        <Icon size={24} />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-600">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{text}</p>
    </div>
  );
}
function UserProfileDialog({
  user,
  onClose,
  onDelete,
  onBlock,
}: {
  user: User;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onBlock: () => Promise<void>;
}) {
  const [confirmAction, setConfirmAction] = useState<"delete" | "block" | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const avatarUrl = useAuthenticatedImage(user.avatarUrl);

  async function confirm() {
    if (!confirmAction || busy) return;
    setBusy(true);
    try {
      await (confirmAction === "delete" ? onDelete() : onBlock());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="好友个人资料"
        onClick={() => !busy && onClose()}
      >
        <div
          className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-800">个人资料</h2>
            <button
              type="button"
              aria-label="关闭个人资料"
              disabled={busy}
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            >
              <X size={17} />
            </button>
          </div>
          <div className="px-6 py-7 text-center">
            <button
              type="button"
              onClick={() => avatarUrl && setAvatarExpanded(true)}
              className="group relative mx-auto block rounded-[22px]"
              title={user.avatarUrl ? "查看高清头像" : undefined}
            >
              <Avatar name={user.displayName} src={avatarUrl} size="lg" />
              {avatarUrl && (
                <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-white shadow-md transition group-hover:bg-teal-600">
                  <Maximize2 size={11} />
                </span>
              )}
            </button>
            <h3 className="mt-3 text-lg font-semibold text-slate-800">
              {user.displayName}
            </h3>
            <p className="mt-1 text-sm text-slate-500">@{user.account}</p>
            <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {user.signature || "这个人很安静，还没有填写个性签名"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-left text-xs">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-slate-400">地区</p>
                <p className="mt-1 truncate font-medium text-slate-700">
                  {user.region || "未设置"}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-slate-400">状态</p>
                <p className="mt-1 font-medium text-emerald-600">
                  {user.status === "Active" ? "正常" : user.status}
                </p>
              </div>
            </div>
            {confirmAction ? (
              <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-left ring-1 ring-rose-100">
                <p className="text-sm font-semibold text-rose-700">
                  {confirmAction === "delete" ? "确认删除好友？" : "确认拉黑该好友？"}
                </p>
                <p className="mt-1 text-xs leading-5 text-rose-600/80">
                  {confirmAction === "delete"
                    ? "删除后双方将解除好友关系，原单聊不再显示。"
                    : "拉黑后对方无法向你发送好友申请或单聊消息。"}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-xl bg-white py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={confirm}
                    className="flex-1 rounded-xl bg-rose-600 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "正在处理…" : "确认"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction("delete")}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 active:scale-[.98]"
                >
                  <Trash2 size={14} /> 删除好友
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("block")}
                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 py-2.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100 active:scale-[.98]"
                >
                  <Ban size={14} /> 拉黑
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {avatarExpanded && avatarUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="高清头像预览"
          onClick={() => setAvatarExpanded(false)}
        >
          <button
            type="button"
            aria-label="关闭头像预览"
            onClick={() => setAvatarExpanded(false)}
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <img
            src={avatarUrl}
            alt={`${user.displayName}的头像`}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={event => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
function EmptyChat() {
  return (
    <div className="grid flex-1 place-items-center bg-[#f3f6f7]">
      <div className="text-center">
        <img
          src={ICON}
          alt=""
          className="mx-auto h-24 w-24 rounded-[28px] object-cover shadow-xl shadow-slate-300/60"
        />
        <h2 className="mt-6 text-xl font-semibold tracking-tight">
          选择一个会话
        </h2>
        <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
          新消息可实时同步，并可由获得授权的运营后台查看。
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs text-emerald-600 shadow-sm">
          <ShieldCheck size={14} />
          会话连接已就绪
        </div>
      </div>
    </div>
  );
}
function ProfilePanel({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-4 px-1">
      <div className="rounded-3xl bg-[#0a1b2b] p-5 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <Avatar
            name={user.displayName}
            src={user.avatarUrl}
            size="lg"
            online
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.displayName}</p>
            <p className="mt-1 text-xs text-slate-400">E聊号：{user.account}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[.06] px-3 py-2 text-xs text-teal-200">
          <ShieldCheck size={14} />
          账号与传输连接已受保护
        </div>
      </div>
      {[
        [Bell, "消息通知", "已开启"],
        [MonitorSmartphone, "登录设备", "当前浏览器"],
        [ShieldCheck, "隐私与安全", "传输鉴权"],
        [FileText, "服务协议", "2026-09"],
      ].map(([Icon, title, value]) => (
        <button
          key={String(title)}
          onClick={() => toast.info(`${title}设置即将开放`)}
          className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/50"
        >
          <Icon size={18} className="text-slate-400" />
          <span className="flex-1 text-sm font-medium">{String(title)}</span>
          <span className="text-xs text-slate-400">{String(value)}</span>
        </button>
      ))}
      <button
        onClick={onLogout}
        className="w-full rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-medium text-rose-600"
      >
        退出当前账号
      </button>
    </div>
  );
}
function AdminPanel({
  overview,
}: {
  overview: Record<string, unknown> | null;
}) {
  return (
    <div className="space-y-4 px-1">
      <div className="rounded-3xl bg-[#0a1b2b] p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-400 text-[#06211e]">
            <ShieldCheck size={21} />
          </div>
          <div>
            <p className="font-semibold">管理控制台</p>
            <p className="mt-1 text-xs text-slate-400">TOTP 双因素认证已启用</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["API 状态", overview ? "正常" : "加载中"],
          ["数据存储", String(overview?.storage ?? "—")],
          ["消息存储", "明文"],
          ["管理认证", "TOTP"],
        ].map(([title, value]) => (
          <div
            key={title}
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"
          >
            <p className="text-[11px] text-slate-400">{title}</p>
            <p className="mt-2 truncate text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="px-2 text-xs leading-5 text-slate-400">
        用户治理、反馈工单、群组管理与审计日志已在独立后台管理页面对接。
      </p>
    </div>
  );
}

export default function Home() {
  const [session, setCurrentSession] = useState<AuthResponse | null>(() =>
    getSession()
  );
  const onLogout = () => {
    unregisterNativePush().catch(() => undefined);
    setSession(null);
    setCurrentSession(null);
  };
  const onProfileUpdated = useCallback((user: User) => {
    setCurrentSession(current => {
      if (!current) return current;
      const next = { ...current, user };
      setSession(next);
      return next;
    });
  }, []);
  useEffect(() => {
    const expire = () => {
      unregisterNativePush().catch(() => undefined);
      setCurrentSession(null);
    };
    window.addEventListener("echat-session-expired", expire);
    return () => window.removeEventListener("echat-session-expired", expire);
  }, []);
  return session?.accessToken && session.user ? (
    <Messenger
      session={session}
      onLogout={onLogout}
      onProfileUpdated={onProfileUpdated}
    />
  ) : (
    <AuthScreen onAuthenticated={setCurrentSession} />
  );
}
