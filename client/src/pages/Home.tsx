import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CallManager, {
  type CallManagerHandle,
} from "@/components/chat/CallManager";
import GroupInfoPanel from "@/components/chat/GroupInfoPanel";
import EmojiPicker from "@/components/chat/EmojiPicker";
import RichMessageContent from "@/components/chat/RichMessageContent";
import VoiceRecorderButton from "@/components/chat/VoiceRecorderButton";
import MomentsPanel from "@/components/MomentsPanel";
import P1ProfilePanel from "@/components/P1ProfilePanel";
import MyContactQrDialog from "@/components/qr/MyContactQrDialog";
import QrScanFlow from "@/components/qr/QrScanFlow";
import {
  api,
  ApiError,
  connectRealtime,
  getDeviceId,
  getSession,
  restoreSession,
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
import { resolveBuiltinAvatar } from "@/lib/builtin-avatars";
import { createUuid } from "@/lib/uuid";
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
  isNativeAndroid,
  notifyIncomingEvent,
  registerNativePush,
  uploadNativeRuntimeLog,
  unregisterNativePush,
  type NativeNotificationTarget,
} from "@/lib/mobile-native";
import type { HubConnection } from "@microsoft/signalr";
import {
  Ban,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Compass,
  CheckSquare,
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
  Quote,
  Search,
  QrCode,
  ScanLine,
  SendHorizontal,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

const LOGO = "/favicon.png";
const ICON = "/favicon.png";

type NavKey = "chats" | "contacts" | "discover" | "profile" | "admin";
type DecryptedMessage = Message & { plaintext: string; decryptError?: boolean };
type CallSummary = {
  callId: string;
  conversationId: string;
  mode: "audio" | "video";
  status: "calling" | "connected" | "cancelled" | "missed" | "completed";
  durationSeconds: number;
  at: string;
};

function initials(name: string) {
  return Array.from(name.trim()).slice(-2).join("").toUpperCase() || "E";
}

function formatCallDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  const imageUrl = useAuthenticatedImage(resolveBuiltinAvatar(src));
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
  const [inviteCode, setInviteCode] = useState("");
  const [agreement, setAgreement] = useState(false);
  const [pendingToken, setPendingToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          <div className="auth-card echat-auth-card rounded-[30px] border border-white/10 bg-white/[.07] p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-8">
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
                        autoComplete="off"
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
          </div>
        </div>
      </section>
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
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [quotedMessage, setQuotedMessage] = useState<DecryptedMessage | null>(
    null
  );
  const [messageAction, setMessageAction] = useState<
    { type: "menu" | "forward"; messageId?: string } | undefined
  >();
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [callSummaries, setCallSummaries] = useState<CallSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [typingPeerName, setTypingPeerName] = useState<string | null>(null);
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
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupMentionMembers, setGroupMentionMembers] = useState<
    ConversationMember[]
  >([]);
  const [groupAnnouncement, setGroupAnnouncement] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionMap, setMentionMap] = useState<
    Record<string, { userId: string; displayName: string }>
  >({});
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

  useEffect(() => {
    const handleCallSummary = (event: Event) => {
      const summary = (event as CustomEvent<CallSummary>).detail;
      if (!summary?.conversationId || !summary.callId) return;
      setCallSummaries(current =>
        [
          ...current.filter(item => item.callId !== summary.callId),
          summary,
        ].slice(-100)
      );
    };
    window.addEventListener("echat-call-summary", handleCallSummary);
    return () =>
      window.removeEventListener("echat-call-summary", handleCallSummary);
  }, []);

  const selected = conversations.find(item => item.id === selectedId) ?? null;
  const actionMessage = messageAction?.messageId
    ? messages.find(item => item.id === messageAction.messageId)
    : undefined;
  const selectionMode = selectedMessageIds.length > 0;
  const selectedContact =
    selected?.type === "Direct"
      ? (contacts.find(
          contact =>
            (contact.status === "Friend" || contact.status === "Blocked") &&
            contact.user.id === selected.peerId
        ) ?? null)
      : null;
  const blockedConversation =
    selected?.type === "Direct" && selectedContact?.status === "Blocked";
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
        if (event?.action === "cleared" && conversationId === selectedId)
          setMessages([]);
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
      onTyping: event => {
        if (
          event.conversationId !== selectedRef.current ||
          event.userId === user.id
        )
          return;
        setTypingPeerName(event.isTyping ? event.displayName : null);
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
  }, [
    handleIncomingMessage,
    identityReady,
    loadData,
    onProfileUpdated,
    user.id,
  ]);

  useEffect(() => {
    setTypingPeerName(null);
    if (!selectedId || selected?.type === "Group" || !draft.trim()) {
      if (selectedId && selected?.type === "Direct")
        connectionRef.current
          ?.invoke("SetTyping", selectedId, false)
          .catch(() => undefined);
      return;
    }
    connectionRef.current
      ?.invoke("SetTyping", selectedId, true)
      .catch(() => undefined);
    const timer = window.setTimeout(() => {
      connectionRef.current
        ?.invoke("SetTyping", selectedId, false)
        .catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draft, selected, selectedId]);

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

  useEffect(() => {
    setMentionMap({});
    setShowMentionList(false);
    if (!selectedId || selected?.type !== "Group") {
      setGroupMentionMembers([]);
      setGroupAnnouncement("");
      return;
    }
    api<{ members: ConversationMember[]; announcement: string }>(
      `/api/groups/${selectedId}`
    )
      .then(group => {
        setGroupMentionMembers(group.members);
        setGroupAnnouncement(group.announcement || "");
      })
      .catch(() => {
        setGroupMentionMembers([]);
        setGroupAnnouncement("");
      });
  }, [selectedId, selected?.type]);

  async function addFriend() {
    if (!addAccount.trim()) return;
    setBusy(true);
    try {
      await api("/api/contacts/requests", {
        method: "POST",
        body: JSON.stringify({
          requestId: createUuid(),
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

  function findContactForMember(member: ConversationMember) {
    return contacts.find(contact => contact.user.id === member.userId);
  }

  async function addFriendMember(member: ConversationMember) {
    try {
      await api("/api/contacts/requests", {
        method: "POST",
        body: JSON.stringify({
          requestId: createUuid(),
          peerAccount: member.account,
          note: "你好，我想添加你为好友",
          source: "group-member",
        }),
      });
      toast.success("好友申请已发送");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "发送好友申请失败");
    }
  }

  async function startVoiceCallWithMember(member: ConversationMember) {
    const contact = findContactForMember(member);
    if (!contact) return toast.error("该成员当前不是好友");
    setBusy(true);
    try {
      const existing = conversations.find(
        item => item.type === "Direct" && item.peerId === member.userId
      );
      const conversation =
        existing ??
        (await api<Conversation>("/api/conversations/direct", {
          method: "POST",
          body: JSON.stringify({ peerAccount: contact.user.account }),
        }));
      setShowGroupInfo(false);
      setSelectedId(conversation.id);
      setNav("chats");
      setMobileDetail(true);
      await loadData();
      await callManagerRef.current?.start(conversation, "audio");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "无法发起语音通话");
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

  function selectMention(member: ConversationMember) {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(draft);
    const start = match
      ? draft.length - match[0].length + (match[0].startsWith(" ") ? 1 : 0)
      : draft.length;
    setDraft(`${draft.slice(0, start)}@${member.displayName} `);
    setMentionMap(current => ({
      ...current,
      [member.userId]: {
        userId: member.userId,
        displayName: member.displayName,
      },
    }));
    setShowMentionList(false);
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !selectedId || !selected || busy || blockedConversation) {
      if (blockedConversation) toast.warning("该会话已被拉黑，无法发送消息");
      return;
    }
    setBusy(true);
    setDraft("");
    try {
      const created = await api<Message>(
        `/api/conversations/${selectedId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            clientMessageId: createUuid(),
            kind: "Text",
            keyVersion: 0,
            algorithm: "PLAINTEXT",
            content: text,
            ciphertext: "",
            nonce: "",
            replyToMessageId: quotedMessage?.id,
            metadata:
              selected.type === "Group" && Object.keys(mentionMap).length
                ? { mentions: JSON.stringify(Object.values(mentionMap)) }
                : undefined,
          }),
        }
      );
      const value = { ...created, plaintext: text };
      setMentionMap({});
      setQuotedMessage(null);
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
    if (!emoji || !selectedId || !selected || busy || blockedConversation) {
      if (blockedConversation) toast.warning("该会话已被拉黑，无法发送消息");
      return;
    }
    const conversationId = selectedId;
    setBusy(true);
    try {
      const created = await api<Message>(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            clientMessageId: createUuid(),
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
    if (!selectedId || !selected || busy || blockedConversation) {
      if (blockedConversation) toast.warning("该会话已被拉黑，无法发送消息");
      return;
    }
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

  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds(current =>
      current.includes(messageId)
        ? current.filter(id => id !== messageId)
        : [...current, messageId]
    );
    setMessageAction(undefined);
  }

  async function deleteMessages(ids: string[]) {
    if (!ids.length) return;
    try {
      await Promise.all(
        ids.map(id =>
          api(`/api/conversations/${selectedId}/messages/${id}/delete`, {
            method: "POST",
          })
        )
      );
      setMessages(current =>
        current.map(item =>
          ids.includes(item.id)
            ? { ...item, state: "Recalled", plaintext: "消息已删除" }
            : item
        )
      );
      setSelectedMessageIds([]);
      setMessageAction(undefined);
      toast.success(`已删除 ${ids.length} 条消息`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "删除失败");
    }
  }

  async function forwardSelectedMessages() {
    const messagesToForward = messages.filter(item =>
      selectedMessageIds.includes(item.id)
    );
    if (!forwardTargets.length || !messagesToForward.length) {
      toast.warning("请选择至少一个转发对象");
      return;
    }
    setBusy(true);
    try {
      for (const conversationId of forwardTargets) {
        for (const item of messagesToForward) {
          const content =
            item.kind === "Text" || item.kind === "Emoji"
              ? item.plaintext
              : `[${item.kind === "Video" ? "视频" : item.kind === "Image" ? "图片" : item.kind === "Voice" ? "语音" : "文件"}] ${item.plaintext || "媒体消息"}`;
          await api(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            body: JSON.stringify({
              clientMessageId: createUuid(),
              kind: "Text",
              keyVersion: 0,
              algorithm: "PLAINTEXT",
              content,
              ciphertext: "",
              nonce: "",
              metadata: {
                forwardedFromMessageId: item.id,
                forwardedFromConversationId: item.conversationId,
                forwardedKind: item.kind,
              },
            }),
          });
        }
      }
      setSelectedMessageIds([]);
      setForwardTargets([]);
      setMessageAction(undefined);
      toast.success(
        `已转发 ${messagesToForward.length} 条消息到 ${forwardTargets.length} 个会话`
      );
      await loadData();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "转发失败");
    } finally {
      setBusy(false);
    }
  }

  async function clearChatHistory() {
    if (!selected) return;
    if (
      !window.confirm(
        "清空后，当前会话中的聊天记录将对所有成员删除，且无法恢复。确定继续吗？"
      )
    )
      return;
    try {
      await api(`/api/conversations/${selected.id}/messages`, {
        method: "DELETE",
      });
      setMessages([]);
      setShowConversationMenu(false);
      await loadData();
      toast.success("聊天记录已清空");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "清空聊天记录失败");
    }
  }

  async function updateFriendRelation(
    peerId: string,
    action: "delete" | "block" | "unblock"
  ) {
    if (action === "block")
      await api<void>(`/api/contacts/${peerId}/block`, { method: "POST" });
    else if (action === "unblock")
      await api<void>(`/api/contacts/${peerId}/block`, { method: "DELETE" });
    else await api<void>(`/api/contacts/${peerId}`, { method: "DELETE" });
    setProfileUser(null);
    if (action === "delete" && selected?.peerId === peerId) {
      setSelectedId(null);
      setMobileDetail(false);
    }
    await loadData();
    toast.success(
      action === "block"
        ? "已将该好友拉黑，当前对话暂时禁止消息和通话"
        : action === "unblock"
          ? "已解除拉黑，好友关系已恢复"
          : "好友已删除"
    );
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
      <div className="echat-app-shell mx-auto flex h-full max-w-[1680px] bg-white shadow-2xl shadow-slate-300/30">
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
            src={resolveBuiltinAvatar(user.avatarUrl)}
            size="sm"
            online
          />
        </aside>

        <section
          className={`echat-sidebar ${nav === "discover" ? "hidden" : mobileDetail && nav === "chats" ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200/80 bg-[#f7f9fa] md:w-[340px]`}
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
                      src={resolveBuiltinAvatar(item.avatarUrl)}
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
                          src={resolveBuiltinAvatar(contact.user.avatarUrl)}
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
          className={`echat-chat-pane ${nav === "discover" ? "flex" : mobileDetail && nav === "chats" ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#f3f6f7]`}
        >
          {nav === "discover" ? (
            <MomentsPanel user={user} />
          ) : selected ? (
            <>
              <header className="echat-chat-header relative z-40 flex h-[76px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-6">
                <button
                  onClick={() => setMobileDetail(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 md:hidden"
                >
                  <ChevronLeft size={20} />
                </button>
                <Avatar
                  name={selected.name}
                  src={resolveBuiltinAvatar(selected.avatarUrl)}
                  size="sm"
                  online={selected.type === "Direct"}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">
                    {selected.name}
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-600">
                    <MessageCircleMore size={11} />
                    {typingPeerName
                      ? `${typingPeerName}正在输入…`
                      : selected.type === "Group"
                        ? `${selected.memberCount} 位成员`
                        : "在线"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <HeaderAction
                    icon={Phone}
                    label="语音通话"
                    onClick={() => {
                      if (blockedConversation)
                        return toast.warning(
                          "该会话已被拉黑，无法进行语音通话"
                        );
                      callManagerRef.current?.start(selected, "audio");
                    }}
                  />
                  <HeaderAction
                    icon={Video}
                    label="视频通话"
                    onClick={() => {
                      if (blockedConversation)
                        return toast.warning(
                          "该会话已被拉黑，无法进行视频通话"
                        );
                      callManagerRef.current?.start(selected, "video");
                    }}
                  />
                  <div className="relative">
                    <HeaderAction
                      icon={MoreHorizontal}
                      label="更多"
                      onClick={() => {
                        setShowConversationMenu(false);
                        if (selected.type === "Group") {
                          setShowGroupInfo(true);
                        } else if (selectedContact) {
                          setProfileUser(selectedContact.user);
                        } else {
                          toast.info("好友资料正在同步，请稍后重试");
                        }
                      }}
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
                            <CircleUserRound
                              size={16}
                              className="text-slate-400"
                            />
                            好友资料
                          </button>
                        )}
                        {selected.type === "Group" && (
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setShowConversationMenu(false);
                              setShowGroupInfo(true);
                            }}
                          >
                            <Users size={16} className="text-slate-400" />
                            群聊信息与群管理
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                          onClick={clearChatHistory}
                        >
                          <Trash2 size={16} />
                          清空聊天记录
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>
              {selected.type === "Group" && groupAnnouncement && (
                <div className="echat-announcement sticky top-0 z-10 flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm md:px-8">
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    群公告
                  </span>
                  <p className="min-w-0 flex-1 whitespace-pre-wrap">
                    {groupAnnouncement}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowGroupInfo(true)}
                    className="shrink-0 text-xs text-amber-700 underline"
                  >
                    查看
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
                <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end">
                  {messages.length ? (
                    <>
                      {messages.map(message => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          mine={message.senderId === user.id}
                          avatarName={
                            message.senderId === user.id
                              ? user.displayName
                              : selectedContact?.user.displayName ||
                                selected.name
                          }
                          avatarSrc={
                            message.senderId === user.id
                              ? user.avatarUrl
                              : selectedContact?.user.avatarUrl ||
                                selected.avatarUrl
                          }
                          onRecall={() => recall(message)}
                          selected={selectedMessageIds.includes(message.id)}
                          selectionMode={selectionMode}
                          quotedMessage={
                            message.replyToMessageId
                              ? messages.find(
                                  item => item.id === message.replyToMessageId
                                )
                              : undefined
                          }
                          onToggleSelect={() =>
                            toggleMessageSelection(message.id)
                          }
                          onAction={action => {
                            if (action === "select")
                              toggleMessageSelection(message.id);
                            else
                              setMessageAction({
                                type: "menu",
                                messageId: message.id,
                              });
                          }}
                        />
                      ))}
                      {callSummaries
                        .filter(item => item.conversationId === selectedId)
                        .map(summary => (
                          <CallSummaryBubble
                            key={summary.callId}
                            summary={summary}
                          />
                        ))}
                    </>
                  ) : callSummaries.some(
                      item => item.conversationId === selectedId
                    ) ? (
                    callSummaries
                      .filter(item => item.conversationId === selectedId)
                      .map(summary => (
                        <CallSummaryBubble
                          key={summary.callId}
                          summary={summary}
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
              <footer className="echat-composer shrink-0 border-t border-slate-200/80 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-5">
                <div className="relative mx-auto max-w-3xl rounded-2xl bg-slate-100 p-2 ring-1 ring-transparent focus-within:bg-white focus-within:ring-teal-300/70">
                  {quotedMessage && (
                    <div className="mb-2 flex items-start gap-2 rounded-xl border-l-4 border-teal-400 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                      <Quote
                        size={14}
                        className="mt-0.5 shrink-0 text-teal-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-teal-700">引用消息</p>
                        <p className="mt-0.5 truncate">
                          {quotedMessage.plaintext}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuotedMessage(null)}
                        className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
                      >
                        取消
                      </button>
                    </div>
                  )}
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
                      onChange={e => {
                        const next = e.target.value;
                        setDraft(next);
                        const match = /(?:^|\s)@([^\s@]*)$/.exec(next);
                        if (selected.type === "Group" && match) {
                          setMentionQuery(match[1].toLowerCase());
                          setShowMentionList(true);
                        } else {
                          setShowMentionList(false);
                        }
                      }}
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
                    {selected.type === "Group" && showMentionList && (
                      <div className="absolute bottom-16 left-3 right-3 z-30 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl md:left-auto md:right-5 md:w-72">
                        {groupMentionMembers
                          .filter(member =>
                            member.displayName
                              .toLowerCase()
                              .includes(mentionQuery)
                          )
                          .map(member => (
                            <button
                              key={member.userId}
                              type="button"
                              onClick={() => selectMention(member)}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-teal-50"
                            >
                              <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-100 text-xs font-semibold text-teal-700">
                                {member.displayName.slice(-2)}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {member.displayName}
                              </span>
                              {member.role === "Owner" && (
                                <span className="text-[10px] text-amber-600">
                                  群主
                                </span>
                              )}
                            </button>
                          ))}
                        {!groupMentionMembers.some(member =>
                          member.displayName
                            .toLowerCase()
                            .includes(mentionQuery)
                        ) && (
                          <p className="px-3 py-2 text-xs text-slate-400">
                            没有匹配的群成员
                          </p>
                        )}
                      </div>
                    )}
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

      {messageAction?.type === "menu" && actionMessage && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/25 p-4 md:items-center"
          onClick={() => setMessageAction(undefined)}
        >
          <div
            className="grid w-full max-w-md grid-cols-4 gap-2 rounded-3xl bg-slate-900 p-3 text-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedMessageIds([actionMessage.id]);
                setForwardTargets([]);
                setMessageAction({ type: "forward" });
              }}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs hover:bg-white/10"
            >
              <Share2 size={20} /> 转发
            </button>
            <button
              type="button"
              onClick={() => {
                setQuotedMessage(actionMessage);
                setMessageAction(undefined);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs hover:bg-white/10"
            >
              <Quote size={20} /> 引用
            </button>
            <button
              type="button"
              onClick={() => deleteMessages([actionMessage.id])}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs text-rose-300 hover:bg-white/10"
            >
              <Trash2 size={20} /> 删除
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedMessageIds([actionMessage.id]);
                setMessageAction(undefined);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs hover:bg-white/10"
            >
              <CheckSquare size={20} /> 多选
            </button>
          </div>
        </div>
      )}

      {selectedMessageIds.length > 0 && !messageAction && (
        <div className="fixed inset-x-0 bottom-0 z-[65] border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur md:bottom-4 md:left-1/2 md:max-w-2xl md:-translate-x-1/2 md:rounded-2xl md:border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">
              已选择 {selectedMessageIds.length} 条
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setForwardTargets([]);
                  setMessageAction({ type: "forward" });
                }}
                className="flex items-center gap-1 rounded-xl bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700"
              >
                <Share2 size={14} /> 转发
              </button>
              <button
                type="button"
                onClick={() => deleteMessages(selectedMessageIds)}
                className="flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600"
              >
                <Trash2 size={14} /> 删除
              </button>
              <button
                type="button"
                onClick={() => setSelectedMessageIds([])}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {messageAction?.type === "forward" && (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-teal-600">
                  Forward
                </p>
                <h2 className="mt-1 text-lg font-semibold">选择转发对象</h2>
              </div>
              <button
                type="button"
                onClick={() => setMessageAction(undefined)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500"
              >
                取消
              </button>
            </div>
            <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
              {conversations.map(conversation => {
                const checked = forwardTargets.includes(conversation.id);
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() =>
                      setForwardTargets(current =>
                        checked
                          ? current.filter(id => id !== conversation.id)
                          : [...current, conversation.id]
                      )
                    }
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ${checked ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-slate-50"}`}
                  >
                    <Avatar
                      name={conversation.name}
                      src={resolveBuiltinAvatar(conversation.avatarUrl)}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {conversation.name}
                    </span>
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full border ${checked ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300"}`}
                    >
                      {checked && <Check size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!forwardTargets.length || busy}
              onClick={forwardSelectedMessages}
              className="mt-4 w-full rounded-2xl bg-teal-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              转发 {selectedMessageIds.length} 条消息
            </button>
          </div>
        </div>
      )}

      <CallManager
        ref={callManagerRef}
        user={user}
        connection={realtimeConnection}
      />
      {profileUser && (
        <UserProfileDialog
          user={profileUser}
          messages={messages}
          onClear={clearChatHistory}
          blocked={selectedContact?.status === "Blocked"}
          onClose={() => setProfileUser(null)}
          onDelete={() => updateFriendRelation(profileUser.id, "delete")}
          onBlock={() => updateFriendRelation(profileUser.id, "block")}
          onUnblock={() => updateFriendRelation(profileUser.id, "unblock")}
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
      {showGroupInfo && selected?.type === "Group" && (
        <GroupInfoPanel
          conversationId={selected.id}
          messages={messages}
          onClose={() => setShowGroupInfo(false)}
          onChanged={() => {
            loadData();
            api<{ announcement: string }>(`/api/groups/${selected.id}`)
              .then(group => setGroupAnnouncement(group.announcement || ""))
              .catch(() => undefined);
          }}
          onClear={clearChatHistory}
          friendUserIds={contacts
            .filter(contact => contact.status === "Friend")
            .map(contact => contact.user.id)}
          onMessageMember={member => {
            const contact = findContactForMember(member);
            if (contact) {
              setShowGroupInfo(false);
              void startChat(contact);
            }
          }}
          onVoiceCallMember={member => void startVoiceCallWithMember(member)}
          onAddFriendMember={member => void addFriendMember(member)}
          onLeave={async () => {
            if (!window.confirm("确定退出该群聊吗？")) return;
            try {
              await api(`/api/groups/${selected.id}/leave`, { method: "POST" });
              setShowGroupInfo(false);
              setSelectedId(null);
              await loadData();
              toast.success("已退出群聊");
            } catch (cause) {
              toast.error(
                cause instanceof Error ? cause.message : "退出群聊失败"
              );
            }
          }}
        />
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
                        src={resolveBuiltinAvatar(contact.user.avatarUrl)}
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
  disabled = false,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Icon size={18} />
    </button>
  );
}
function MessageBubble({
  message,
  mine,
  avatarName,
  avatarSrc,
  onRecall,
  selected,
  selectionMode,
  quotedMessage,
  onToggleSelect,
  onAction,
}: {
  message: DecryptedMessage;
  mine: boolean;
  avatarName: string;
  avatarSrc?: string;
  onRecall: () => void;
  selected: boolean;
  selectionMode: boolean;
  quotedMessage?: DecryptedMessage;
  onToggleSelect: () => void;
  onAction: (action: "menu" | "select") => void;
}) {
  const holdTimer = useRef<number | undefined>(undefined);
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
      className={`group mb-4 flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
      onContextMenu={event => {
        event.preventDefault();
        if (!selectionMode) onAction("menu");
      }}
      onClick={() => {
        if (selectionMode) onToggleSelect();
      }}
      onPointerDown={() => {
        if (!selectionMode)
          holdTimer.current = window.setTimeout(() => onAction("menu"), 520);
      }}
      onPointerUp={() => {
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
      }}
      onPointerLeave={() => {
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
      }}
    >
      {!mine && <Avatar name={avatarName} src={avatarSrc} size="sm" />}
      <div
        className={`max-w-[82%] md:max-w-[68%] ${mine ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-[20px] shadow-sm ${selected ? "ring-2 ring-amber-400 ring-offset-2" : ""} ${emoji ? "bg-transparent px-1 py-0 text-[42px] leading-none shadow-none" : `text-sm leading-6 ${rich ? "p-1.5" : "px-4 py-3"} ${message.state === "Recalled" ? "bg-transparent text-xs text-slate-400 shadow-none" : mine ? "rounded-br-md bg-teal-500 text-white" : "rounded-bl-md bg-white text-slate-800"}`}`}
        >
          <RichMessageContent message={message} />
          {quotedMessage && (
            <div className="mt-2 border-t border-current/15 pt-2 text-[11px] opacity-80">
              <div className="mb-1 flex items-center gap-1 font-semibold">
                <Quote size={12} /> 引用消息
              </div>
              <p className="line-clamp-2 border-l-2 border-current/40 pl-2 whitespace-pre-wrap">
                {quotedMessage.plaintext}
              </p>
            </div>
          )}
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
                className="opacity-100 transition hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100"
              >
                撤回
              </button>
            </>
          )}
        </div>
        {selected && (
          <span className="mt-1 block text-right text-[10px] font-semibold text-amber-600">
            已选择
          </span>
        )}
      </div>
      {mine && <Avatar name={avatarName} src={avatarSrc} size="sm" />}
    </div>
  );
}

function CallSummaryBubble({ summary }: { summary: CallSummary }) {
  const mode = summary.mode === "video" ? "视频" : "语音";
  const duration = formatCallDuration(summary.durationSeconds);
  const label =
    summary.status === "calling"
      ? `正在发起${mode}通话`
      : summary.status === "connected"
        ? `${mode}通话已接通`
        : summary.status === "completed"
          ? `${mode}通话 · ${duration}`
          : summary.status === "missed"
            ? `未接听${mode}通话`
            : `已取消${mode}通话`;
  return (
    <div className="mb-4 flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-500">
        <Phone
          size={13}
          className={
            summary.status === "missed" ? "text-rose-500" : "text-teal-600"
          }
        />
        <span>{label}</span>
        <time className="text-[10px] text-slate-400">
          {new Date(summary.at).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
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
  messages,
  onClear,
  blocked = false,
  onClose,
  onDelete,
  onBlock,
  onUnblock,
}: {
  user: User;
  messages: Array<{ id: string; plaintext: string; sentAtUtc: string }>;
  onClear: () => Promise<void>;
  blocked?: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onBlock: () => Promise<void>;
  onUnblock: () => Promise<void>;
}) {
  const [confirmAction, setConfirmAction] = useState<
    "delete" | "block" | "unblock" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const avatarUrl = useAuthenticatedImage(user.avatarUrl);
  const searchResults = searchQuery.trim()
    ? messages.filter(item =>
        item.plaintext.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : [];

  async function confirm() {
    if (!confirmAction || busy) return;
    setBusy(true);
    try {
      await (confirmAction === "delete"
        ? onDelete()
        : confirmAction === "block"
          ? onBlock()
          : onUnblock());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="echat-drawer-shell fixed inset-0 z-50 flex h-dvh justify-end bg-slate-950/45 p-0 backdrop-blur-sm md:h-auto md:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="好友个人资料"
        onClick={() => !busy && onClose()}
      >
        <div
          className="echat-drawer-enter h-full min-h-0 w-full max-w-sm overflow-y-auto rounded-none bg-white shadow-2xl md:max-h-[calc(100dvh-3rem)] md:rounded-3xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
            <button
              type="button"
              aria-label="返回聊天"
              disabled={busy}
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-teal-700 disabled:opacity-40"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-base font-semibold text-slate-800">个人资料</h2>
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
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white text-left">
              <button
                type="button"
                onClick={() => setSearchOpen(value => !value)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Search size={16} className="text-slate-400" />
                <span className="flex-1">查找聊天内容</span>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
              {searchOpen && (
                <div className="border-t border-slate-100 p-3">
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="输入关键词"
                    className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm outline-none ring-teal-300 focus:ring-2"
                  />
                  {searchQuery.trim() && (
                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                      {searchResults.length ? (
                        searchResults.map(item => (
                          <p
                            key={item.id}
                            className="truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                          >
                            {item.plaintext}
                          </p>
                        ))
                      ) : (
                        <p className="px-2 py-2 text-xs text-slate-400">
                          没有找到相关聊天内容
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => void onClear()}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={16} />
                <span className="flex-1 text-left">清空聊天记录</span>
                <ChevronRight size={16} className="text-rose-200" />
              </button>
            </div>
            {confirmAction ? (
              <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-left ring-1 ring-rose-100">
                <p className="text-sm font-semibold text-rose-700">
                  {confirmAction === "delete"
                    ? "确认删除好友？"
                    : confirmAction === "block"
                      ? "确认拉黑该好友？"
                      : "确认解除拉黑？"}
                </p>
                <p className="mt-1 text-xs leading-5 text-rose-600/80">
                  {confirmAction === "delete"
                    ? "删除后双方将解除好友关系，原单聊不再显示。"
                    : confirmAction === "block"
                      ? "拉黑后双方保留好友关系，但该对话不能发送消息、语音通话或视频通话。"
                      : "解除后双方恢复好友关系，可继续发送消息和通话。"}
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
                  onClick={() =>
                    setConfirmAction(blocked ? "unblock" : "block")
                  }
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition active:scale-[.98] ${blocked ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-rose-50 text-rose-600 hover:bg-rose-100"}`}
                >
                  <Ban size={14} /> {blocked ? "解除拉黑" : "拉黑"}
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
            src={resolveBuiltinAvatar(user.avatarUrl)}
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
  const [sessionRestored, setSessionRestored] = useState(() =>
    Boolean(getSession())
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
    let active = true;
    void restoreSession().then(restored => {
      if (!active) return;
      if (restored?.accessToken && restored.user) setCurrentSession(restored);
      setSessionRestored(true);
    });
    const expire = () => {
      unregisterNativePush().catch(() => undefined);
      setCurrentSession(null);
    };
    window.addEventListener("echat-session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("echat-session-expired", expire);
    };
  }, []);
  if (!sessionRestored) return null;
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
