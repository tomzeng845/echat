import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
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
  WalletCards,
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
  GroupInvitesPanel as DocGroupInvitesPanel,
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
  | "accountLocked"
  | "loginLocked"
  | "bankCardLocked"
  | "cancellationEnabled"
  | "redFlagged"
  | "password";
type PageId =
  | "home"
  | "account-users"
  | "account-login"
  | "account-offline"
  | "account-failures"
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
  account: string;
  displayName: string;
  role: string;
  status: UserStatus;
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
};
type AdminUserPage = {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  type: "Direct" | "Group" | "System";
  name: string;
  createdBy: string;
  memberCount: number;
  lastSequence: number;
  lastMessageAtUtc?: string;
  isDissolved: boolean;
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
    id: "account",
    label: "账户系统",
    icon: Users,
    children: [
      { id: "account-users", label: "用户管理" },
      { id: "account-login", label: "登录日志" },
      { id: "account-offline", label: "离线日志" },
      { id: "account-failures", label: "登录失败IP统计" },
      { id: "account-feedback", label: "意见反馈" },
      { id: "account-invites", label: "邀请码设置" },
    ],
  },
  {
    id: "fund",
    label: "资金系统",
    icon: WalletCards,
    children: [
      { id: "fund-subjects", label: "额度增减科目" },
      { id: "fund-adjust", label: "额度增减记录" },
      { id: "fund-transactions", label: "交易明细" },
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
      { id: "chat-bulk", label: "群发言" },
      { id: "chat-robots", label: "机器人发信息" },
      { id: "chat-redpacket", label: "抢红包机器人" },
      { id: "chat-group-invites", label: "群邀请码" },
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
  useEffect(() => {
    document.title = "E聊管理后台";
    return () => {
      document.title = "E聊";
    };
  }, []);
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
    <main className="min-h-full bg-[#f2f4f6] text-slate-900">
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
          {groups.map(group => (
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
  if (page === "account-users")
    return <UsersPanel refresh={refresh} currentUserId={currentUserId} />;
  if (page === "account-login") return <DocLogsPanel refresh={refresh} />;
  if (page === "account-offline")
    return <DocLogsPanel refresh={refresh} offline />;
  if (page === "account-failures")
    return <DocFailureIpPanel refresh={refresh} />;
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
  const [operation, setOperation] = useState<{
    user: AdminUser;
    kind: UserOperationKind;
  }>();
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
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[3600px] border-collapse text-left text-xs">
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
                  <th colSpan={2} className="border-l border-slate-300 p-2">
                    额度信息
                  </th>
                  <th colSpan={10} className="border-l border-slate-300 p-2">
                    状态信息
                  </th>
                  <th colSpan={12} className="border-l border-slate-300 p-2">
                    其他信息
                  </th>
                </tr>
                <tr className="border-b border-slate-300">
                  {[
                    "用户ID",
                    "风险1",
                    "风险2",
                    "用户账号",
                    "昵称",
                    "手机号码",
                    "账户余额",
                    "冻结金额",
                    "在线状态",
                    "账号锁定",
                    "登录锁定",
                    "银行卡锁定",
                    "注销状态",
                    "实名认证",
                    "企业认证",
                    "今日上线",
                    "红号",
                    "角色",
                    "注册来源",
                    "邀请码来源",
                    "注册时间",
                    "登录密码修改时间",
                    "最后上线时间",
                    "最后登录地址",
                    "最后在线IP",
                    "最后节点IP",
                    "登录失败次数",
                    "设备数",
                    "登录IP限制",
                    "账户状态",
                  ].map(label => (
                    <th
                      key={label}
                      className="whitespace-nowrap border-l border-slate-200 px-2 py-2 font-medium"
                    >
                      {label}
                    </th>
                  ))}
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
                                    onClick={() =>
                                      openOperation(user, "bankCardLocked")
                                    }
                                  >
                                    {user.bankCardLocked
                                      ? "解除银行卡锁定"
                                      : "银行卡锁定"}
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
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => openOperation(user, "password")}
                            >
                              <KeyRound size={14} />
                              登录密码
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2" title={user.id}>
                      {user.id.slice(0, 8)}
                    </td>
                    <td className="px-2">{user.riskLevel1}</td>
                    <td className="px-2">{user.riskLevel2}</td>
                    <td className="px-2 font-medium">{user.account}</td>
                    <td className="px-2">{user.displayName}</td>
                    <td className="px-2">{user.mobilePhone || "—"}</td>
                    <td className="px-2 tabular-nums">
                      {Number(user.accountBalance).toFixed(2)}
                    </td>
                    <td className="px-2 tabular-nums">
                      {Number(user.frozenBalance).toFixed(2)}
                    </td>
                    <td className="px-2">
                      {badge(user.online, "在线", "离线")}
                    </td>
                    <td className="px-2">
                      {badge(user.accountLocked, "已锁定", "未锁定")}
                    </td>
                    <td className="px-2">
                      {badge(user.loginLocked, "已锁定", "未锁定")}
                    </td>
                    <td className="px-2">
                      {badge(user.bankCardLocked, "已锁定", "未锁定")}
                    </td>
                    <td className="px-2">
                      {badge(user.cancellationEnabled, "已开启", "正常")}
                    </td>
                    <td className="px-2">
                      <button
                        onClick={() =>
                          setVerification({ user, type: "RealName" })
                        }
                        title="查看实名认证详情"
                      >
                        {badge(user.realNameVerified, "已认证", "未认证")}
                      </button>
                    </td>
                    <td className="px-2">
                      <button
                        onClick={() =>
                          setVerification({ user, type: "Enterprise" })
                        }
                        title="查看企业认证详情"
                      >
                        {badge(user.enterpriseVerified, "已认证", "未认证")}
                      </button>
                    </td>
                    <td className="px-2">
                      {badge(
                        new Date(user.lastSeenAtUtc).toDateString() ===
                          new Date().toDateString(),
                        "是",
                        "否"
                      )}
                    </td>
                    <td className="px-2">
                      {badge(user.redFlagged, "红号", "普通")}
                    </td>
                    <td className="px-2">{user.role}</td>
                    <td className="px-2">
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
                    <td className="px-2">{user.inviteSource || "—"}</td>
                    <td className="px-2 whitespace-nowrap">
                      {formatTime(user.createdAtUtc)}
                    </td>
                    <td className="px-2 whitespace-nowrap">
                      {formatTime(user.loginPasswordChangedAtUtc)}
                    </td>
                    <td className="px-2 whitespace-nowrap">
                      {formatTime(user.lastSeenAtUtc)}
                    </td>
                    <td className="px-2">{user.lastLoginAddress || "—"}</td>
                    <td className="px-2">{user.lastOnlineIp || "—"}</td>
                    <td className="px-2">{user.lastNodeIp || "—"}</td>
                    <td className="px-2">{user.failedLoginAttempts}</td>
                    <td className="px-2">{user.activeSessions}</td>
                    <td
                      className="max-w-48 truncate px-2"
                      title={user.loginIpRestriction}
                    >
                      {user.loginIpRestriction || "—"}
                    </td>
                    <td className="px-2">
                      <Status value={user.status} />
                    </td>
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
              kind === "accountLocked" ||
              kind === "loginLocked" ||
              kind === "cancellationEnabled"
                ? " 此操作可能使现有设备立即离线。"
                : ""}
            </div>
            <textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={3}
              className="admin-input"
              placeholder="操作原因（将写入审计日志）"
            />
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
  const [batch, setBatch] = useState("# 每行：账号,密码,昵称,手机号\n");
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
          }),
        });
      else {
        const users = batch
          .split(/\r?\n/)
          .filter(line => line.trim() && !line.trim().startsWith("#"))
          .map(line => {
            const [valueAccount, valuePassword, valueName, valueMobile = ""] =
              line.split(",").map(value => value.trim());
            return {
              account: valueAccount,
              password: valuePassword,
              displayName: valueName,
              mobilePhone: valueMobile,
              inviteSource: "批量后台开户",
            };
          });
        const result = await api<{ created: string[]; skipped: string[] }>(
          "/api/admin/users/batch",
          { method: "POST", body: JSON.stringify({ users }) }
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
            {mode === "single" ? "新增用户" : "批量新增账号"}
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
              placeholder="初始密码（至少 8 位）"
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
          </div>
        ) : (
          <textarea
            value={batch}
            onChange={e => setBatch(e.target.value)}
            rows={12}
            className="admin-input mt-5 font-mono text-sm"
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="admin-secondary">
            取消
          </button>
          <button
            disabled={busy || (mode === "single" && (!account || !password))}
            onClick={submit}
            className="admin-primary !w-auto"
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
    }[]
  >("/api/admin/operators", refresh, []);
  const [account, setAccount] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("Operator");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ account, displayName, password, role }),
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
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
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
          <button
            disabled={!account || !displayName || password.length < 8}
            className="admin-primary"
          >
            创建账号
          </button>
        </form>
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
                  <div className="flex gap-2">
                    <Status value={x.role} />
                    <Status value={x.status} />
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
                </div>
                {x.type === "Group" && (
                  <button
                    onClick={() => action(x)}
                    className={`admin-action ${x.isDissolved ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                  >
                    {x.isDissolved ? "恢复群聊" : "解散群聊"}
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
    </div>
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
