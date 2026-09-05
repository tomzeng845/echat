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
  PackageSearch,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  TicketCheck,
  UserCheck,
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

const LOGO =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cBQkYfNchSuunZhX.png";
type IconType = typeof Home;
type UserStatus = "Active" | "Restricted" | "Disabled" | "PendingDeletion";
type PageId =
  | "home"
  | "account-users"
  | "account-login"
  | "account-offline"
  | "account-failures"
  | "account-feedback"
  | "fund-subjects"
  | "fund-adjust"
  | "fund-transactions"
  | "system-operators"
  | "system-admin-login"
  | "system-roles"
  | "system-resources"
  | "system-settings"
  | "system-push"
  | "system-announcements"
  | "system-images"
  | "system-audit"
  | "system-errors"
  | "chat-conversations"
  | "chat-customer"
  | "chat-tasks"
  | "chat-task-logs"
  | "chat-groups"
  | "chat-bulk"
  | "chat-contacts"
  | "chat-sms"
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
  security: { totpConfigured: boolean; developmentPasswordLogin: boolean };
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
      { id: "system-resources", label: "资源管理" },
      { id: "system-settings", label: "系统配置" },
      { id: "system-push", label: "安卓厂商推送设置" },
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
      { id: "chat-tasks", label: "定时任务" },
      { id: "chat-task-logs", label: "定时任务日志" },
      { id: "chat-groups", label: "群监控" },
      { id: "chat-bulk", label: "群发言" },
      { id: "chat-contacts", label: "通讯录" },
      { id: "chat-sms", label: "短信管理" },
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
  "fund-subjects": {
    module: "fund.subjects",
    field: "code",
    fieldLabel: "科目编码",
    placeholder: "例如 MANUAL_RECHARGE",
    description: "维护可用于人工额度调整的业务科目。",
  },
  "system-roles": {
    module: "system.roles",
    field: "permissions",
    fieldLabel: "权限范围",
    placeholder: "users:read, reports:write",
    description: "定义后台角色及其资源权限范围。",
  },
  "system-resources": {
    module: "system.resources",
    field: "path",
    fieldLabel: "资源标识",
    placeholder: "admin.users",
    description: "维护后台菜单、API 与操作资源。",
  },
  "system-settings": {
    module: "system.settings",
    field: "value",
    fieldLabel: "配置值",
    placeholder: "请输入配置值",
    description: "维护非敏感运行参数；密钥仍应通过服务端环境变量配置。",
  },
  "system-push": {
    module: "system.push",
    field: "provider",
    fieldLabel: "厂商/应用标识",
    placeholder: "华为、荣耀、小米、OPPO、vivo",
    description: "登记安卓厂商推送通道状态；密钥不会显示在浏览器。",
  },
  "system-announcements": {
    module: "system.announcements",
    field: "content",
    fieldLabel: "公告内容",
    placeholder: "输入公告正文",
    description: "发布和停用客户端公告。",
  },
  "chat-customer": {
    module: "chat.customer-service",
    field: "account",
    fieldLabel: "客服账号",
    placeholder: "service_001",
    description: "配置在线客服账号与接待状态。",
  },
  "chat-tasks": {
    module: "chat.tasks",
    field: "schedule",
    fieldLabel: "执行计划",
    placeholder: "0 9 * * *",
    description:
      "配置规则型任务；当前托管模式支持手动执行与日志，自动触发需接入平台任务调度。",
  },
  "chat-sms": {
    module: "chat.sms",
    field: "template",
    fieldLabel: "短信模板",
    placeholder: "验证码：${code}",
    description: "维护短信模板和启停状态；发送需配置短信供应商。",
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
  const [account, setAccount] = useState("E_Admin"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [runtime, setRuntime] = useState<{
    version: string;
    previewAdminEnabled?: boolean;
  } | null>(null);
  useEffect(() => {
    fetch("/api/health")
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
      if (result.requiresTotp)
        throw new Error("正式环境管理员需在客户端完成动态验证码登录");
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
  return (
    <main className="grid min-h-screen bg-[#071421] text-white lg:grid-cols-[1.05fr_.95fr]">
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
          <span>30 个功能页</span>
          <span>操作审计</span>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center bg-[#0b1b2a] px-5 py-10">
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
                authenticate();
              }}
              className="mt-7 space-y-4"
            >
              <input
                value={account}
                onChange={e => setAccount(e.target.value)}
                autoComplete="username"
                className="auth-input"
                aria-label="管理账号"
              />
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="输入管理员密码"
                className="auth-input"
                aria-label="密码"
              />
              {error && (
                <div className="rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
              <button
                disabled={busy || !account || !password}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-400 py-3.5 font-semibold text-[#04201d] disabled:opacity-50"
              >
                {busy ? (
                  <RefreshCw className="animate-spin" size={18} />
                ) : (
                  <KeyRound size={18} />
                )}
                进入管理后台
              </button>
            </form>
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
    <main className="min-h-screen bg-[#f2f4f6] text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col bg-[#292d32] text-slate-200 shadow-2xl transition-transform duration-200 lg:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <a href="/admin" className="flex items-center gap-3">
            <img src={LOGO} alt="E聊" className="h-9 w-9" />
            <div>
              <div className="font-semibold text-white">E聊运营后台</div>
              <div className="text-[10px] tracking-[.16em] text-teal-300">
                ADMIN 0.5
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
      <section className="min-h-screen lg:pl-[270px]">
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
  if (page === "account-login")
    return (
      <LogsPanel
        refresh={refresh}
        title="用户登录日志"
        path="/api/admin/login-logs"
      />
    );
  if (page === "account-offline")
    return (
      <RecordsTable
        refresh={refresh}
        title="离线日志"
        description="记录用户主动退出和会话离线信息。"
        path="/api/admin/modules/account.offline-logs"
      />
    );
  if (page === "account-failures") return <FailureStats refresh={refresh} />;
  if (page === "account-feedback") return <FeedbackPanel refresh={refresh} />;
  if (page === "fund-adjust") return <WalletPanel refresh={refresh} />;
  if (page === "fund-transactions")
    return (
      <RecordsTable
        refresh={refresh}
        title="交易明细"
        description="展示后台额度变更形成的完整流水。"
        path="/api/admin/modules/fund.adjustments"
      />
    );
  if (page === "system-operators") return <OperatorsPanel refresh={refresh} />;
  if (page === "system-admin-login")
    return (
      <LogsPanel
        refresh={refresh}
        title="管理账号登录日志"
        path="/api/admin/login-logs?scope=admin"
      />
    );
  if (page === "system-images") return <ImagesPanel refresh={refresh} />;
  if (page === "system-audit") return <AuditPanel refresh={refresh} />;
  if (page === "system-errors")
    return (
      <RecordsTable
        refresh={refresh}
        title="报错日志"
        description="捕获 API 未处理异常、路径和 traceId。"
        path="/api/admin/modules/system.error-logs"
      />
    );
  if (page === "chat-conversations" || page === "chat-groups")
    return (
      <ConversationsPanel
        refresh={refresh}
        groupsOnly={page === "chat-groups"}
      />
    );
  if (page === "chat-task-logs")
    return (
      <RecordsTable
        refresh={refresh}
        title="定时任务日志"
        description="查看任务手动或平台调度执行结果。"
        path="/api/admin/modules/chat.task-logs"
      />
    );
  if (page === "chat-bulk") return <BulkPanel refresh={refresh} />;
  if (page === "chat-contacts") return <ContactsPanel refresh={refresh} />;
  const generic = genericPages[page];
  return generic ? (
    <GenericRecordsPanel
      refresh={refresh}
      title={pageLabel.get(page) || "管理"}
      {...generic}
      runnable={page === "chat-tasks"}
    />
  ) : (
    <Empty text="页面正在初始化" />
  );
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
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [nonce, setNonce] = useState(0);
  const path = `/api/admin/users?limit=200${search ? `&search=${encodeURIComponent(search)}` : ""}${status !== "all" ? `&status=${status}` : ""}`;
  const {
    data: users,
    loading,
    reload,
  } = useData<AdminUser[]>(path, refresh + nonce, []);
  async function change(user: AdminUser, next: UserStatus) {
    await api(`/api/admin/users/${user.account}/status`, {
      method: "POST",
      body: JSON.stringify({ status: next, reason: "后台用户管理" }),
    });
    toast.success("用户状态已更新");
    reload();
  }
  return (
    <div className="space-y-5">
      <PanelTitle
        title="用户管理"
        description="查询账号、查看状态和设备，并执行限制、停用或恢复。"
      />
      <Card className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-slate-400" size={17} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索账号或昵称"
            className="w-full rounded-xl bg-slate-100 py-2.5 pl-10 pr-3 text-sm outline-none"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-xl bg-slate-100 px-3 text-sm"
        >
          <option value="all">全部状态</option>
          <option value="Active">正常</option>
          <option value="Restricted">受限</option>
          <option value="Disabled">停用</option>
        </select>
        <button
          onClick={() => setNonce(v => v + 1)}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm text-white"
        >
          查询
        </button>
      </Card>
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-4">用户</th>
                <th>角色</th>
                <th>状态</th>
                <th>设备</th>
                <th>最近活跃</th>
                <th className="pr-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="p-4">
                    <b>{user.displayName}</b>
                    <div className="text-xs text-slate-400">
                      @{user.account}
                    </div>
                  </td>
                  <td>{user.role}</td>
                  <td>
                    <Status value={user.status} />
                  </td>
                  <td>{user.activeSessions}</td>
                  <td>{formatTime(user.lastSeenAtUtc)}</td>
                  <td className="pr-4 text-right">
                    {user.id !== currentUserId && (
                      <div className="flex justify-end gap-2">
                        {user.status !== "Active" ? (
                          <button
                            onClick={() => change(user, "Active")}
                            className="admin-mini bg-emerald-50 text-emerald-700"
                          >
                            恢复
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => change(user, "Restricted")}
                              className="admin-mini bg-amber-50 text-amber-700"
                            >
                              限制
                            </button>
                            <button
                              onClick={() => change(user, "Disabled")}
                              className="admin-mini bg-rose-50 text-rose-700"
                            >
                              停用
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
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
  return (
    <div>
      <PanelTitle
        title="操作日志"
        description="记录所有关键管理操作的账号、目标、来源 IP 与详情。"
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
              </tr>
            </thead>
            <tbody>
              {data.map(x => (
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
                </tr>
              ))}
            </tbody>
          </table>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map(x => (
          <Card key={x.id}>
            <div className="aspect-video overflow-hidden rounded-xl bg-slate-100">
              <AuthenticatedMedia src={x.data.url} type="image" alt={x.name} />
            </div>
            <p className="mt-3 truncate font-medium">{x.name}</p>
            <p className="text-xs text-slate-400">
              {x.data.contentType} · {x.data.size} B
            </p>
          </Card>
        ))}
        {!data.length && (
          <Card>
            <Empty text="暂无运营图片" />
          </Card>
        )}
      </div>
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
