import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Ban,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock3,
  Coins,
  ContactRound,
  Download,
  FileClock,
  FileWarning,
  Gauge,
  Globe2,
  Gift,
  History,
  Home,
  Image,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MessageCircleMore,
  MessagesSquare,
  MoreHorizontal,
  PackageSearch,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  TicketCheck,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  authorizedFetch,
  getDeviceId,
  getSession,
  setSession,
  type AuthResponse,
} from "@/lib/echat-api";
import AuthenticatedMedia from "@/components/AuthenticatedMedia";
import { useAuthenticatedImage } from "@/hooks/useAuthenticatedImage";
import { apiUrl } from "@/lib/runtime-config";
import {
  AnnouncementPanel as DocAnnouncementPanel,
  ConversationSearchPanel as DocConversationSearchPanel,
  ErrorLogsPanel as DocErrorLogsPanel,
  FailureIpPanel as DocFailureIpPanel,
  FeedbackPanel as DocFeedbackPanel,
  FundAdjustmentsPanel as DocFundAdjustmentsPanel,
  FundSubjectsPanel as DocFundSubjectsPanel,
  GenericManagedPanel as DocGenericManagedPanel,
  ServiceGroupTemplatesPanel,
  GroupInvitesPanel as DocGroupInvitesPanel,
  LockedIpPanel as DocLockedIpPanel,
  BannedUsersPanel as DocBannedUsersPanel,
  AccountLockedUsersPanel as DocAccountLockedUsersPanel,
  SmsRecordsPanel as DocSmsRecordsPanel,
  ForbiddenWordsPanel as DocForbiddenWordsPanel,
  CurfewPanel as DocCurfewPanel,
  InviteManagementPanel as DocInviteManagementPanel,
  LogsPanel as DocLogsPanel,
  OperatorsPanel as DocOperatorsPanel,
  TransactionDetailsPanel as DocTransactionDetailsPanel,
  VerificationDialog,
} from "@/components/admin/RequirementPanels";

const LOGO =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cBQkYfNchSuunZhX.png";
type IconType = typeof Home;
type UserStatus = "Active" | "Restricted" | "Disabled" | "PendingDeletion";
type UserOperationKind =
  | "sameIp"
  | "inviteSource"
  | "displayName"
  | "loginIpRestriction"
  | "forceOffline"
  | "ban"
  | "sendMessage"
  | "accountLocked"
  | "loginLocked"
  | "bankCardLocked"
  | "cancellationEnabled"
  | "redFlagged"
  | "password";
type PageId =
  | "home"
  | "platform-tenants"
  | "platform-domains"
  | "platform-apps"
  | "platform-accounts"
  | "platform-roles"
  | "account-users"
  | "account-login"
  | "account-offline"
  | "account-failures"
  | "account-locked-ips"
  | "account-banned-users"
  | "account-locked-users"
  | "account-sms-records"
  | "account-forbidden-words"
  | "account-curfew"
  | "account-feedback"
  | "account-invites"
  | "fund-subjects"
  | "fund-adjust"
  | "fund-transactions"
  | "system-operators"
  | "system-admin-login"
  | "system-roles"
  | "system-announcements"
  | "system-images"
  | "system-audit"
  | "system-errors"
  | "chat-conversations"
  | "chat-customer"
  | "chat-groups"
  | "chat-service-groups"
  | "chat-bulk"
  | "chat-robots"
  | "chat-redpacket"
  | "chat-group-invites";

type Overview = {
  version: string;
  storage: string;
  metrics: {
    users: number;
    activeUsers: number;
    restrictedUsers: number;
    disabledUsers: number;
    activeSessions: number;
    conversations: number;
    messages: number;
    pendingReports: number;
  };
  security: {
    totpConfigured: boolean;
    developmentPasswordLogin: boolean;
    geoIp: { enabled: boolean; provider: string; cachedEntries: number };
  };
};
type AdminUser = {
  id: string;
  tenantId?: string;
  account: string;
  displayName: string;
  avatarUrl: string;
  gender: string;
  communicationId: string;
  role: string;
  status: UserStatus;
  canAddFriend: boolean;
  canCreateGroup: boolean;
  createdAtUtc: string;
  lastSeenAtUtc: string;
  activeSessions: number;
  mobilePhone: string;
  riskLevel1: number;
  riskLevel2: number;
  accountBalance: number;
  frozenBalance: number;
  online: boolean;
  accountLocked: boolean;
  loginLocked: boolean;
  bankCardLocked: boolean;
  cancellationEnabled: boolean;
  realNameVerified: boolean;
  enterpriseVerified: boolean;
  redFlagged: boolean;
  registrationSource: string;
  inviteSource: string;
  loginIpRestriction: string;
  lastLoginAtUtc?: string;
  loginPasswordChangedAtUtc?: string;
  lockoutUntilUtc?: string;
  failedLoginAttempts: number;
  lastLoginAddress: string;
  lastLoginIp: string;
  lastOnlineIp: string;
  lastNodeIp: string;
  lastOfflineAtUtc?: string;
  loginIpAllowList: string;
};
const adminUserColumns = [
  ["id", "用户ID"], ["risk1", "风险1"], ["risk2", "风险2"], ["account", "用户账号"], ["displayName", "昵称"], ["mobilePhone", "手机号码"],
  ["online", "在线状态"], ["accountLocked", "账号锁定"], ["loginLocked", "登录锁定"], ["bankCardLocked", "银行卡锁定"],
  ["cancellationEnabled", "注销状态"], ["realName", "实名认证"], ["enterprise", "企业认证"], ["todayOnline", "今日上线"], ["redFlagged", "红号"], ["role", "角色"],
  ["registrationSource", "注册来源"], ["inviteSource", "邀请码来源"], ["createdAt", "注册时间"], ["passwordChanged", "登录密码修改时间"], ["lastSeen", "最后上线时间"], ["lastLoginAddress", "最后登录地址"],
  ["lastOnlineIp", "最后在线IP"], ["lastNodeIp", "最后节点IP"], ["failedLogin", "登录失败次数"], ["activeSessions", "设备数"], ["loginIpRestriction", "登录IP限制"], ["status", "账户状态"],
  ["avatar", "头像"], ["gender", "性别"], ["communicationId", "通讯号"], ["lastLoginIp", "最后登录IP"], ["lastOfflineAt", "最后离线时间"], ["balance", "账户余额"], ["frozenBalance", "冻结金额"],
] as const;
type AdminUserColumnKey = (typeof adminUserColumns)[number][0];
const defaultHiddenAdminUserColumnKeys = new Set<AdminUserColumnKey>([
  "risk1",
  "risk2",
  "balance",
  "bankCardLocked",
  "redFlagged",
]);
type AdminUserPage = {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type TenantOption = { id: string; name: string; code: string; enabled: boolean; defaultAdminAccount?: string };

function AdminUserAvatar({ user }: { user: AdminUser }) {
  const source = useAuthenticatedImage(user.avatarUrl);
  const [failed, setFailed] = useState(false);
  const label = (user.displayName || user.account || "用户").slice(0, 2);

  if (!source || failed) {
    return (
      <span
        className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-[10px] text-slate-600"
        title={user.avatarUrl ? "头像加载失败" : "未设置头像"}
      >
        {label}
      </span>
    );
  }

  return (
    <img
      src={source}
      alt={`${user.displayName || user.account}的头像`}
      className="h-8 w-8 rounded-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
type AdminUserDetail = {
  user: AdminUser;
  friends: Array<{ peerUserId: string; remark: string; user: { id: string; account: string; displayName: string; avatarUrl: string; mobilePhone: string } | null }>;
  blacklist: Array<{ peerUserId: string; remark: string; user: { id: string; account: string; displayName: string; avatarUrl: string } | null }>;
  groups: Array<{ id: string; name: string; avatarUrl: string; memberCount: number; createdAtUtc: string; isDissolved: boolean }>;
};
type ModuleRecord = {
  id: string;
  module: string;
  name: string;
  status: string;
  data: Record<string, string>;
  createdAtUtc: string;
  updatedAtUtc: string;
};
type Audit = {
  id: string;
  adminAccount: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  ipAddress: string;
  address: string;
  createdAtUtc: string;
};
type Conversation = {
  id: string;
  tenantId?: string;
  type: "Direct" | "Group" | "System";
  name: string;
  createdBy: string;
  memberCount: number;
  lastSequence: number;
  lastMessageAtUtc?: string;
  isDissolved: boolean;
};
type AdminConversationMessage = {
  id: string;
  sequence: number;
  kind: string;
  state: string;
  sentAtUtc: string;
  senderId: string;
  account?: string;
  displayName?: string;
  content?: string;
  algorithm?: string;
  metadata?: Record<string, string>;
  plaintextAvailable: boolean;
};
type AdminConversationMessages = {
  conversation: Pick<Conversation, "id" | "name" | "type" | "isDissolved">;
  members: { userId: string; account?: string; displayName?: string; role?: string }[];
  messages: AdminConversationMessage[];
};

type Leaf = { id: PageId; label: string };
type MenuGroup = {
  id: string;
  label: string;
  icon: IconType;
  children: Leaf[];
};
const groups: MenuGroup[] = [
  {
    id: "platform",
    label: "平台管理",
    icon: Globe2,
    children: [
      { id: "platform-tenants", label: "租户管理" },
      { id: "platform-domains", label: "域名管理" },
      { id: "platform-apps", label: "APP管理" },
      { id: "platform-accounts", label: "平台账号" },
      { id: "platform-roles", label: "角色管理" },
    ],
  },
  {
    id: "account",
    label: "账户系统",
    icon: Users,
    children: [
      { id: "account-users", label: "用户管理" },
      { id: "account-login", label: "登录日志" },
      { id: "account-offline", label: "离线日志" },
      { id: "account-failures", label: "登录失败IP统计" },
      { id: "account-locked-ips", label: "锁定IP列表" },
      { id: "account-banned-users", label: "封禁用户列表" },
      { id: "account-locked-users", label: "账户锁定用户列表" },
      { id: "account-sms-records", label: "用户短信发送记录" },
      { id: "account-forbidden-words", label: "违禁词列表" },
      { id: "account-curfew", label: "宵禁功能" },
      { id: "account-feedback", label: "意见反馈" },
      { id: "account-invites", label: "邀请码设置" },
    ],
  },
  {
    id: "system",
    label: "管理系统",
    icon: Settings,
    children: [
      { id: "system-operators", label: "管理账号" },
      { id: "system-admin-login", label: "登录日志" },
      { id: "system-roles", label: "角色管理" },
      { id: "system-announcements", label: "公告管理" },
      { id: "system-images", label: "图片上传" },
      { id: "system-audit", label: "操作日志" },
      { id: "system-errors", label: "报错日志" },
    ],
  },
  {
    id: "chat",
    label: "聊天系统",
    icon: Smartphone,
    children: [
      { id: "chat-conversations", label: "会话管理" },
      { id: "chat-customer", label: "客服管理" },
      { id: "chat-groups", label: "群管理" },
      { id: "chat-service-groups", label: "一键拉群模板" },
      { id: "chat-bulk", label: "群发言" },
      { id: "chat-robots", label: "机器人发信息" },
    ],
  },
];
const pageLabel = new Map<PageId, string>([
  ["home", "首页"],
  ...groups.flatMap(group =>
    group.children.map(item => [item.id, item.label] as [PageId, string])
  ),
]);

const genericPages: Partial<
  Record<
    PageId,
    {
      module: string;
      field: string;
      fieldLabel: string;
      placeholder: string;
      description: string;
    }
  >
> = {
  "system-roles": {
    module: "system.roles",
    field: "permissions",
    fieldLabel: "权限范围",
    placeholder: "users:read, reports:write",
    description: "定义后台角色及其资源权限范围。",
  },
  "chat-customer": {
    module: "chat.customer-service",
    field: "account",
    fieldLabel: "客服账号",
    placeholder: "service_001",
    description: "配置在线客服账号与接待状态。",
  },
  "chat-robots": {
    module: "chat.robots",
    field: "content",
    fieldLabel: "机器人消息",
    placeholder: "输入机器人自动回复内容",
    description: "配置机器人消息规则与内容。",
  },
  "chat-redpacket": {
    module: "chat.red-packet-bot",
    field: "rule",
    fieldLabel: "抢红包规则",
    placeholder: "关键词、群范围、限额",
    description: "配置红包机器人规则；资金动作需人工复核。",
  },
  "chat-group-invites": {
    module: "chat.group-invites",
    field: "code",
    fieldLabel: "群邀请码",
    placeholder: "GROUP_2026",
    description: "维护可审计的群聊邀请码。",
  },
};

function formatTime(value?: string) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "—";
}
function statusClass(status: string) {
  return [
    "Active",
    "Resolved",
    "Completed",
    "Sent",
    "Succeeded",
    "success",
  ].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : ["Submitted", "Processing", "Restricted", "pending"].includes(status)
      ? "bg-amber-50 text-amber-700"
      : ["Disabled", "Failed", "Open", "failed"].includes(status)
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(value)}`}
    >
      {value}
    </span>
  );
}
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 ${className}`}
    >
      {children}
    </section>
  );
}
function PanelTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-36 place-items-center text-sm text-slate-400">
      {text}
    </div>
  );
}
function Loading() {
  return (
    <div className="grid min-h-[360px] place-items-center">
      <RefreshCw className="animate-spin text-teal-600" />
    </div>
  );
}

function AdminLogin({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthResponse) => void;
}) {
  const [account, setAccount] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [runtime, setRuntime] = useState<{
    version: string;
    previewAdminEnabled?: boolean;
  } | null>(null);
  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then(r => r.json())
      .then(setRuntime)
      .catch(() => null);
  }, []);
  async function authenticate(
    loginAccount = account,
    loginPassword = password
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await api<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          account: loginAccount,
          password: loginPassword,
          deviceName: `E聊管理后台 · ${navigator.userAgent}`,
          deviceId: getDeviceId(),
        }),
      });
      if (result.requiresTotp && result.pendingToken) {
        setPendingToken(result.pendingToken);
        return;
      }
      if (!result.accessToken || result.user?.role !== "Admin")
        throw new Error("该账号没有管理权限");
      setSession(result);
      onAuthenticated(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }
  async function verifyTotp() {
    setBusy(true);
    setError("");
    try {
      const result = await api<AuthResponse>("/api/auth/totp", {
        method: "POST",
        body: JSON.stringify({
          pendingToken,
          code: totpCode,
          deviceName: `E聊管理后台 · ${navigator.userAgent}`,
          deviceId: getDeviceId(),
        }),
      });
      if (!result.accessToken || result.user?.role !== "Admin")
        throw new Error("动态验证码验证失败");
      setSession(result);
      onAuthenticated(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-full bg-[#071421] text-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,.18),transparent_38%),radial-gradient(circle_at_90%_85%,rgba(16,185,129,.12),transparent_36%)]" />
        <div className="relative flex items-center gap-3">
          <img src={LOGO} alt="E聊" className="h-11 w-11" />
          <div>
            <div className="text-xl font-semibold">E聊控制台</div>
            <div className="text-xs tracking-[.18em] text-teal-300">
              OPERATIONS CENTER
            </div>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-sm font-medium tracking-[.22em] text-teal-300">
            SECURE · AUDITABLE · CONTROLLED
          </p>
          <h1 className="text-6xl font-semibold leading-[1.08] tracking-[-.05em]">
            四大业务系统，
            <br />
            <span className="text-teal-300">统一运营管理。</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-slate-300">
            账户、资金、系统和聊天能力集中治理，所有关键变更进入审计日志。
          </p>
        </div>
        <div className="relative flex gap-8 text-xs text-slate-400">
          <span>ASP.NET Core 8</span>
          <span>24 个功能页</span>
          <span>操作审计</span>
        </div>
      </section>
      <section className="flex min-h-full items-center justify-center bg-[#0b1b2a] px-5 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] border border-white/10 bg-white/[.06] p-7 shadow-2xl backdrop-blur sm:p-9">
            <ShieldCheck className="mb-4 text-teal-300" />
            <h2 className="text-3xl font-semibold">管理员登录</h2>
            <p className="mt-2 text-sm text-slate-400">
              仅允许 Admin 角色访问。
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                if (pendingToken) verifyTotp();
                else authenticate();
              }}
              className="mt-7 space-y-4"
            >
              {pendingToken && (
                <div className="rounded-xl border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm text-teal-100">
                  密码验证通过，请输入 Google Authenticator 中的 6
                  位动态验证码。
                </div>
              )}
              <input
                value={account}
                onChange={e => setAccount(e.target.value)}
                autoComplete="username"
                className="auth-input"
                aria-label="管理账号"
                disabled={Boolean(pendingToken)}
              />
              {pendingToken ? (
                <input
                  value={totpCode}
                  onChange={e =>
                    setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 位动态验证码"
                  className="auth-input tracking-[.35em]"
                  aria-label="动态验证码"
                />
              ) : (
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="输入管理员密码"
                  className="auth-input"
                  aria-label="密码"
                />
              )}
              {error && (
                <div className="rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
              <button
                disabled={
                  busy ||
                  (pendingToken ? totpCode.length !== 6 : !account || !password)
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-400 py-3.5 font-semibold text-[#04201d] disabled:opacity-50"
              >
                {busy ? (
                  <RefreshCw className="animate-spin" size={18} />
                ) : (
                  <KeyRound size={18} />
                )}
                {pendingToken ? "验证并进入" : "进入管理后台"}
              </button>
            </form>
            {pendingToken && (
              <button
                type="button"
                onClick={() => {
                  setPendingToken("");
                  setTotpCode("");
                }}
                className="mt-3 w-full text-sm text-slate-400"
              >
                返回密码登录
              </button>
            )}
            {runtime?.previewAdminEnabled && (
              <button
                onClick={() => authenticate("E_Admin", "Heibai@99")}
                disabled={busy}
                className="mt-3 w-full rounded-xl border border-teal-300/25 bg-teal-300/10 py-3 text-sm text-teal-200"
              >
                使用预览管理员一键登录
              </button>
            )}
            <p className="mt-4 text-center text-[11px] text-slate-500">
              API {runtime?.version || "检测中"}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Admin() {
  const [session, setAdminSession] = useState<AuthResponse | null>(() => {
    const current = getSession();
    return current?.user?.role === "Admin" ? current : null;
  });
  const [page, setPage] = useState<PageId>("home"),
    [drawer, setDrawer] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({
    account: true,
    fund: false,
    system: false,
    chat: false,
  });
  const [tenantScope, setTenantScope] = useState(() => localStorage.getItem("echat.admin.tenant") || "*");
  const [canSwitchTenant, setCanSwitchTenant] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  useEffect(() => {
    document.title = "E聊管理后台";
    return () => {
      document.title = "E聊";
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    api<{ current: string; canSwitch: boolean; tenants: TenantOption[] }>("/api/admin/tenant-context")
      .then(context => {
        setCanSwitchTenant(context.canSwitch);
        setTenantOptions(context.tenants);
        setTenantScope(context.current);
        if (!context.canSwitch) localStorage.removeItem("echat.admin.tenant");
      })
      .catch(() => undefined);
  }, [session]);
  useEffect(() => {
    if (canSwitchTenant) setPage(tenantScope === "*" ? "platform-tenants" : "home");
  }, [canSwitchTenant, tenantScope]);
  if (!session) return <AdminLogin onAuthenticated={setAdminSession} />;
  const navigate = (id: PageId) => {
    setPage(id);
    setDrawer(false);
  };
  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* local logout */
    }
    setSession(null);
    setAdminSession(null);
  };
  return (
    <main className="selectable min-h-full bg-[#f2f4f6] text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col bg-[#292d32] text-slate-200 shadow-2xl transition-transform duration-200 lg:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <a href="/admin" className="flex items-center gap-3">
            <img src={LOGO} alt="E聊" className="h-9 w-9" />
            <div>
              <div className="font-semibold text-white">E聊运营后台</div>
              <div className="text-[10px] tracking-[.16em] text-teal-300">
                ADMIN 0.9.0
              </div>
            </div>
          </a>
          <button onClick={() => setDrawer(false)} className="lg:hidden">
            <X />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          <button
            onClick={() => navigate("home")}
            className={`flex w-full items-center gap-3 px-5 py-3.5 text-sm transition ${page === "home" ? "bg-[#df493b] text-white" : "hover:bg-white/[.06]"}`}
          >
            <Home size={18} />
            首页
          </button>
          {(canSwitchTenant && tenantScope === "*"
            ? groups.filter(group => group.id === "platform")
            : groups.filter(group => group.id !== "platform")).map(group => (
            <div key={group.id} className="border-b border-white/[.06]">
              <button
                onClick={() =>
                  setOpen(value => ({ ...value, [group.id]: !value[group.id] }))
                }
                className="flex w-full items-center gap-3 px-5 py-3.5 text-sm hover:bg-white/[.05]"
              >
                <group.icon size={18} className="text-slate-400" />
                <span className="flex-1 text-left">{group.label}</span>
                {open[group.id] ? (
                  <ChevronDown size={15} />
                ) : (
                  <ChevronRight size={15} />
                )}
              </button>
              {open[group.id] && (
                <div className="bg-black/10 py-1">
                  {group.children.map(item => (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={`block w-full py-2.5 pl-14 pr-4 text-left text-sm transition ${page === item.id ? "bg-teal-500/15 text-teal-300" : "text-slate-300 hover:bg-white/[.05] hover:text-white"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[.05] p-3">
            <CircleUserRound className="text-teal-300" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">
                {session.user?.displayName}
              </div>
              <div className="truncate text-xs text-slate-500">
                @{session.user?.account}
              </div>
            </div>
            <button onClick={logout} title="退出">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {drawer && (
        <button
          aria-label="关闭导航"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      )}
      <section className="min-h-full lg:pl-[270px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-7">
          <button
            onClick={() => setDrawer(true)}
            className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 lg:hidden"
          >
            <Menu size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {pageLabel.get(page)}
            </h1>
            <p className="hidden text-xs text-slate-500 sm:block">
              E聊账户、资金、系统与聊天运营中心
            </p>
          </div>
          <button
            onClick={() => setRefresh(v => v + 1)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          {canSwitchTenant && (
            <select
              value={tenantScope}
              onChange={event => {
                const next = event.target.value;
                setPage(next === "*" ? "platform-tenants" : "home");
                setTenantScope(next);
                localStorage.setItem("echat.admin.tenant", next);
                setRefresh(value => value + 1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="选择管理租户"
            >
              <option value="*">全部租户</option>
              {tenantOptions.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
              <option value="unassigned">未分配</option>
            </select>
          )}
          <span className="hidden rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 sm:inline">
            服务正常
          </span>
        </header>
        <div className="mx-auto max-w-[1540px] p-4 md:p-7">
          {renderPage(page, refresh, session.user?.id || "")}
        </div>
      </section>
    </main>
  );
}

function renderPage(page: PageId, refresh: number, currentUserId: string) {
  if (page === "home") return <OverviewPanel refresh={refresh} />;
  if (page === "platform-tenants") return <PlatformManagementPanel refresh={refresh} tab="tenants" />;
  if (page === "platform-domains") return <PlatformManagementPanel refresh={refresh} tab="domains" />;
  if (page === "platform-apps") return <PlatformManagementPanel refresh={refresh} tab="apps" />;
  if (page === "platform-accounts") return <PlatformAccessPanel refresh={refresh} tab="accounts" />;
  if (page === "platform-roles") return <PlatformAccessPanel refresh={refresh} tab="roles" />;
  if (page === "account-users")
    return <UsersPanel refresh={refresh} currentUserId={currentUserId} />;
  if (page === "account-login") return <DocLogsPanel refresh={refresh} />;
  if (page === "account-offline")
    return <DocLogsPanel refresh={refresh} offline />;
  if (page === "account-failures")
    return <DocFailureIpPanel refresh={refresh} />;
  if (page === "account-locked-ips")
    return <DocLockedIpPanel refresh={refresh} />;
  if (page === "account-banned-users")
    return <DocBannedUsersPanel refresh={refresh} />;
  if (page === "account-locked-users")
    return <DocAccountLockedUsersPanel refresh={refresh} />;
  if (page === "account-sms-records")
    return <DocSmsRecordsPanel refresh={refresh} />;
  if (page === "account-forbidden-words")
    return <DocForbiddenWordsPanel refresh={refresh} />;
  if (page === "account-curfew")
    return <DocCurfewPanel refresh={refresh} />;
  if (page === "account-feedback")
    return <DocFeedbackPanel refresh={refresh} />;
  if (page === "account-invites")
    return <DocInviteManagementPanel refresh={refresh} />;
  if (page === "fund-subjects")
    return <DocFundSubjectsPanel refresh={refresh} />;
  if (page === "fund-adjust")
    return <DocFundAdjustmentsPanel refresh={refresh} />;
  if (page === "fund-transactions")
    return <DocTransactionDetailsPanel refresh={refresh} />;
  if (page === "system-operators")
    return <DocOperatorsPanel refresh={refresh} />;
  if (page === "system-admin-login")
    return <DocLogsPanel refresh={refresh} scope="admin" />;
  if (page === "system-roles")
    return (
      <DocGenericManagedPanel
        refresh={refresh}
        title="角色"
        description="角色固定为超级管理员、运营管理员、财务管理员、审计员和客服；权限支持中文复选框多选。"
        module="system.roles"
        fixedNames={[
          "超级管理员",
          "运营管理员",
          "财务管理员",
          "审计员",
          "客服",
        ]}
        fields={[
          {
            key: "permissions",
            label: "权限",
            options: [
              "*",
              "users:read",
              "users:write",
              "logs:read",
              "funds:read",
              "funds:write",
              "operators:read",
              "operators:write",
              "announcements:write",
              "errors:read",
              "conversations:read",
              "groups:write",
              "robots:write",
              "audit:read",
            ],
            optionLabels: {
              "*": "全部权限",
              "users:read": "查看用户",
              "users:write": "管理用户",
              "logs:read": "查看登录与离线日志",
              "funds:read": "查看资金数据",
              "funds:write": "调整资金额度",
              "operators:read": "查看管理账号",
              "operators:write": "管理后台账号",
              "announcements:write": "管理系统公告",
              "errors:read": "查看报错日志",
              "conversations:read": "查看会话和聊天记录",
              "groups:write": "管理群聊",
              "robots:write": "管理机器人与自动发言",
              "audit:read": "查看操作审计",
            },
          },
        ]}
      />
    );
  if (page === "system-announcements")
    return <DocAnnouncementPanel refresh={refresh} />;
  if (page === "system-images") return <ImagesPanel refresh={refresh} />;
  if (page === "system-audit") return <AuditPanel refresh={refresh} />;
  if (page === "system-errors") return <DocErrorLogsPanel refresh={refresh} />;
  if (page === "chat-conversations")
    return <DocConversationSearchPanel refresh={refresh} />;
  if (page === "chat-groups")
    return <DocConversationSearchPanel refresh={refresh} groupsOnly />;
  if (page === "chat-service-groups")
    return <ServiceGroupTemplatesPanel refresh={refresh} />;
  if (page === "chat-customer")
    return (
      <DocGenericManagedPanel
        refresh={refresh}
        title="客服账号"
        description="维护客服账号、接待状态与备注。"
        module="chat.customer-service"
        fields={[
          { key: "account", label: "关联用户账号" },
          { key: "remark", label: "客服备注" },
        ]}
      />
    );
  if (page === "chat-bulk")
    return (
      <DocGenericManagedPanel
        refresh={refresh}
        title="群发言规则"
        description="使用空格分隔关键词；保存后可人工触发并写入发送日志。"
        module="chat.group-speech"
        fields={[
          { key: "conversationId", label: "目标群聊 ID" },
          { key: "content", label: "发言内容", multiline: true },
          { key: "keywords", label: "关键词（空格分隔）" },
          { key: "replacement", label: "替换内容" },
        ]}
        runnable
      />
    );
  if (page === "chat-robots")
    return (
      <DocGenericManagedPanel
        refresh={refresh}
        title="机器人发信息规则"
        description="配置目标群聊、消息内容和启用状态；人工触发时实时发送。"
        module="chat.robots"
        fields={[
          { key: "conversationId", label: "目标群聊 ID" },
          { key: "content", label: "机器人消息", multiline: true },
          { key: "keywords", label: "触发关键词" },
        ]}
        runnable
      />
    );
  if (page === "chat-redpacket")
    return (
      <DocGenericManagedPanel
        refresh={refresh}
        title="抢红包机器人"
        description="仅配置可审计规则；真实资金动作仍需安全复核。"
        module="chat.red-packet-bot"
        fields={[
          { key: "rule", label: "关键词、群范围和限额", multiline: true },
        ]}
      />
    );
  if (page === "chat-group-invites")
    return <DocGroupInvitesPanel refresh={refresh} />;
  return <Empty text="页面正在初始化" />;
}

function useData<T>(path: string, refresh: number, fallback: T) {
  const [data, setData] = useState<T>(fallback),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<T>(path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load, refresh]);
  return { data, loading, reload: load };
}

function OverviewPanel({ refresh }: { refresh: number }) {
  const { data, loading } = useData<Overview | null>(
    "/api/admin/overview",
    refresh,
    null
  );
  if (loading || !data) return <Loading />;
  const cards = [
    [Users, "用户总数", data.metrics.users],
    [Activity, "活跃设备", data.metrics.activeSessions],
    [MessageCircleMore, "消息总数", data.metrics.messages],
    [AlertTriangle, "待处理举报", data.metrics.pendingReports],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([Icon, label, value]) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-semibold">
                  {value.toLocaleString()}
                </p>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                <Icon />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="bg-[#0b1b2a] text-white">
          <PanelTitle
            title="系统运行正常"
            description={`API ${data.version} · ${data.storage}`}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["正常用户", data.metrics.activeUsers],
              ["受限用户", data.metrics.restrictedUsers],
              ["停用用户", data.metrics.disabledUsers],
              ["会话总数", data.metrics.conversations],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-xs text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <PanelTitle
            title="模块状态"
            description="四大业务后台均已连接 ASP.NET Core API"
          />
          <div className="space-y-3">
            {["账户系统", "资金系统", "管理系统", "聊天系统"].map(x => (
              <div
                key={x}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"
              >
                <span>{x}</span>
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 size={16} />
                  已连接
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span>GeoIP 登录地区</span>
              <span
                className={
                  data.security.geoIp.enabled
                    ? "text-emerald-700"
                    : "text-slate-500"
                }
              >
                {data.security.geoIp.enabled
                  ? `${data.security.geoIp.provider} · 缓存 ${data.security.geoIp.cachedEntries}`
                  : "已关闭"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function UsersPanel({
  refresh,
  currentUserId,
}: {
  refresh: number;
  currentUserId: string;
}) {
  const emptyFilters = {
    search: "",
    status: "",
    role: "",
    online: "",
    hasMobile: "",
    realNameVerified: "",
    enterpriseVerified: "",
    todayOnline: "",
    accountLocked: "",
    loginLocked: "",
    cancellationEnabled: "",
    redFlagged: "",
    registrationSource: "",
    registeredFromUtc: "",
    registeredToUtc: "",
    lastSeenFromUtc: "",
    lastSeenToUtc: "",
    lastLoginIp: "",
    lastOnlineIp: "",
    lastNodeIp: "",
    failedLoginMin: "",
    failedLoginMax: "",
  };
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [menuId, setMenuId] = useState<string>();
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [statusMenuId, setStatusMenuId] = useState<string>();
  const [visibleColumns, setVisibleColumns] = useState<Record<AdminUserColumnKey, boolean>>(() => {
    const defaults = Object.fromEntries(adminUserColumns.map(([key]) => [key, !defaultHiddenAdminUserColumnKeys.has(key)])) as Record<AdminUserColumnKey, boolean>;
    try {
      const saved = JSON.parse(localStorage.getItem("echat-admin-user-columns-v3") || "{}");
      return { ...defaults, ...saved };
    } catch { return defaults; }
  });
  const [operation, setOperation] = useState<{
    user: AdminUser;
    kind: UserOperationKind;
  }>();
  const [detailUser, setDetailUser] = useState<AdminUser>();
  const [createMode, setCreateMode] = useState<"single" | "batch">();
  const [verification, setVerification] = useState<{
    user: AdminUser;
    type: "RealName" | "Enterprise";
  }>();
  const path = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      const normalized = key.endsWith("FromUtc")
        ? `${value}T00:00:00Z`
        : key.endsWith("ToUtc")
          ? `${value}T23:59:59Z`
          : value;
      params.set(key, normalized);
    });
    return `/api/admin/users?${params}`;
  }, [filters, page, pageSize]);
  const { data, loading, reload } = useData<AdminUserPage>(path, refresh, {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  useEffect(() => {
    localStorage.setItem("echat-admin-user-columns-v3", JSON.stringify(visibleColumns));
  }, [visibleColumns]);
  const columnStyle = (key: AdminUserColumnKey): React.CSSProperties => ({
    display: visibleColumns[key] ? undefined : "none",
  });

  useEffect(() => {
    if (!menuId) return;
    const close = () => {
      setMenuId(undefined);
      setStatusMenuId(undefined);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-user-menu-root]"))
        return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuId]);

  const toggleUserMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    userId: string
  ) => {
    if (menuId === userId) {
      setMenuId(undefined);
      setStatusMenuId(undefined);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const menuWidth = 176;
    const menuHeight = 235;
    let left = rect.right + gap;
    if (left + menuWidth > window.innerWidth - margin)
      left = rect.left - menuWidth - gap;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - menuWidth - margin)
    );
    const top = Math.max(
      margin,
      Math.min(rect.top, window.innerHeight - menuHeight - margin)
    );
    setMenuPosition({ top, left });
    setMenuId(userId);
    setStatusMenuId(undefined);
  };

  async function exportUsers() {
    const response = await authorizedFetch(
      `/api/admin/users/export?${path.split("?")[1]}`
    );
    if (!response.ok) return toast.error("导出失败");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `echat-users-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const openOperation = (user: AdminUser, kind: UserOperationKind) => {
    setOperation({ user, kind });
    setMenuId(undefined);
    setStatusMenuId(undefined);
  };
  const assignUserTenant = async (user: AdminUser, nextTenant: string) => {
    try {
      await api(`/api/admin/users/${user.id}/tenant`, {
        method: "PUT",
        body: JSON.stringify({ tenantId: nextTenant }),
      });
      toast.success("用户后台归属已更新");
      setMenuId(undefined);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户归属更新失败");
    }
  };
  const filter = (key: keyof typeof draft, value: string) =>
    setDraft(current => ({ ...current, [key]: value }));
  const badge = (active: boolean, yes: string, no: string) => (
    <span
      className={`inline-flex whitespace-nowrap px-2 py-0.5 text-xs ${active ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}
    >
      {active ? yes : no}
    </span>
  );
  return (
    <div className="space-y-3">
      <PanelTitle
        title="用户管理"
        description="分页筛选用户，查看资金、认证、在线与登录信息，并执行完整账户治理。"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCreateMode("batch")}
              className="admin-secondary"
            >
              <Upload size={15} />
              批量新增账号
            </button>
            <button
              onClick={() => setCreateMode("single")}
              className="admin-secondary"
            >
              <UserPlus size={15} />
              新增用户
            </button>
            <button onClick={exportUsers} className="admin-secondary">
              <Download size={15} />
              导出数据
            </button>
          </div>
        }
      />
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap justify-end gap-2">
          <select
            value={draft.realNameVerified}
            onChange={e => filter("realNameVerified", e.target.value)}
            className="admin-filter-select !w-auto min-w-36"
          >
            <option value="">全部实名状态</option>
            <option value="true">已实名</option>
            <option value="false">未实名</option>
          </select>
          <select
            value={draft.enterpriseVerified}
            onChange={e => filter("enterpriseVerified", e.target.value)}
            className="admin-filter-select !w-auto min-w-40"
          >
            <option value="">全部企业认证状态</option>
            <option value="true">已认证</option>
            <option value="false">未认证</option>
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <input
            value={draft.search}
            onChange={e => filter("search", e.target.value)}
            placeholder="用户ID / 账号 / 昵称 / 手机"
            className="admin-filter-input"
          />
          <select
            value={draft.status}
            onChange={e => filter("status", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">全部账户状态</option>
            <option>Active</option>
            <option>Restricted</option>
            <option>Disabled</option>
            <option>PendingDeletion</option>
          </select>
          <select
            value={draft.online}
            onChange={e => filter("online", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">在线状态</option>
            <option value="true">在线</option>
            <option value="false">离线</option>
          </select>
          <select
            value={draft.todayOnline}
            onChange={e => filter("todayOnline", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">今日是否上线</option>
            <option value="true">今日上线</option>
            <option value="false">今日未上线</option>
          </select>
          <select
            value={draft.hasMobile}
            onChange={e => filter("hasMobile", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">是否手机号</option>
            <option value="true">有手机号</option>
            <option value="false">无手机号</option>
          </select>
          <select
            value={draft.registrationSource}
            onChange={e => filter("registrationSource", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">全部注册来源</option>
            <option>邀请注册</option>
            <option>后台开户</option>
          </select>
          <select
            value={draft.accountLocked}
            onChange={e => filter("accountLocked", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">账号锁定状态</option>
            <option value="true">已锁定</option>
            <option value="false">未锁定</option>
          </select>
          <select
            value={draft.loginLocked}
            onChange={e => filter("loginLocked", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">登录锁定状态</option>
            <option value="true">已锁定</option>
            <option value="false">未锁定</option>
          </select>
          <select
            value={draft.cancellationEnabled}
            onChange={e => filter("cancellationEnabled", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">注销状态</option>
            <option value="true">已开启</option>
            <option value="false">正常</option>
          </select>
          <select
            value={draft.redFlagged}
            onChange={e => filter("redFlagged", e.target.value)}
            className="admin-filter-select"
          >
            <option value="">红号状态</option>
            <option value="true">红号</option>
            <option value="false">普通</option>
          </select>
          <input
            type="date"
            value={draft.registeredFromUtc}
            onChange={e => filter("registeredFromUtc", e.target.value)}
            className="admin-filter-input"
            title="注册开始时间"
          />
          <input
            type="date"
            value={draft.registeredToUtc}
            onChange={e => filter("registeredToUtc", e.target.value)}
            className="admin-filter-input"
            title="注册结束时间"
          />
          <input
            type="date"
            value={draft.lastSeenFromUtc}
            onChange={e => filter("lastSeenFromUtc", e.target.value)}
            className="admin-filter-input"
            title="最后在线开始"
          />
          <input
            type="date"
            value={draft.lastSeenToUtc}
            onChange={e => filter("lastSeenToUtc", e.target.value)}
            className="admin-filter-input"
            title="最后在线结束"
          />
          <input
            value={draft.lastLoginIp}
            onChange={e => filter("lastLoginIp", e.target.value)}
            placeholder="最后登录 IP"
            className="admin-filter-input"
          />
          <input
            value={draft.lastOnlineIp}
            onChange={e => filter("lastOnlineIp", e.target.value)}
            placeholder="最后在线 IP"
            className="admin-filter-input"
          />
          <input
            value={draft.lastNodeIp}
            onChange={e => filter("lastNodeIp", e.target.value)}
            placeholder="最后节点 IP"
            className="admin-filter-input"
          />
          <div className="flex gap-1">
            <input
              type="number"
              min="0"
              value={draft.failedLoginMin}
              onChange={e => filter("failedLoginMin", e.target.value)}
              placeholder="失败起"
              className="admin-filter-input min-w-0"
            />
            <input
              type="number"
              min="0"
              value={draft.failedLoginMax}
              onChange={e => filter("failedLoginMax", e.target.value)}
              placeholder="失败止"
              className="admin-filter-input min-w-0"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFilters({ ...draft });
              setPage(1);
            }}
            className="admin-primary !w-auto inline-flex items-center gap-2"
          >
            <Search size={15} />
            查询
          </button>
          <button
            onClick={() => {
              setDraft({ ...emptyFilters });
              setFilters({ ...emptyFilters });
              setPage(1);
            }}
            className="admin-danger"
          >
            <X size={15} />
            重置
          </button>
        </div>
      </Card>
      <Card className="mb-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">用户列表显示列</h3>
            <p className="text-xs text-slate-500">勾选显示，取消勾选隐藏；设置会保存在当前浏览器。</p>
          </div>
          <button onClick={() => setVisibleColumns(Object.fromEntries(adminUserColumns.map(([key]) => [key, true])) as Record<AdminUserColumnKey, boolean>)} className="admin-filter-button">全部显示</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {adminUserColumns.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={visibleColumns[key]} onChange={event => setVisibleColumns(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
        </div>
      </Card>
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[3600px] border-collapse text-left text-xs">
              <colgroup><col />{adminUserColumns.map(([key]) => <col key={key} style={columnStyle(key)} />)}<col /></colgroup>
              <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600">
                <tr className="border-b border-slate-300 text-center">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 w-28 bg-slate-100 p-2"
                  >
                    操作
                  </th>
                  <th colSpan={6} className="border-l border-slate-300 p-2">
                    基本资料
                  </th>
                  <th colSpan={10} className="border-l border-slate-300 p-2">
                    状态信息
                  </th>
                  <th colSpan={19} className="border-l border-slate-300 p-2">
                    其他信息
                  </th>
                </tr>
                <tr className="border-b border-slate-300">
                  {adminUserColumns.map(([key, label]) => (
                    <th
                      key={key}
                      style={columnStyle(key)}
                      className="whitespace-nowrap border-l border-slate-200 px-2 py-2 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-l border-slate-200 px-2 py-2 font-medium">
                    发送消息
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(user => (
                  <tr
                    key={user.id}
                    className={`${user.redFlagged ? "bg-rose-50" : "bg-white"} border-b border-slate-200 hover:bg-amber-50/40`}
                  >
                    <td
                      className={`sticky left-0 ${menuId === user.id ? "z-40" : "z-10"} border-r border-slate-200 p-2 ${user.redFlagged ? "bg-rose-50" : "bg-white"}`}
                    >
                      <div className="relative" data-user-menu-root>
                        <button
                          onClick={event => toggleUserMenu(event, user.id)}
                          aria-haspopup="menu"
                          aria-expanded={menuId === user.id}
                          className="flex items-center gap-1 bg-sky-600 px-3 py-1.5 font-medium text-white"
                        >
                          <MoreHorizontal size={14} />
                          操作
                        </button>
                        {menuId === user.id && (
                          <div
                            className="user-action-menu z-50 w-44 border border-slate-200 bg-white py-1 text-sm shadow-xl"
                            style={menuPosition}
                            role="menu"
                            data-user-menu-root
                          >
                            <button
                              onClick={() => {
                                setDetailUser(user);
                                setMenuId(undefined);
                              }}
                            >
                              <CircleUserRound size={14} />
                              用户详情
                            </button>
                            <button
                              onClick={() => openOperation(user, "sameIp")}
                            >
                              <Search size={14} />
                              同IP会员检测
                            </button>
                            <button
                              onClick={() =>
                                openOperation(user, "inviteSource")
                              }
                            >
                              修改邀请码
                            </button>
                            <button
                              onClick={() => openOperation(user, "displayName")}
                            >
                              修改用户昵称
                            </button>
                            <button
                              onClick={() =>
                                openOperation(user, "loginIpRestriction")
                              }
                            >
                              限制登录IP
                            </button>
                            <div className="user-status-trigger relative">
                              <button
                                onMouseEnter={() => setStatusMenuId(user.id)}
                                onClick={() =>
                                  setStatusMenuId(value =>
                                    value === user.id ? undefined : user.id
                                  )
                                }
                              >
                                <span>状态变更</span>
                                <ChevronRight className="ml-auto" size={15} />
                              </button>
                              {statusMenuId === user.id && (
                                <div
                                  className="user-status-submenu"
                                  onMouseLeave={() =>
                                    setStatusMenuId(undefined)
                                  }
                                >
                                  <button
                                    disabled={user.id === currentUserId}
                                    onClick={() =>
                                      openOperation(user, "forceOffline")
                                    }
                                  >
                                    强制下线
                                  </button>
                                  <button
                                    disabled={
                                      user.id === currentUserId &&
                                      !user.accountLocked
                                    }
                                    onClick={() =>
                                      openOperation(user, "accountLocked")
                                    }
                                  >
                                    {user.accountLocked
                                      ? "解除账户锁定"
                                      : "账户锁定"}
                                  </button>
                                  <button
                                    disabled={
                                      user.id === currentUserId &&
                                      !user.loginLocked
                                    }
                                    onClick={() =>
                                      openOperation(user, "loginLocked")
                                    }
                                  >
                                    {user.loginLocked
                                      ? "解除登录锁定"
                                      : "登录锁定"}
                                  </button>
                                  <button
                                    disabled={
                                      user.id === currentUserId &&
                                      !user.cancellationEnabled
                                    }
                                    onClick={() =>
                                      openOperation(user, "cancellationEnabled")
                                    }
                                  >
                                    {user.cancellationEnabled
                                      ? "取消注销"
                                      : "注销开启"}
                                  </button>
                                  <button
                                    onClick={() =>
                                      openOperation(user, "redFlagged")
                                    }
                                  >
                                    {user.redFlagged ? "取消红号" : "设置红号"}
                                  </button>
                                  <button
                                    disabled={user.id === currentUserId}
                                    onClick={() => openOperation(user, "ban")}
                                  >
                                    {user.status === "Disabled" ? "解除封禁" : "封禁用户"}
                                  </button>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => openOperation(user, "password")}
                            >
                              <KeyRound size={14} />
                              登录密码
                            </button>
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
                              <span>所属后台</span>
                              <select
                                value={user.tenantId || "unassigned"}
                                onChange={event => assignUserTenant(user, event.target.value)}
                                className="min-w-24 rounded border border-slate-200 bg-white px-1 py-1"
                                aria-label="分配用户后台"
                              >
                                <option value="a">A后台</option>
                                <option value="b">B后台</option>
                                <option value="unassigned">未分配</option>
                              </select>
                            </label>
                            <button
                              onClick={() => openOperation(user, "sendMessage")}
                            >
                              <Send size={14} />
                              发送消息
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={columnStyle("id")} className="px-2" title={user.id}>
                      {user.id.slice(0, 8)}
                    </td>
                    <td style={columnStyle("risk1")} className="px-2">{user.riskLevel1}</td>
                    <td style={columnStyle("risk2")} className="px-2">{user.riskLevel2}</td>
                    <td style={columnStyle("account")} className="px-2 font-medium">{user.account}</td>
                    <td style={columnStyle("displayName")} className="px-2">{user.displayName}</td>
                    <td style={columnStyle("mobilePhone")} className="px-2">{user.mobilePhone || "—"}</td>
                    <td style={columnStyle("online")} className="px-2">
                      {badge(user.online, "在线", "离线")}
                    </td>
                    <td style={columnStyle("accountLocked")} className="px-2">
                      {badge(user.accountLocked, "已锁定", "未锁定")}
                    </td>
                    <td style={columnStyle("loginLocked")} className="px-2">
                      {badge(user.loginLocked, "已锁定", "未锁定")}
                    </td>
                    <td style={columnStyle("bankCardLocked")} className="px-2">
                      {badge(user.bankCardLocked, "已锁定", "未锁定")}
                    </td>
                    <td style={columnStyle("cancellationEnabled")} className="px-2">
                      {badge(user.cancellationEnabled, "已开启", "正常")}
                    </td>
                    <td style={columnStyle("realName")} className="px-2">
                      <button
                        onClick={() =>
                          setVerification({ user, type: "RealName" })
                        }
                        title="查看实名认证详情"
                      >
                        {badge(user.realNameVerified, "已认证", "未认证")}
                      </button>
                    </td>
                    <td style={columnStyle("enterprise")} className="px-2">
                      <button
                        onClick={() =>
                          setVerification({ user, type: "Enterprise" })
                        }
                        title="查看企业认证详情"
                      >
                        {badge(user.enterpriseVerified, "已认证", "未认证")}
                      </button>
                    </td>
                    <td style={columnStyle("todayOnline")} className="px-2">
                      {badge(
                        new Date(user.lastSeenAtUtc).toDateString() ===
                          new Date().toDateString(),
                        "是",
                        "否"
                      )}
                    </td>
                    <td style={columnStyle("redFlagged")} className="px-2">
                      {badge(user.redFlagged, "红号", "普通")}
                    </td>
                    <td style={columnStyle("role")} className="px-2">{user.role}</td>
                    <td style={columnStyle("registrationSource")} className="px-2">
                      <span
                        className={
                          user.registrationSource === "后台开户"
                            ? "bg-amber-400 px-2 py-0.5 text-white"
                            : "bg-blue-500 px-2 py-0.5 text-white"
                        }
                      >
                        {user.registrationSource}
                      </span>
                    </td>
                    <td style={columnStyle("inviteSource")} className="px-2">{user.inviteSource || "—"}</td>
                    <td style={columnStyle("createdAt")} className="px-2 whitespace-nowrap">
                      {formatTime(user.createdAtUtc)}
                    </td>
                    <td style={columnStyle("passwordChanged")} className="px-2 whitespace-nowrap">
                      {formatTime(user.loginPasswordChangedAtUtc)}
                    </td>
                    <td style={columnStyle("lastSeen")} className="px-2 whitespace-nowrap">
                      {formatTime(user.lastSeenAtUtc)}
                    </td>
                    <td style={columnStyle("lastLoginAddress")} className="px-2">{user.lastLoginAddress || "—"}</td>
                    <td style={columnStyle("lastOnlineIp")} className="px-2">{user.lastOnlineIp || "—"}</td>
                    <td style={columnStyle("lastNodeIp")} className="px-2">{user.lastNodeIp || "—"}</td>
                    <td style={columnStyle("failedLogin")} className="px-2">{user.failedLoginAttempts}</td>
                    <td style={columnStyle("activeSessions")} className="px-2">{user.activeSessions}</td>
                    <td
                      style={columnStyle("loginIpRestriction")}
                      className="max-w-48 truncate px-2"
                      title={user.loginIpRestriction}
                    >
                      {user.loginIpRestriction || "—"}
                    </td>
                    <td style={columnStyle("status")} className="px-2">
                      <Status value={user.status} />
                    </td>
                    <td style={columnStyle("avatar")} className="px-2">
                      <AdminUserAvatar user={user} />
                    </td>
                    <td style={columnStyle("gender")} className="px-2">{user.gender || "—"}</td>
                    <td style={columnStyle("communicationId")} className="px-2">{user.communicationId || "—"}</td>
                    <td style={columnStyle("lastLoginIp")} className="px-2">{user.lastLoginIp || "—"}</td>
                    <td style={columnStyle("lastOfflineAt")} className="px-2 whitespace-nowrap">{formatTime(user.lastOfflineAtUtc)}</td>
                    <td style={columnStyle("balance")} className="px-2 tabular-nums">
                      {Number(user.accountBalance).toFixed(2)}
                    </td>
                    <td style={columnStyle("frozenBalance")} className="px-2 tabular-nums">
                      {Number(user.frozenBalance).toFixed(2)}
                    </td>
                    <td className="px-2 text-center"><button onClick={() => openOperation(user, "sendMessage")} className="inline-flex items-center gap-1 bg-pink-400 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"><Send size={13} />发送</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && <Empty text="没有符合条件的用户" />}
          </div>
        </Card>
      )}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>
            第 {data.page} / {data.totalPages} 页 · 共{" "}
            {data.total.toLocaleString()} 条普通用户
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pageSize}
              onChange={event => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="admin-filter-select !w-24"
            >
              <option>20</option>
              <option>50</option>
              <option>100</option>
            </select>
            <button
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="admin-filter-button"
            >
              首页
            </button>
            <button
              disabled={page <= 1}
              onClick={() => setPage(value => Math.max(1, value - 1))}
              className="admin-filter-button"
            >
              上一页
            </button>
            <button
              disabled={page >= data.totalPages}
              onClick={() =>
                setPage(value => Math.min(data.totalPages, value + 1))
              }
              className="admin-filter-button"
            >
              下一页
            </button>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage(data.totalPages)}
              className="admin-filter-button"
            >
              末页
            </button>
            <button
              onClick={reload}
              className="admin-filter-button"
              aria-label="刷新"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </Card>
      {createMode && (
        <UserCreateDialog
          mode={createMode}
          onClose={() => setCreateMode(undefined)}
          onCreated={() => {
            setCreateMode(undefined);
            reload();
          }}
        />
      )}
      {operation && (
        <UserOperationDialog
          key={`${operation.user.id}:${operation.kind}`}
          operation={operation}
          currentUserId={currentUserId}
          onClose={() => setOperation(undefined)}
          onSaved={() => {
            setOperation(undefined);
            reload();
          }}
        />
      )}
      {detailUser && (
        <UserDetailDialog
          user={detailUser}
          onClose={() => setDetailUser(undefined)}
          onSaved={() => {
            setDetailUser(undefined);
            reload();
          }}
        />
      )}
      {verification && (
        <VerificationDialog
          user={verification.user}
          type={verification.type}
          onClose={() => setVerification(undefined)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function UserOperationDialog({
  operation,
  currentUserId,
  onClose,
  onSaved,
}: {
  operation: { user: AdminUser; kind: UserOperationKind };
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, kind } = operation;
  const initialValue =
    kind === "inviteSource"
      ? user.inviteSource
      : kind === "displayName"
        ? user.displayName
        : kind === "loginIpRestriction"
          ? user.loginIpRestriction
          : "";
  const [value, setValue] = useState(initialValue);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reason, setReason] = useState("后台账号操作菜单");
  const [matches, setMatches] = useState<
    { id: string; account: string; displayName: string; lastLoginIp: string }[]
  >([]);
  const [loading, setLoading] = useState(kind === "sameIp");
  const [busy, setBusy] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<
    { code: string; status: string }[]
  >([]);

  useEffect(() => {
    if (kind !== "sameIp") return;
    api<
      {
        id: string;
        account: string;
        displayName: string;
        lastLoginIp: string;
      }[]
    >(`/api/admin/users/${user.account}/same-ip`)
      .then(setMatches)
      .catch(cause =>
        toast.error(cause instanceof Error ? cause.message : "同 IP 检测失败")
      )
      .finally(() => setLoading(false));
  }, [kind, user.account]);

  useEffect(() => {
    if (kind !== "inviteSource") return;
    api<{ code: string; status: string }[]>("/api/admin/invites")
      .then(setInviteCodes)
      .catch(cause =>
        toast.error(cause instanceof Error ? cause.message : "邀请码加载失败")
      );
  }, [kind]);

  const labels: Record<UserOperationKind, string> = {
    sameIp: "同IP会员检测",
    inviteSource: "修改邀请码",
    displayName: "修改用户昵称",
    loginIpRestriction: "限制登录IP",
    forceOffline: "强制下线",
    ban: user.status === "Disabled" ? "解除封禁" : "封禁用户",
    sendMessage: "发送消息",
    accountLocked: user.accountLocked ? "解除账户锁定" : "账户锁定",
    loginLocked: user.loginLocked ? "解除登录锁定" : "登录锁定",
    bankCardLocked: user.bankCardLocked ? "解除银行卡锁定" : "银行卡锁定",
    cancellationEnabled: user.cancellationEnabled ? "取消注销" : "注销开启",
    redFlagged: user.redFlagged ? "取消红号" : "设置红号",
    password: "登录密码",
  };
  const profileKinds: UserOperationKind[] = [
    "inviteSource",
    "displayName",
    "loginIpRestriction",
  ];
  const securityKinds: UserOperationKind[] = [
    "accountLocked",
    "loginLocked",
    "bankCardLocked",
    "cancellationEnabled",
    "redFlagged",
  ];
  const destructive = [
    "forceOffline",
    "ban",
    "accountLocked",
    "loginLocked",
    "cancellationEnabled",
  ].includes(kind);

  async function submit() {
    setBusy(true);
    try {
      if (profileKinds.includes(kind)) {
        if (kind === "inviteSource") {
          if (!/^[A-Z0-9]{8}$/.test(value))
            throw new Error("请选择有效的八位邀请码");
          await api(`/api/admin/users/${user.account}/invite-code`, {
            method: "PUT",
            body: JSON.stringify({ code: value }),
          });
          toast.success("用户邀请码已更新");
          onSaved();
          return;
        }
        const field = kind as
          | "inviteSource"
          | "displayName"
          | "loginIpRestriction";
        await api(`/api/admin/users/${user.account}/profile`, {
          method: "PUT",
          body: JSON.stringify({ [field]: value }),
        });
      } else if (kind === "password") {
        if (value.length < 8 || value.length > 72)
          throw new Error("登录密码长度需为 8–72 位");
        if (value !== confirmPassword) throw new Error("两次输入的密码不一致");
        await api(`/api/admin/users/${user.account}/password`, {
          method: "PUT",
          body: JSON.stringify({ password: value }),
        });
      } else if (kind === "sendMessage") {
        if (!value.trim()) throw new Error("请输入消息内容");
        await api(`/api/admin/users/${user.account}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: value.trim() }),
        });
      } else if (kind === "ban") {
        await api(`/api/admin/users/${user.account}/status`, {
          method: "POST",
          body: JSON.stringify({
            status: user.status === "Disabled" ? "Active" : "Disabled",
            reason: user.status === "Disabled" ? "管理员解除封禁" : "管理员封禁",
          }),
        });
      } else if (kind === "forceOffline") {
        await api(`/api/admin/users/${user.account}/sessions/revoke`, {
          method: "POST",
        });
      } else if (securityKinds.includes(kind)) {
        const current = {
          accountLocked: user.accountLocked,
          loginLocked: user.loginLocked,
          bankCardLocked: user.bankCardLocked,
          cancellationEnabled: user.cancellationEnabled,
          redFlagged: user.redFlagged,
        }[
          kind as Exclude<
            UserOperationKind,
            | "sameIp"
            | "inviteSource"
            | "displayName"
            | "loginIpRestriction"
            | "forceOffline"
            | "ban"
            | "sendMessage"
            | "password"
          >
        ];
        await api(`/api/admin/users/${user.account}/security`, {
          method: "PUT",
          body: JSON.stringify({ [kind]: !current, reason }),
        });
      }
      toast.success(`${labels[kind]}已完成`);
      if (kind === "password" && user.id === currentUserId) {
        setSession(null);
        window.location.assign("/admin");
        return;
      }
      onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "账号操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      data-user-operation-dialog={kind}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">
              账号操作
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">
              {labels[kind]}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {user.displayName} · @{user.account}
              {user.id === currentUserId ? " · 当前管理账号" : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="关闭">
            <X />
          </button>
        </div>

        {kind === "sameIp" ? (
          <div className="mt-5">
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <span className="text-slate-500">最后登录 IP：</span>
              <b>{user.lastLoginIp || "尚无登录记录"}</b>
            </div>
            {loading ? (
              <Loading />
            ) : matches.length ? (
              <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200">
                {matches.map(match => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-0"
                  >
                    <div>
                      <b>{match.displayName}</b>
                      <p className="text-xs text-slate-500">@{match.account}</p>
                    </div>
                    <code className="text-xs text-slate-500">
                      {match.lastLoginIp}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="未发现同登录 IP 的其他账号" />
            )}
          </div>
        ) : profileKinds.includes(kind) ? (
          <div className="mt-5 space-y-2">
            <label className="text-sm font-medium text-slate-700">
              {kind === "inviteSource"
                ? "邀请码 / 邀请来源"
                : kind === "displayName"
                  ? "用户昵称"
                  : "允许登录的 IP"}
            </label>
            {kind === "inviteSource" ? (
              <select
                value={value}
                onChange={event => setValue(event.target.value)}
                className="admin-input"
              >
                <option value="">请选择八位邀请码</option>
                {inviteCodes
                  .filter(
                    code => code.status === "Active" || code.code === value
                  )
                  .map(code => (
                    <option key={code.code} value={code.code}>
                      {code.code} · {code.status}
                    </option>
                  ))}
              </select>
            ) : kind === "loginIpRestriction" ? (
              <textarea
                value={value}
                onChange={event => setValue(event.target.value)}
                rows={5}
                className="admin-input font-mono text-sm"
                placeholder="多个 IP 使用逗号或换行分隔；留空表示解除限制"
              />
            ) : (
              <input
                value={value}
                onChange={event => setValue(event.target.value)}
                className="admin-input"
                maxLength={60}
              />
            )}
          </div>
        ) : kind === "sendMessage" ? (
          <div className="mt-5 space-y-3">
            <textarea
              value={value}
              onChange={event => setValue(event.target.value)}
              rows={6}
              maxLength={50000}
              className="admin-input"
              placeholder={`输入要发送给 @${user.account} 的消息`}
              autoFocus
            />
            <p className="text-xs text-slate-500">消息会以管理员账号身份发送，并写入审计日志。</p>
          </div>
        ) : kind === "password" ? (
          <div className="mt-5 space-y-3">
            <input
              value={value}
              onChange={event => setValue(event.target.value)}
              type="password"
              className="admin-input"
              placeholder="新登录密码（8–72 位）"
              autoComplete="new-password"
            />
            <input
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              type="password"
              className="admin-input"
              placeholder="再次输入新登录密码"
              autoComplete="new-password"
            />
            <p className="text-xs text-amber-700">
              保存后该账号全部设备会话将立即失效。
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div
              className={`rounded-xl border p-4 text-sm ${destructive ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}
            >
              即将对 <b>@{user.account}</b> 执行“{labels[kind]}”。
              {kind === "forceOffline" ||
              kind === "ban" ||
              kind === "accountLocked" ||
              kind === "loginLocked" ||
              kind === "cancellationEnabled"
                ? " 此操作可能使现有设备立即离线。"
                : ""}
            </div>
            {kind !== "ban" && <textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={3}
              className="admin-input"
              placeholder="操作原因（将写入审计日志）"
            />}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="admin-secondary">
            {kind === "sameIp" ? "关闭" : "取消"}
          </button>
          {kind !== "sameIp" && (
            <button
              disabled={busy}
              onClick={submit}
              className={`${destructive ? "admin-danger" : "admin-primary"} !w-auto`}
            >
              {busy ? "处理中…" : "确认执行"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UserDetailDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fallback: AdminUserDetail = { user, friends: [], blacklist: [], groups: [] };
  const { data, loading, reload } = useData<AdminUserDetail>(
    `/api/admin/users/${encodeURIComponent(user.account)}/detail`,
    0,
    fallback
  );
  const [message, setMessage] = useState("");
  const [friendAccount, setFriendAccount] = useState("");
  const [password, setPassword] = useState("");
  const [allowList, setAllowList] = useState(user.loginIpAllowList || "");
  const [canAddFriend, setCanAddFriend] = useState(user.canAddFriend);
  const [canCreateGroup, setCanCreateGroup] = useState(user.canCreateGroup);
  const [busy, setBusy] = useState(false);
  const current = data.user;
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await reload();
      onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            {current.avatarUrl ? <img src={current.avatarUrl} className="h-12 w-12 rounded-full object-cover" alt="头像" /> : <div className="grid h-12 w-12 place-items-center rounded-full bg-teal-100 text-lg font-semibold text-teal-700">{(current.displayName || current.account).slice(0, 1)}</div>}
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">用户个人详细信息</p><h3 className="mt-1 text-xl font-semibold">{current.displayName || "未设置昵称"} <span className="text-sm font-normal text-slate-500">@{current.account}</span></h3><p className="text-xs text-slate-500">UID：{current.id}</p></div>
          </div>
          <button onClick={onClose} aria-label="关闭"><X /></button>
        </div>
        {loading ? <Loading /> : <div className="mt-5 space-y-5">
          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
            {[["手机号", current.mobilePhone], ["昵称", current.displayName], ["性别", current.gender || "未填写"], ["通讯号", current.communicationId || "未填写"], ["最后登录IP", current.lastLoginIp], ["登录地址", current.lastLoginAddress], ["邀请码", current.inviteSource], ["用户状态", current.status], ["在线状态", current.online ? "在线" : "离线"], ["注册时间", formatTime(current.createdAtUtc)], ["最后离线时间", formatTime(current.lastOfflineAtUtc)], ["最后上线时间", formatTime(current.lastSeenAtUtc)]].map(([label, value]) => <div key={label}><span className="text-slate-500">{label}：</span><b className="break-all">{value || "—"}</b></div>)}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">好友列表（{data.friends.length}）</h4><div className="mt-3 max-h-40 space-y-2 overflow-auto text-sm">{data.friends.length ? data.friends.map(item => <div key={item.peerUserId} className="flex items-center justify-between border-b border-slate-100 pb-2"><span>{item.user?.displayName || item.user?.account || item.peerUserId}</span><span className="text-xs text-slate-500">{item.user?.mobilePhone || ""}</span></div>) : <p className="text-slate-500">暂无好友</p>}</div></section>
            <section className="rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">群列表（{data.groups.length}）</h4><div className="mt-3 max-h-40 space-y-2 overflow-auto text-sm">{data.groups.length ? data.groups.map(group => <div key={group.id} className="flex justify-between border-b border-slate-100 pb-2"><span>{group.name || "未命名群"}</span><span className="text-xs text-slate-500">{group.memberCount} 人</span></div>) : <p className="text-slate-500">暂无群聊</p>}</div></section>
            <section className="rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">黑名单列表（{data.blacklist.length}）</h4><div className="mt-3 max-h-40 space-y-2 overflow-auto text-sm">{data.blacklist.length ? data.blacklist.map(item => <div key={item.peerUserId} className="border-b border-slate-100 pb-2">{item.user?.displayName || item.user?.account || item.peerUserId}</div>) : <p className="text-slate-500">暂无黑名单</p>}</div></section>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">权限和登录控制</h4><label className="flex items-center justify-between text-sm"><span>能否加好友</span><input type="checkbox" checked={canAddFriend} onChange={e => setCanAddFriend(e.target.checked)} /></label><label className="flex items-center justify-between text-sm"><span>能否建群</span><input type="checkbox" checked={canCreateGroup} onChange={e => setCanCreateGroup(e.target.checked)} /></label><label className="block text-sm"><span>个人白名单 IP（每行一个，留空不限）</span><textarea value={allowList} onChange={e => setAllowList(e.target.value)} rows={3} className="admin-input mt-1 w-full" /></label><button disabled={busy} onClick={() => void run(() => api(`/api/admin/users/${current.account}/permissions`, { method: "PUT", body: JSON.stringify({ canAddFriend, canCreateGroup, loginIpAllowList: allowList, reason: "管理员详情页修改" }) }), "权限和白名单已保存")} className="admin-primary !w-auto">保存权限</button></section>
            <section className="space-y-3 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">后台发送消息</h4><textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} className="admin-input w-full" placeholder="输入要发送给该用户的消息" /><button disabled={busy || !message.trim()} onClick={() => void run(() => api(`/api/admin/users/${current.account}/messages`, { method: "POST", body: JSON.stringify({ content: message }) }), "消息已发送")} className="admin-primary !w-auto"><Send size={15} />发送消息</button></section>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="space-y-2 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">好友操作</h4><input value={friendAccount} onChange={e => setFriendAccount(e.target.value)} className="admin-input w-full" placeholder="目标用户账号" /><button disabled={busy || !friendAccount.trim()} onClick={() => void run(() => api(`/api/admin/users/${current.account}/force-friend`, { method: "POST", body: JSON.stringify({ peerAccount: friendAccount }) }), "已强制添加好友")} className="admin-secondary">强制加好友</button></section>
            <section className="space-y-2 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">账号治理</h4><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void run(() => api(`/api/admin/users/${current.account}/sessions/revoke`, { method: "POST" }), "已踢下线")} className="admin-secondary">踢下线</button><button disabled={busy} onClick={() => void run(() => api(`/api/admin/users/${current.account}/status`, { method: "POST", body: JSON.stringify({ status: "Disabled", reason: "管理员封禁" }) }), "账号已封禁")} className="admin-danger">封禁</button></div></section>
            <section className="space-y-2 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">修改登录密码</h4><input value={password} onChange={e => setPassword(e.target.value)} type="password" className="admin-input w-full" placeholder="至少 6 位字母或数字" /><button disabled={busy || password.length < 6} onClick={() => void run(() => api(`/api/admin/users/${current.account}/password`, { method: "PUT", body: JSON.stringify({ password }) }), "登录密码已修改")} className="admin-secondary">修改密码</button></section>
          </div>
        </div>}
        <div className="mt-5 flex justify-end"><button onClick={onClose} className="admin-secondary">关闭</button></div>
      </div>
    </div>
  );
}

function UserCreateDialog({
  mode,
  onClose,
  onCreated,
}: {
  mode: "single" | "batch";
  onClose: () => void;
  onCreated: () => void;
}) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [inviteSource, setInviteSource] = useState("后台开户");
  const [accountType, setAccountType] = useState<"username" | "phone">("username");
  const [prefix, setPrefix] = useState("user");
  const [startIndex, setStartIndex] = useState("1");
  const [count, setCount] = useState("1");
  const [batchPassword, setBatchPassword] = useState("user123");
  const [displayNamePrefix, setDisplayNamePrefix] = useState("");
  const [mobilePrefix, setMobilePrefix] = useState("");
  const [status, setStatus] = useState<UserStatus>("Active");
  const [canAddFriend, setCanAddFriend] = useState(true);
  const [canCreateGroup, setCanCreateGroup] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      if (mode === "single")
        await api("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            account,
            password,
            displayName,
            mobilePhone,
            inviteSource,
            status,
            canAddFriend,
            canCreateGroup,
          }),
        });
      else {
        const result = await api<{ created: string[]; skipped: string[] }>(
          "/api/admin/users/batch",
          {
            method: "POST",
              body: JSON.stringify({
              accountType: accountType || "username",
              prefix: prefix.trim() || "user",
              startIndex: Number.isFinite(Number(startIndex)) ? Number(startIndex) : 1,
              count: Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : 1,
              password: batchPassword.trim() || "user123",
              displayNamePrefix,
              mobilePrefix,
              status,
              canAddFriend,
              canCreateGroup,
            }),
          }
        );
        toast.info(
          `成功 ${result.created.length} 个，跳过 ${result.skipped.length} 个`
        );
      }
      toast.success("用户已新增");
      onCreated();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "新增失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {mode === "single" ? "新增用户" : "批量添加用户"}
          </h3>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        {mode === "single" ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input
              value={account}
              onChange={e => setAccount(e.target.value)}
              placeholder="用户账号"
              className="admin-input"
            />
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="昵称"
              className="admin-input"
            />
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="初始密码（至少 6 位字母或数字）"
              className="admin-input"
            />
            <input
              value={mobilePhone}
              onChange={e => setMobilePhone(e.target.value)}
              placeholder="手机号码（可选）"
              className="admin-input"
            />
            <input
              value={inviteSource}
              onChange={e => setInviteSource(e.target.value)}
              placeholder="开户/邀请码来源"
              className="admin-input sm:col-span-2"
            />
            <select value={status} onChange={e => setStatus(e.target.value as UserStatus)} className="admin-input">
              <option value="Active">状态：正常</option>
              <option value="Disabled">状态：禁用</option>
            </select>
            <select value={canAddFriend ? "yes" : "no"} onChange={e => setCanAddFriend(e.target.value === "yes")} className="admin-input">
              <option value="yes">能否加好友：是</option>
              <option value="no">能否加好友：否</option>
            </select>
            <select value={canCreateGroup ? "yes" : "no"} onChange={e => setCanCreateGroup(e.target.value === "yes")} className="admin-input">
              <option value="yes">能否建群：是</option>
              <option value="no">能否建群：否</option>
            </select>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3">
              <label className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 用户名：</label>
              <div className="min-w-0 flex-1">
                <input value={prefix} onChange={e => setPrefix(e.target.value)} className="admin-input w-full" placeholder="请输入用户名，如 user" />
                <p className="mt-1 text-xs text-rose-500">请输入用户名前缀，系统会按序生成账号</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 登录密码：</label>
              <div className="min-w-0 flex-1">
                <input value={batchPassword} onChange={e => setBatchPassword(e.target.value)} type="password" className="admin-input w-full" placeholder="请输入登录密码（至少 6 位）" />
                <p className="mt-1 text-xs text-rose-500">请输入字母或数字密码</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 开始序号：</label>
              <input value={startIndex} onChange={e => setStartIndex(e.target.value)} type="number" min="0" className="admin-input min-w-0 flex-1" />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 添加数量：</label>
              <input value={count} onChange={e => setCount(e.target.value)} type="number" min="1" max="300" className="admin-input min-w-0 flex-1" />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 状态：</span>
              <div className="flex gap-6 text-sm">
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="batch-status" checked={status === "Active"} onChange={() => setStatus("Active")} className="accent-pink-500" />正常</label>
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="batch-status" checked={status === "Disabled"} onChange={() => setStatus("Disabled")} className="accent-pink-500" />禁用</label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 能否加好友：</span>
              <div className="flex gap-6 text-sm">
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="batch-friend" checked={canAddFriend} onChange={() => setCanAddFriend(true)} className="accent-pink-500" />是</label>
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="batch-friend" checked={!canAddFriend} onChange={() => setCanAddFriend(false)} className="accent-pink-500" />否</label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-sm text-slate-700"><span className="text-rose-500">*</span> 能否建群：</span>
              <div className="flex gap-6 text-sm">
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="batch-group" checked={canCreateGroup} onChange={() => setCanCreateGroup(true)} className="accent-pink-500" />是</label>
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="batch-group" checked={!canCreateGroup} onChange={() => setCanCreateGroup(false)} className="accent-pink-500" />否</label>
              </div>
            </div>
            <div className="mt-2 border-t border-slate-100 pt-2 text-center text-xs text-slate-500">示例：{prefix || "user"}001、{prefix || "user"}002；最多添加 300 个账号</div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="admin-secondary">
            取消
          </button>
          <button
            disabled={busy || (mode === "single" && (!account || !password)) || (mode === "batch" && (!prefix || !batchPassword || Number(count) < 1 || Number(count) > 300))}
            onClick={submit}
            className={mode === "batch" ? "w-full bg-pink-400 py-2.5 font-medium text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50" : "admin-primary !w-auto"}
          >
            {busy ? "处理中…" : "确认新增"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsPanel({
  refresh,
  title,
  path,
}: {
  refresh: number;
  title: string;
  path: string;
}) {
  const { data, loading } = useData<ModuleRecord[]>(path, refresh, []);
  return (
    <div>
      <PanelTitle
        title={title}
        description="查看账号、设备、IP、结果与失败原因。"
      />
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-4">时间</th>
                <th>账号</th>
                <th>结果</th>
                <th>IP</th>
                <th>设备/原因</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id} className="border-t">
                  <td className="p-4">{formatTime(item.createdAtUtc)}</td>
                  <td>@{item.data.account}</td>
                  <td>
                    <Status value={item.data.result || item.status} />
                  </td>
                  <td>{item.data.ip}</td>
                  <td className="max-w-xs truncate">
                    {item.data.device || item.data.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && <Empty text="暂无登录日志" />}
        </Card>
      )}
    </div>
  );
}

function RecordsTable({
  refresh,
  title,
  description,
  path,
}: {
  refresh: number;
  title: string;
  description: string;
  path: string;
}) {
  const { data, loading } = useData<ModuleRecord[]>(path, refresh, []);
  return (
    <div>
      <PanelTitle title={title} description={description} />
      {loading ? (
        <Loading />
      ) : (
        <div className="grid gap-4">
          {data.map(item => (
            <Card key={item.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{item.name}</h3>
                    <Status value={item.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                    {Object.entries(item.data).map(([key, value]) => (
                      <span key={key}>
                        <b className="font-medium text-slate-700">{key}：</b>
                        {value}
                      </span>
                    ))}
                  </div>
                </div>
                <time className="text-xs text-slate-400">
                  {formatTime(item.updatedAtUtc)}
                </time>
              </div>
            </Card>
          ))}
          {!data.length && (
            <Card>
              <Empty text="暂无记录" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FailureStats({ refresh }: { refresh: number }) {
  const { data, loading } = useData<
    {
      ip: string;
      accounts: string;
      count: number;
      lastAtUtc: string;
      lastReason: string;
    }[]
  >("/api/admin/login-failure-stats", refresh, []);
  return (
    <div>
      <PanelTitle
        title="登录失败IP统计"
        description="按来源 IP 汇总近期登录失败次数、涉及账号和最后失败原因。"
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map(item => (
            <Card key={item.ip}>
              <div className="flex items-center justify-between">
                <b>{item.ip}</b>
                <span className="text-2xl font-semibold text-rose-600">
                  {item.count}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                账号：{item.accounts}
              </p>
              <p className="mt-1 text-sm text-slate-500">{item.lastReason}</p>
              <p className="mt-2 text-xs text-slate-400">
                {formatTime(item.lastAtUtc)}
              </p>
            </Card>
          ))}
          {!data.length && (
            <Card>
              <Empty text="暂无失败记录" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackPanel({ refresh }: { refresh: number }) {
  const { data, loading, reload } = useData<ModuleRecord[]>(
    "/api/admin/modules/account.feedback",
    refresh,
    []
  );
  async function decide(id: string, status: string) {
    await api(`/api/admin/feedback/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({
        status,
        reply:
          status === "Resolved" ? "感谢反馈，问题已处理。" : "反馈已复核。",
      }),
    });
    reload();
  }
  return (
    <div>
      <PanelTitle
        title="意见反馈"
        description="查看用户意见，标记处理中、已解决或驳回。"
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="grid gap-4">
          {data.map(item => (
            <Card key={item.id}>
              <div className="flex justify-between">
                <div>
                  <h3 className="font-semibold">{item.name}</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    用户：{item.data.userId || "未知"} ·{" "}
                    {item.data.contact || "未留联系方式"}
                  </p>
                </div>
                <Status value={item.status} />
              </div>
              {item.status === "Submitted" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => decide(item.id, "Resolved")}
                    className="admin-action bg-teal-600 text-white"
                  >
                    处理完成
                  </button>
                  <button
                    onClick={() => decide(item.id, "Rejected")}
                    className="admin-action bg-slate-100"
                  >
                    驳回
                  </button>
                </div>
              )}
            </Card>
          ))}
          {!data.length && (
            <Card>
              <Empty text="暂无意见反馈" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function WalletPanel({ refresh }: { refresh: number }) {
  const { data: wallets, reload } = useData<
    { id: string; account: string; displayName: string; balance: string }[]
  >("/api/admin/wallets", refresh, []);
  const { data: transactions, reload: reloadTransactions } = useData<
    ModuleRecord[]
  >("/api/admin/modules/fund.adjustments", refresh, []);
  const [account, setAccount] = useState(""),
    [amount, setAmount] = useState(""),
    [subject, setSubject] = useState("人工调整"),
    [note, setNote] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/wallet/adjust", {
        method: "POST",
        body: JSON.stringify({
          account,
          amount: Number(amount),
          subject,
          note,
        }),
      });
      toast.success("额度已调整");
      setAmount("");
      reload();
      reloadTransactions();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "调整失败");
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
      <Card>
        <PanelTitle
          title="额度增减"
          description="调整会生成不可变交易流水和审计记录。"
        />
        <form onSubmit={submit} className="space-y-3">
          <select
            value={account}
            onChange={e => setAccount(e.target.value)}
            className="admin-input"
          >
            <option value="">选择用户</option>
            {wallets.map(x => (
              <option key={x.id} value={x.account}>
                {x.displayName} @{x.account} · {x.balance}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            type="number"
            step="0.01"
            placeholder="正数增加，负数扣减"
            className="admin-input"
          />
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="调整科目"
            className="admin-input"
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="备注"
            className="admin-input min-h-24"
          />
          <button disabled={!account || !amount} className="admin-primary">
            提交额度调整
          </button>
        </form>
      </Card>
      <div>
        <PanelTitle
          title="额度增减记录"
          description="最近 200 条后台调整流水。"
        />
        <div className="grid gap-3">
          {transactions.map(x => (
            <Card key={x.id}>
              <div className="flex justify-between">
                <b>@{x.data.account}</b>
                <span
                  className={
                    Number(x.data.amount) >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }
                >
                  {x.data.amount}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {x.name} · 余额 {x.data.balanceBefore} → {x.data.balanceAfter}
              </p>
            </Card>
          ))}
          {!transactions.length && (
            <Card>
              <Empty text="暂无调整记录" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function GenericRecordsPanel({
  refresh,
  title,
  description,
  module,
  field,
  fieldLabel,
  placeholder,
  runnable,
}: {
  refresh: number;
  title: string;
  description: string;
  module: string;
  field: string;
  fieldLabel: string;
  placeholder: string;
  runnable?: boolean;
}) {
  const { data, loading, reload } = useData<ModuleRecord[]>(
    `/api/admin/modules/${module}`,
    refresh,
    []
  );
  const [name, setName] = useState(""),
    [value, setValue] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/admin/modules/${module}`, {
        method: "POST",
        body: JSON.stringify({
          name,
          status: "Active",
          data: { [field]: value },
        }),
      });
      setName("");
      setValue("");
      toast.success("保存成功");
      reload();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "保存失败");
    }
  }
  async function remove(id: string) {
    await api(`/api/admin/modules/${module}/${id}`, { method: "DELETE" });
    reload();
  }
  async function run(id: string) {
    await api(`/api/admin/tasks/${id}/run`, { method: "POST" });
    toast.success("任务已执行并生成日志");
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <PanelTitle title={`新增${title}`} description={description} />
        <form onSubmit={submit} className="space-y-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`${title}名称`}
            className="admin-input"
          />
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            className="admin-input min-h-28"
            aria-label={fieldLabel}
          />
          <button disabled={!name || !value} className="admin-primary">
            保存
          </button>
        </form>
      </Card>
      <div>
        {loading ? (
          <Loading />
        ) : (
          <div className="grid gap-3">
            {data.map(item => (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{item.name}</h3>
                      <Status value={item.status} />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">
                      {item.data[field]}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      更新于 {formatTime(item.updatedAtUtc)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {runnable && (
                      <button
                        onClick={() => run(item.id)}
                        className="admin-mini bg-teal-50 text-teal-700"
                      >
                        立即执行
                      </button>
                    )}
                    <button
                      onClick={() => remove(item.id)}
                      className="admin-mini bg-rose-50 text-rose-700"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </Card>
            ))}
            {!data.length && (
              <Card>
                <Empty text={`暂无${title}`} />
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OperatorsPanel({ refresh }: { refresh: number }) {
  const { data, loading, reload } = useData<
    {
      id: string;
      account: string;
      displayName: string;
      role: string;
      status: string;
      tenantId?: string;
    }[]
  >("/api/admin/operators", refresh, []);
  const [account, setAccount] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("Operator"),
    [tenantId, setTenantId] = useState("a");
  const [totpProvisioning, setTotpProvisioning] = useState<{
    account: string;
    secret: string;
    provisioningUri: string;
  } | null>(null);
  const [tenantContext, setTenantContext] = useState<{ canSwitch: boolean; tenants: TenantOption[] }>({ canSwitch: false, tenants: [] });
  const [newTenant, setNewTenant] = useState({ name: "", code: "", adminAccount: "", adminPassword: "", adminDisplayName: "" });
  useEffect(() => {
    api<{ canSwitch: boolean; tenants: TenantOption[] }>("/api/admin/tenant-context")
      .then(value => {
        setTenantContext(value);
        if (value.canSwitch && value.tenants.length && !value.tenants.some(item => item.id === tenantId))
          setTenantId(value.tenants[0].id);
      })
      .catch(() => undefined);
  }, [refresh]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (
        !window.confirm(
          `确认创建管理账号 @${account.trim()} 并生成该账号的独立动态密码密钥吗？取消则不会创建账号或生成密钥。`
        )
      ) {
        return;
      }
      const result = await api<{
        user: { account: string };
        totpSecret: string;
        provisioningUri: string;
      }>("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ account, displayName, password, role, tenantId }),
      });
      setTotpProvisioning({
        account: result.user.account,
        secret: result.totpSecret,
        provisioningUri: result.provisioningUri,
      });
      setAccount("");
      setDisplayName("");
      setPassword("");
      reload();
      toast.success("管理账号已创建");
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "创建失败");
    }
  }
  async function enrollTotp(accountToEnroll: string) {
    try {
      const result = await api<{ secret: string; provisioningUri: string }>(
        `/api/admin/operators/${encodeURIComponent(accountToEnroll)}/totp/enroll`,
        { method: "POST" }
      );
      setTotpProvisioning({
        account: accountToEnroll,
        secret: result.secret,
        provisioningUri: result.provisioningUri,
      });
      toast.success(`@${accountToEnroll} 的独立动态密码已重新生成`);
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "动态密码生成失败");
    }
  }
  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/admin/tenants", { method: "POST", body: JSON.stringify(newTenant) });
      setNewTenant({ name: "", code: "", adminAccount: "", adminPassword: "", adminDisplayName: "" });
      const value = await api<{ canSwitch: boolean; tenants: TenantOption[] }>("/api/admin/tenant-context");
      setTenantContext(value);
      toast.success("租户和默认管理员已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建租户失败");
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      {tenantContext.canSwitch && (
        <Card className="xl:col-span-2">
          <PanelTitle title="新建租户" description="总后台创建租户后，会同时生成一个只能管理该租户的默认管理员。" />
          <form onSubmit={createTenant} className="grid gap-3 md:grid-cols-5">
            <input value={newTenant.name} onChange={e => setNewTenant(v => ({ ...v, name: e.target.value }))} placeholder="租户名称" className="admin-input" />
            <input value={newTenant.code} onChange={e => setNewTenant(v => ({ ...v, code: e.target.value }))} placeholder="租户代码，如 acme01" className="admin-input" />
            <input value={newTenant.adminAccount} onChange={e => setNewTenant(v => ({ ...v, adminAccount: e.target.value }))} placeholder="默认管理员账号" className="admin-input" />
            <input value={newTenant.adminDisplayName} onChange={e => setNewTenant(v => ({ ...v, adminDisplayName: e.target.value }))} placeholder="管理员昵称" className="admin-input" />
            <input value={newTenant.adminPassword} onChange={e => setNewTenant(v => ({ ...v, adminPassword: e.target.value }))} type="password" placeholder="默认管理员密码" className="admin-input" />
            <button disabled={!newTenant.name || !newTenant.code || !newTenant.adminAccount || newTenant.adminPassword.length < 8} className="admin-primary md:col-span-5">创建租户并生成默认管理员</button>
          </form>
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">租户</th><th className="p-2">代码</th><th className="p-2">默认管理员</th><th className="p-2">状态</th></tr></thead><tbody>{tenantContext.tenants.map(item => <tr key={item.id} className="border-b"><td className="p-2">{item.name}</td><td className="p-2">{item.code}</td><td className="p-2">{item.defaultAdminAccount || "—"}</td><td className="p-2">{item.enabled ? "已启用" : "已停用"}</td></tr>)}</tbody></table>
          </div>
        </Card>
      )}
      <Card>
        <PanelTitle
          title="新增管理账号"
          description="创建审核员、运营员或管理员账号。"
        />
        <form onSubmit={submit} className="space-y-3">
          <input
            value={account}
            onChange={e => setAccount(e.target.value)}
            placeholder="账号"
            className="admin-input"
          />
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="显示名称"
            className="admin-input"
          />
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type="password"
            placeholder="至少 8 位密码"
            className="admin-input"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="admin-input"
          >
            <option>Reviewer</option>
            <option>Operator</option>
            <option>Admin</option>
          </select>
          {tenantContext.canSwitch && <select value={tenantId} onChange={e => setTenantId(e.target.value)} className="admin-input">
            {tenantContext.tenants.map(item => <option key={item.id} value={item.id}>所属 {item.name}</option>)}
            <option value="*">所属总后台</option>
          </select>}
          <button
            disabled={!account || !displayName || password.length < 8}
            className="admin-primary"
          >
            创建账号
          </button>
        </form>
        {totpProvisioning && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">
              @{totpProvisioning.account} 的独立动态密码已生成
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              请立即将密钥绑定到该账号的验证器。密钥只在本次创建成功后显示。
            </p>
            <code className="mt-3 block select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-xs ring-1 ring-amber-200">
              {totpProvisioning.secret}
            </code>
            <button
              type="button"
              className="mt-3 text-xs font-medium text-teal-700 underline"
              onClick={() =>
                void navigator.clipboard?.writeText(
                  totpProvisioning.provisioningUri
                )
              }
            >
              复制验证器配置 URI
            </button>
          </div>
        )}
      </Card>
      <div>
        {loading ? (
          <Loading />
        ) : (
          <div className="grid gap-3">
            {data.map(x => (
              <Card key={x.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <b>{x.displayName}</b>
                    <p className="text-sm text-slate-500">@{x.account}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Status value={x.role} />
                    <Status value={x.status} />
                    <button
                      type="button"
                      className="text-xs font-medium text-teal-700 underline"
                      onClick={() => void enrollTotp(x.account)}
                    >
                      重置动态密码
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditPanel({ refresh }: { refresh: number }) {
  const { data, loading } = useData<Audit[]>(
    "/api/admin/audit?limit=300",
    refresh,
    []
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = data.filter(
    item =>
      !search ||
      item.adminAccount.includes(search) ||
      item.action.includes(search) ||
      item.targetId.includes(search) ||
      item.ipAddress.includes(search) ||
      item.address?.includes(search)
  );
  const pageSize = 20;
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div>
      <PanelTitle
        title="操作日志"
        description="记录所有关键管理操作的账号、目标、来源 IP 与详情。"
        action={
          <input
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="管理员 / 操作 / 目标 / IP / 地址"
            className="admin-filter-input"
          />
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-4">时间</th>
                <th>管理员</th>
                <th>操作</th>
                <th>目标</th>
                <th>详情</th>
                <th>IP</th>
                <th>地址</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(x => (
                <tr key={x.id} className="border-t">
                  <td className="p-4">{formatTime(x.createdAtUtc)}</td>
                  <td>{x.adminAccount}</td>
                  <td>
                    <code>{x.action}</code>
                  </td>
                  <td>
                    {x.targetType} · {x.targetId.slice(0, 10)}
                  </td>
                  <td className="max-w-xs truncate">{x.detail}</td>
                  <td>{x.ipAddress}</td>
                  <td>{x.address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
            <span>
              第 {page} / {Math.max(1, Math.ceil(filtered.length / pageSize))}{" "}
              页 · 共 {filtered.length} 条
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(value => value - 1)}
                className="admin-secondary"
              >
                上一页
              </button>
              <button
                disabled={page >= Math.ceil(filtered.length / pageSize)}
                onClick={() => setPage(value => value + 1)}
                className="admin-secondary"
              >
                下一页
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function ImagesPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useData<ModuleRecord[]>(
    "/api/admin/modules/system.images",
    refresh,
    []
  );
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ModuleRecord>();
  const [imageForm, setImageForm] = useState({
    name: "",
    category: "",
    tags: "",
  });
  const rows = data.filter(
    item =>
      !search ||
      item.name.includes(search) ||
      item.data.category?.includes(search) ||
      item.data.tags?.includes(search)
  );
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await authorizedFetch("/api/admin/images", {
        method: "POST",
        body,
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "上传失败");
      toast.success("图片已上传");
      reload();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "上传失败");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  async function saveImage() {
    if (!editing) return;
    await api(`/api/admin/images/${editing.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: imageForm.name,
        status: editing.status,
        data: { category: imageForm.category, tags: imageForm.tags },
      }),
    });
    setEditing(undefined);
    reload();
    toast.success("图片资料已更新");
  }
  async function deleteImage(item: ModuleRecord) {
    if (!window.confirm(`确定从图片库删除 ${item.name} 吗？`)) return;
    await api(`/api/admin/images/${item.id}`, { method: "DELETE" });
    reload();
  }
  return (
    <div>
      <PanelTitle
        title="图片上传"
        description="上传后台公告、运营素材和聊天配置图片。"
        action={
          <label className="admin-primary cursor-pointer">
            {busy ? "上传中…" : "选择图片"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={upload}
              className="hidden"
            />
          </label>
        }
      />
      <Card className="mb-4">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="搜索名称、分类或标签"
          className="admin-filter-input"
        />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(x => (
          <Card key={x.id}>
            <div className="aspect-video overflow-hidden rounded-xl bg-slate-100">
              <AuthenticatedMedia src={x.data.url} type="image" alt={x.name} />
            </div>
            <p className="mt-3 truncate font-medium">{x.name}</p>
            <p className="text-xs text-slate-400">
              {x.data.contentType} · {x.data.size} B
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {x.data.category || "未分类"} · {x.data.tags || "无标签"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setEditing(x);
                  setImageForm({
                    name: x.name,
                    category: x.data.category || "",
                    tags: x.data.tags || "",
                  });
                }}
                className="admin-secondary"
              >
                编辑
              </button>
              <button onClick={() => deleteImage(x)} className="admin-danger">
                删除
              </button>
            </div>
          </Card>
        ))}
        {!rows.length && (
          <Card>
            <Empty text="暂无运营图片" />
          </Card>
        )}
      </div>
      {editing && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">编辑图片资料</h3>
              <button onClick={() => setEditing(undefined)} aria-label="关闭">
                <X />
              </button>
            </div>
            <input
              value={imageForm.name}
              onChange={event =>
                setImageForm(value => ({ ...value, name: event.target.value }))
              }
              placeholder="图片名称"
              className="admin-input"
            />
            <input
              value={imageForm.category}
              onChange={event =>
                setImageForm(value => ({
                  ...value,
                  category: event.target.value,
                }))
              }
              placeholder="分类"
              className="admin-input mt-3"
            />
            <input
              value={imageForm.tags}
              onChange={event =>
                setImageForm(value => ({ ...value, tags: event.target.value }))
              }
              placeholder="标签，使用逗号分隔"
              className="admin-input mt-3"
            />
            <button onClick={saveImage} className="admin-primary mt-4">
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationsPanel({
  refresh,
  groupsOnly,
}: {
  refresh: number;
  groupsOnly: boolean;
}) {
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const { data, loading, reload } = useData<Conversation[]>(
    "/api/admin/conversations",
    refresh,
    []
  );
  const rows = groupsOnly ? data.filter(x => x.type === "Group") : data;
  async function action(item: Conversation) {
    await api(`/api/admin/conversations/${item.id}/action`, {
      method: "POST",
      body: JSON.stringify({
        action: item.isDissolved ? "restore" : "dissolve",
        note: "管理后台操作",
      }),
    });
    reload();
  }
  async function assignTenant(item: Conversation, nextTenant: string) {
    try {
      await api(`/api/admin/conversations/${item.id}/tenant`, {
        method: "PUT",
        body: JSON.stringify({ tenantId: nextTenant }),
      });
      toast.success("群组及历史消息归属已更新");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "群组归属更新失败");
    }
  }
  return (
    <div>
      <PanelTitle
        title={groupsOnly ? "群监控" : "会话管理"}
        description={
          groupsOnly
            ? "监控群规模、消息序号和解散状态。"
            : "查看单聊、群聊与系统会话运行状态。"
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <div className="grid gap-3">
          {rows.map(x => (
            <Card key={x.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <b>
                      {x.name ||
                        (x.type === "Direct" ? "单聊会话" : "未命名会话")}
                    </b>
                    <Status value={x.isDissolved ? "Dissolved" : "Active"} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {x.type} · {x.memberCount} 人 · {x.lastSequence} 条消息 ·{" "}
                    {formatTime(x.lastMessageAtUtc)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    当前归属：{x.tenantId === "a" ? "A后台" : x.tenantId === "b" ? "B后台" : "未分配"}
                  </p>
                </div>
                {x.type === "Group" && (
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={x.tenantId || "unassigned"}
                      onChange={event => assignTenant(x, event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                      aria-label="分配群组后台"
                    >
                      <option value="a">A后台</option>
                      <option value="b">B后台</option>
                      <option value="unassigned">未分配</option>
                    </select>
                    <button
                      onClick={() => setSelectedConversationId(x.id)}
                      className="admin-action inline-flex items-center gap-2 bg-teal-50 text-teal-700"
                    >
                      <MessageCircleMore size={16} /> 查看聊天记录
                    </button>
                    <button
                      onClick={() => action(x)}
                      className={`admin-action ${x.isDissolved ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                    >
                      {x.isDissolved ? "恢复群聊" : "解散群聊"}
                    </button>
                  </div>
                )}
                {x.type !== "Group" && (
                  <button
                    onClick={() => setSelectedConversationId(x.id)}
                    className="admin-action inline-flex items-center gap-2 bg-teal-50 text-teal-700"
                  >
                    <MessageCircleMore size={16} /> 查看聊天记录
                  </button>
                )}
              </div>
            </Card>
          ))}
          {!rows.length && (
            <Card>
              <Empty text="暂无会话数据" />
            </Card>
          )}
        </div>
      )}
      {selectedConversationId && (
        <AdminChatRecordsPanel
          conversationId={selectedConversationId}
          refresh={refresh}
          onClose={() => setSelectedConversationId(undefined)}
        />
      )}
    </div>
  );
}

function AdminChatRecordsPanel({
  conversationId,
  refresh,
  onClose,
}: {
  conversationId: string;
  refresh: number;
  onClose: () => void;
}) {
  const { data, loading } = useData<AdminConversationMessages | null>(
    `/api/admin/conversations/${conversationId}/messages?limit=200`,
    refresh,
    null
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [data]);
  const memberMap = useMemo(
    () => new Map((data?.members ?? []).map(member => [member.userId, member])),
    [data?.members]
  );
  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <h3 className="font-semibold">
            {data?.conversation.name || "聊天记录"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            与前台会话框一致的头像、昵称、时间和气泡排版
          </p>
        </div>
        <button onClick={onClose} className="admin-filter-button" aria-label="关闭聊天记录">
          <X size={16} />
        </button>
      </div>
      <div ref={viewportRef} className="max-h-[620px] min-h-64 space-y-4 overflow-y-auto bg-[#f2f4f6] px-4 py-6 md:px-8">
        {loading ? (
          <Loading />
        ) : data?.messages.length ? (
          data.messages.map(message => {
            const member = memberMap.get(message.senderId);
            const name = message.displayName || member?.displayName || message.account || member?.account || "未知用户";
            const isRight = data.conversation.type === "Direct" && message.senderId === data.members.at(-1)?.userId;
            const kindLabel: Record<string, string> = { Image: "[图片]", Video: "[视频]", Voice: "[语音]", File: "[文件]", Emoji: "[表情]" };
            const content = message.plaintextAvailable && message.content?.trim()
              ? message.content
              : kindLabel[message.kind] || (message.state === "Recalled" ? "消息已撤回" : "加密消息");
            return (
              <div key={message.id} className={`flex items-end gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
                {!isRight && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-300 text-sm font-semibold text-slate-700">{name.slice(0, 1)}</div>}
                <div className={`flex max-w-[82%] flex-col ${isRight ? "items-end" : "items-start"}`}>
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{name}</span>
                    <span>{formatTime(message.sentAtUtc)}</span>
                  </div>
                  <div className={`rounded-[20px] px-4 py-3 text-sm leading-6 shadow-sm ${message.state === "Recalled" ? "bg-transparent text-slate-400" : isRight ? "rounded-br-md bg-teal-500 text-white" : "rounded-bl-md bg-white text-slate-800"}`}>
                    <span className="whitespace-pre-wrap break-words">{content}</span>
                  </div>
                </div>
                {isRight && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-200 text-sm font-semibold text-teal-800">{name.slice(0, 1)}</div>}
              </div>
            );
          })
        ) : (
          <Empty text="暂无聊天记录" />
        )}
      </div>
    </Card>
  );
}

function ContactsPanel({ refresh }: { refresh: number }) {
  const { data, loading } = useData<
    {
      id: string;
      user: string;
      peer: string;
      status: string;
      remark: string;
      updatedAtUtc: string;
    }[]
  >("/api/admin/contacts", refresh, []);
  return (
    <div>
      <PanelTitle
        title="通讯录"
        description="查看用户之间的好友、屏蔽和删除关系。"
      />
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-4">用户</th>
                <th>联系人</th>
                <th>关系</th>
                <th>备注</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {data.map(x => (
                <tr key={x.id} className="border-t">
                  <td className="p-4">@{x.user}</td>
                  <td>@{x.peer}</td>
                  <td>
                    <Status value={x.status} />
                  </td>
                  <td>{x.remark || "—"}</td>
                  <td>{formatTime(x.updatedAtUtc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && <Empty text="暂无通讯录关系" />}
        </Card>
      )}
    </div>
  );
}

function BulkPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useData<ModuleRecord[]>(
    "/api/admin/modules/chat.bulk-messages",
    refresh,
    []
  );
  const [content, setContent] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/bulk-messages", {
        method: "POST",
        body: JSON.stringify({ audience: "all", content }),
      });
      setContent("");
      reload();
      toast.success("群发通知已通过 SignalR 下发");
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "发送失败");
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
      <Card>
        <PanelTitle title="群发言" description="向全部正常用户发送后台通知。" />
        <form onSubmit={send}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={1000}
            placeholder="输入群发内容"
            className="admin-input min-h-40"
          />
          <button
            disabled={!content.trim()}
            className="admin-primary mt-3 flex items-center justify-center gap-2"
          >
            <Send size={17} />
            发送给全部用户
          </button>
        </form>
      </Card>
      <RecordsInline data={data} />
    </div>
  );
}
function RecordsInline({ data }: { data: ModuleRecord[] }) {
  return (
    <div className="grid content-start gap-3">
      {data.map(x => (
        <Card key={x.id}>
          <div className="flex justify-between">
            <b>{x.name}</b>
            <Status value={x.status} />
          </div>
          <p className="mt-2 text-sm text-slate-500">{x.data.content}</p>
          <p className="mt-2 text-xs text-slate-400">
            目标 {x.data.targetCount} 人 · {formatTime(x.createdAtUtc)}
          </p>
        </Card>
      ))}
      {!data.length && (
        <Card>
          <Empty text="暂无群发记录" />
        </Card>
      )}
    </div>
  );
}


type PlatformTenant = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  defaultAdminAccount: string;
  userCount: number;
  createdAtUtc: string;
};
type PlatformDomain = { id: string; tenantId: string; domain: string; enabled: boolean; createdAtUtc: string };
type PlatformApp = { id: string; name: string; packageName: string; domain: string; tenantId: string; enabled: boolean; createdAtUtc: string };

function PlatformManagementPanel({ refresh, tab }: { refresh: number; tab: "tenants" | "domains" | "apps" }) {
  const tenants = useData<PlatformTenant[]>("/api/admin/platform/tenants", refresh, []);
  const domains = useData<PlatformDomain[]>("/api/admin/platform/domains", refresh, []);
  const apps = useData<PlatformApp[]>("/api/admin/platform/apps", refresh, []);
  const [tenantForm, setTenantForm] = useState({ name: "", code: "", adminAccount: "", adminPassword: "", adminDisplayName: "" });
  const [domainForm, setDomainForm] = useState({ tenantId: "", domain: "" });
  const [appForm, setAppForm] = useState({ name: "", packageName: "", domain: "", tenantId: "" });

  useEffect(() => {
    if (!domainForm.tenantId && tenants.data[0]) setDomainForm(value => ({ ...value, tenantId: tenants.data[0].id }));
    if (!appForm.tenantId && tenants.data[0]) setAppForm(value => ({ ...value, tenantId: tenants.data[0].id }));
  }, [tenants.data, domainForm.tenantId, appForm.tenantId]);

  async function reloadAll() {
    await Promise.all([tenants.reload(), domains.reload(), apps.reload()]);
  }
  async function submitTenant(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/admin/tenants", { method: "POST", body: JSON.stringify(tenantForm) });
      setTenantForm({ name: "", code: "", adminAccount: "", adminPassword: "", adminDisplayName: "" });
      await reloadAll(); toast.success("租户和默认管理员已创建");
    } catch (error) { toast.error(error instanceof Error ? error.message : "创建租户失败"); }
  }
  async function editTenant(item: PlatformTenant) {
    const name = window.prompt("租户名称", item.name);
    if (!name) return;
    try { await api(`/api/admin/platform/tenants/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ name, enabled: item.enabled }) }); await tenants.reload(); toast.success("租户已修改"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "修改失败"); }
  }
  async function toggleTenant(item: PlatformTenant) {
    try { await api(`/api/admin/platform/tenants/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ name: item.name, enabled: !item.enabled }) }); await tenants.reload(); toast.success(item.enabled ? "租户已禁用" : "租户已启用"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "操作失败"); }
  }
  async function deleteTenant(item: PlatformTenant) {
    if (!window.confirm(`确认删除租户“${item.name}”吗？有用户的租户不能删除。`)) return;
    try { await api(`/api/admin/platform/tenants/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await reloadAll(); toast.success("租户已删除"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "删除失败"); }
  }
  async function submitDomain(event: React.FormEvent) {
    event.preventDefault();
    try { await api("/api/admin/platform/domains", { method: "POST", body: JSON.stringify(domainForm) }); setDomainForm(value => ({ ...value, domain: "" })); await domains.reload(); toast.success("域名已添加"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "添加域名失败"); }
  }
  async function editDomain(item: PlatformDomain) {
    const domain = window.prompt("域名", item.domain); if (!domain) return;
    try { await api(`/api/admin/platform/domains/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ tenantId: item.tenantId, domain, enabled: item.enabled }) }); await domains.reload(); toast.success("域名已修改"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "修改失败"); }
  }
  async function deleteDomain(item: PlatformDomain) {
    if (!window.confirm(`确认删除域名 ${item.domain} 吗？`)) return;
    try { await api(`/api/admin/platform/domains/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await domains.reload(); toast.success("域名已删除"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "删除失败"); }
  }
  async function submitApp(event: React.FormEvent) {
    event.preventDefault();
    try { await api("/api/admin/platform/apps", { method: "POST", body: JSON.stringify(appForm) }); setAppForm(value => ({ ...value, name: "", packageName: "", domain: "" })); await apps.reload(); toast.success("APP已添加"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "添加 APP 失败"); }
  }
  async function editApp(item: PlatformApp) {
    const name = window.prompt("APP名称", item.name); if (!name) return;
    const domain = window.prompt("APP域名", item.domain) ?? item.domain;
    try { await api(`/api/admin/platform/apps/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ name, packageName: item.packageName, domain, tenantId: item.tenantId, enabled: item.enabled }) }); await apps.reload(); toast.success("APP已修改"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "修改失败"); }
  }
  async function deleteApp(item: PlatformApp) {
    if (!window.confirm(`确认删除 APP“${item.name}”吗？`)) return;
    try { await api(`/api/admin/platform/apps/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await apps.reload(); toast.success("APP已删除"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "删除失败"); }
  }
  const tenantName = (id: string) => tenants.data.find(item => item.id === id)?.name || id || "未分配";
  return <div className="grid gap-5">
    {tab === "tenants" && <>
      <Card><PanelTitle title="新建租户" description="创建租户时同时生成该租户的默认管理员；默认管理员只能管理本租户。" /><form onSubmit={submitTenant} className="grid gap-3 md:grid-cols-5">
        <input className="admin-input" placeholder="租户名称" value={tenantForm.name} onChange={e => setTenantForm(v => ({ ...v, name: e.target.value }))} />
        <input className="admin-input" placeholder="租户代码，如 company01" value={tenantForm.code} onChange={e => setTenantForm(v => ({ ...v, code: e.target.value }))} />
        <input className="admin-input" placeholder="默认管理员账号" value={tenantForm.adminAccount} onChange={e => setTenantForm(v => ({ ...v, adminAccount: e.target.value }))} />
        <input className="admin-input" placeholder="默认管理员昵称" value={tenantForm.adminDisplayName} onChange={e => setTenantForm(v => ({ ...v, adminDisplayName: e.target.value }))} />
        <input className="admin-input" type="password" placeholder="默认管理员密码（至少8位）" value={tenantForm.adminPassword} onChange={e => setTenantForm(v => ({ ...v, adminPassword: e.target.value }))} />
        <button className="admin-primary md:col-span-5" disabled={!tenantForm.name || !tenantForm.code || !tenantForm.adminAccount || tenantForm.adminPassword.length < 8}>新建租户并生成默认管理员</button>
      </form></Card>
      <Card><PanelTitle title="租户列表" description="禁用后可保留数据但停止使用；已有用户的租户不能删除。" /><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">名称</th><th className="p-2">代码</th><th className="p-2">默认管理员</th><th className="p-2">用户数</th><th className="p-2">状态</th><th className="p-2">操作</th></tr></thead><tbody>{tenants.data.map(item => <tr key={item.id} className="border-b"><td className="p-2">{item.name}</td><td className="p-2">{item.code}</td><td className="p-2">{item.defaultAdminAccount}</td><td className="p-2">{item.userCount}</td><td className="p-2">{item.enabled ? "启用" : "禁用"}</td><td className="flex gap-2 p-2"><button className="admin-mini bg-slate-100" onClick={() => editTenant(item)}>修改</button><button className="admin-mini bg-amber-50 text-amber-700" onClick={() => toggleTenant(item)}>{item.enabled ? "禁用" : "启用"}</button><button className="admin-mini bg-rose-50 text-rose-700" onClick={() => deleteTenant(item)}>删除</button></td></tr>)}</tbody></table></div></Card>
    </>}
    {tab === "domains" && <>
      <Card><PanelTitle title="新增域名" description="将租户域名绑定到指定租户。" /><form onSubmit={submitDomain} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select className="admin-input" value={domainForm.tenantId} onChange={e => setDomainForm(v => ({ ...v, tenantId: e.target.value }))}>{tenants.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className="admin-input" placeholder="example.com" value={domainForm.domain} onChange={e => setDomainForm(v => ({ ...v, domain: e.target.value }))} /><button className="admin-primary">添加域名</button></form></Card>
      <Card><PanelTitle title="域名列表" description="支持修改和删除。" /><div className="grid gap-2">{domains.data.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 border-b p-3"><span className="min-w-[220px] font-medium">{item.domain}</span><span className="text-sm text-slate-500">{tenantName(item.tenantId)}</span><span className="text-sm">{item.enabled ? "启用" : "禁用"}</span><button className="admin-mini ml-auto bg-slate-100" onClick={() => editDomain(item)}>修改</button><button className="admin-mini bg-rose-50 text-rose-700" onClick={() => deleteDomain(item)}>删除</button></div>)}</div></Card>
    </>}
    {tab === "apps" && <>
      <Card><PanelTitle title="新增 APP" description="维护 APP 名称、包名和绑定域名。" /><form onSubmit={submitApp} className="grid gap-3 md:grid-cols-4"><input className="admin-input" placeholder="APP名称" value={appForm.name} onChange={e => setAppForm(v => ({ ...v, name: e.target.value }))} /><input className="admin-input" placeholder="APP包名，如 com.example.app" value={appForm.packageName} onChange={e => setAppForm(v => ({ ...v, packageName: e.target.value }))} /><input className="admin-input" placeholder="域名" value={appForm.domain} onChange={e => setAppForm(v => ({ ...v, domain: e.target.value }))} /><select className="admin-input" value={appForm.tenantId} onChange={e => setAppForm(v => ({ ...v, tenantId: e.target.value }))}><option value="unassigned">未分配</option>{tenants.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="admin-primary md:col-span-4" disabled={!appForm.name || !appForm.packageName}>新增 APP</button></form></Card>
      <Card><PanelTitle title="APP列表" description="支持修改和删除。" /><div className="grid gap-2">{apps.data.map(item => <div key={item.id} className="grid gap-2 border-b p-3 md:grid-cols-[1fr_1.2fr_1fr_1fr_auto_auto]"><span>{item.name}</span><span className="text-sm text-slate-500">{item.packageName}</span><span className="text-sm text-slate-500">{item.domain || "—"}</span><span className="text-sm">{tenantName(item.tenantId)}</span><button className="admin-mini bg-slate-100" onClick={() => editApp(item)}>修改</button><button className="admin-mini bg-rose-50 text-rose-700" onClick={() => deleteApp(item)}>删除</button></div>)}</div></Card>
    </>}
  </div>;
}


type PlatformRoleItem = { id: string; name: string; description: string; enabled?: boolean; status?: string; platformPermissions: string[]; tenantPermissions: string[] };
type PlatformAccountItem = { id: string; account: string; displayName: string; status: string; platformRoleId: string };
const platformPermissionOptions = [{ key: "platform:accounts:read", label: "查看平台账号" }, { key: "platform:accounts:write", label: "管理平台账号" }, { key: "platform:roles:read", label: "查看平台角色" }, { key: "platform:roles:write", label: "管理平台角色" }, { key: "platform:tenants:read", label: "查看租户" }, { key: "platform:tenants:write", label: "管理租户" }, { key: "platform:domains:write", label: "管理租户域名" }, { key: "platform:apps:write", label: "管理 APP" }];
const tenantPermissionOptions = [{ key: "users:read", label: "查看用户" }, { key: "users:write", label: "管理用户" }, { key: "logs:read", label: "查看日志" }, { key: "operators:read", label: "查看后台账号" }, { key: "operators:write", label: "管理后台账号" }, { key: "announcements:write", label: "管理公告" }, { key: "conversations:read", label: "查看会话和聊天记录" }, { key: "groups:write", label: "管理群组" }, { key: "robots:write", label: "管理机器人" }, { key: "audit:read", label: "查看审计日志" }];

function PlatformAccessPanel({ refresh, tab }: { refresh: number; tab: "accounts" | "roles" }) {
  const accounts = useData<PlatformAccountItem[]>("/api/admin/platform/accounts", refresh, []);
  const roles = useData<PlatformRoleItem[]>("/api/admin/platform/roles", refresh, []);
  const [account, setAccount] = useState({ account: "", password: "", displayName: "", roleId: "" });
  const [role, setRole] = useState({ name: "", description: "", platformPermissions: [] as string[], tenantPermissions: [] as string[] });
  const roleName = (id: string) => roles.data.find(x => x.id === id)?.name || "未绑定";
  const toggle = (key: "platformPermissions" | "tenantPermissions", value: string) => setRole(v => ({ ...v, [key]: v[key].includes(value) ? v[key].filter(x => x !== value) : [...v[key], value] }));
  async function createAccount(event: React.FormEvent) { event.preventDefault(); try { await api("/api/admin/platform/accounts", { method: "POST", body: JSON.stringify(account) }); setAccount({ account: "", password: "", displayName: "", roleId: "" }); await accounts.reload(); toast.success("平台账号已添加"); } catch (e) { toast.error(e instanceof Error ? e.message : "添加失败"); } }
  async function editAccount(item: PlatformAccountItem) { const displayName = window.prompt("显示名称", item.displayName); if (!displayName) return; const roleId = window.prompt(`角色 ID（当前：${roleName(item.platformRoleId)}）`, item.platformRoleId) ?? item.platformRoleId; const password = window.prompt("新密码（留空表示不修改）", "") ?? ""; try { await api(`/api/admin/platform/accounts/${item.id}`, { method: "PUT", body: JSON.stringify({ displayName, roleId, password, enabled: item.status === "Active" }) }); await accounts.reload(); toast.success("平台账号已修改"); } catch (e) { toast.error(e instanceof Error ? e.message : "修改失败"); } }
  async function toggleAccount(item: PlatformAccountItem) { try { await api(`/api/admin/platform/accounts/${item.id}`, { method: "PUT", body: JSON.stringify({ displayName: item.displayName, roleId: item.platformRoleId, enabled: item.status !== "Active" }) }); await accounts.reload(); toast.success("账号状态已更新"); } catch (e) { toast.error(e instanceof Error ? e.message : "操作失败"); } }
  async function removeAccount(item: PlatformAccountItem) { if (!window.confirm(`确认禁用平台账号 ${item.account} 吗？`)) return; try { await api(`/api/admin/platform/accounts/${item.id}`, { method: "DELETE" }); await accounts.reload(); toast.success("平台账号已禁用"); } catch (e) { toast.error(e instanceof Error ? e.message : "操作失败"); } }
  async function createRole(event: React.FormEvent) { event.preventDefault(); try { await api("/api/admin/platform/roles", { method: "POST", body: JSON.stringify(role) }); setRole({ name: "", description: "", platformPermissions: [], tenantPermissions: [] }); await roles.reload(); toast.success("平台角色已添加"); } catch (e) { toast.error(e instanceof Error ? e.message : "添加失败"); } }
  async function editRole(item: PlatformRoleItem) { const name = window.prompt("角色名称", item.name); if (!name) return; try { await api(`/api/admin/platform/roles/${item.id}`, { method: "PUT", body: JSON.stringify({ name, description: item.description, platformPermissions: item.platformPermissions, tenantPermissions: item.tenantPermissions, enabled: item.status !== "Disabled" }) }); await roles.reload(); toast.success("角色已修改"); } catch (e) { toast.error(e instanceof Error ? e.message : "修改失败"); } }
  async function removeRole(item: PlatformRoleItem) { if (!window.confirm(`确认删除角色“${item.name}”吗？`)) return; try { await api(`/api/admin/platform/roles/${item.id}`, { method: "DELETE" }); await roles.reload(); toast.success("角色已删除"); } catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); } }
  return <div className="grid gap-5">
    {tab === "accounts" ? <>
      <Card><PanelTitle title="新增平台账号" description="平台账号只能进入总后台；通过角色绑定平台管理权限和租户后台权限。" /><form onSubmit={createAccount} className="grid gap-3 md:grid-cols-4"><input className="admin-input" placeholder="账号" value={account.account} onChange={e => setAccount(v => ({ ...v, account: e.target.value }))} /><input className="admin-input" placeholder="至少 8 位密码" type="password" value={account.password} onChange={e => setAccount(v => ({ ...v, password: e.target.value }))} /><input className="admin-input" placeholder="显示名称" value={account.displayName} onChange={e => setAccount(v => ({ ...v, displayName: e.target.value }))} /><select className="admin-input" value={account.roleId} onChange={e => setAccount(v => ({ ...v, roleId: e.target.value }))}><option value="">未绑定角色</option>{roles.data.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="admin-primary md:col-span-4" disabled={!account.account || account.password.length < 8 || !account.displayName}>添加平台账号</button></form></Card>
      <Card><PanelTitle title="平台账号列表" description="支持修改显示名称、重新绑定角色、启用/禁用和删除（删除会安全禁用账号）。" /><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">账号</th><th className="p-2">名称</th><th className="p-2">角色</th><th className="p-2">状态</th><th className="p-2">操作</th></tr></thead><tbody>{accounts.data.map(x => <tr key={x.id} className="border-b"><td className="p-2">{x.account}</td><td className="p-2">{x.displayName}</td><td className="p-2">{roleName(x.platformRoleId)}</td><td className="p-2">{x.status === "Active" ? "启用" : "禁用"}</td><td className="flex gap-2 p-2"><button className="admin-mini bg-slate-100" onClick={() => editAccount(x)}>修改</button><button className="admin-mini bg-amber-50 text-amber-700" onClick={() => toggleAccount(x)}>{x.status === "Active" ? "禁用" : "启用"}</button><button className="admin-mini bg-rose-50 text-rose-700" onClick={() => removeAccount(x)}>删除</button></td></tr>)}</tbody></table></div></Card>
    </> : <>
      <Card><PanelTitle title="新增平台角色" description="平台权限控制租户创建、域名、APP、平台账号和角色；租户权限控制进入租户后台后的具体功能。" /><form onSubmit={createRole} className="grid gap-3"><input className="admin-input" placeholder="角色名称" value={role.name} onChange={e => setRole(v => ({ ...v, name: e.target.value }))} /><input className="admin-input" placeholder="角色说明" value={role.description} onChange={e => setRole(v => ({ ...v, description: e.target.value }))} /><fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">平台管理权限</legend><div className="grid gap-2 md:grid-cols-4">{platformPermissionOptions.map(x => <label key={x.key} className="flex gap-2 text-sm"><input type="checkbox" checked={role.platformPermissions.includes(x.key)} onChange={() => toggle("platformPermissions", x.key)} />{x.label}</label>)}</div></fieldset><fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">租户后台权限</legend><div className="grid gap-2 md:grid-cols-4">{tenantPermissionOptions.map(x => <label key={x.key} className="flex gap-2 text-sm"><input type="checkbox" checked={role.tenantPermissions.includes(x.key)} onChange={() => toggle("tenantPermissions", x.key)} />{x.label}</label>)}</div></fieldset><button className="admin-primary" disabled={!role.name}>添加角色</button></form></Card>
      <Card><PanelTitle title="平台角色列表" description="角色可修改、删除；已绑定平台账号的角色不能删除。" /><div className="grid gap-3">{roles.data.map(x => <div key={x.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><b>{x.name}</b><span className="text-sm text-slate-500">平台 {x.platformPermissions.length} 项 · 租户 {x.tenantPermissions.length} 项</span></div><p className="mt-1 text-sm text-slate-500">{x.description || "暂无说明"}</p><div className="mt-3 flex gap-2"><button className="admin-mini bg-slate-100" onClick={() => editRole(x)}>修改</button><button className="admin-mini bg-rose-50 text-rose-700" onClick={() => removeRole(x)}>删除</button></div></div>)}</div></Card>
    </>}
  </div>;
}
