import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  FileWarning,
  Gauge,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MessageCircleMore,
  RefreshCw,
  Search,
  ShieldCheck,
  TicketCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, getDeviceId, getSession, setSession, type AuthResponse, type User } from "@/lib/echat-api";

const LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cBQkYfNchSuunZhX.png";

type Tab = "overview" | "users" | "reports" | "invites" | "audit";
type UserStatus = "Active" | "Restricted" | "Disabled" | "PendingDeletion";
type ReportStatus = "Submitted" | "Resolved" | "Rejected";
type Overview = {
  service: string;
  version: string;
  status: string;
  storage: string;
  utcNow: string;
  metrics: { users: number; activeUsers: number; restrictedUsers: number; disabledUsers: number; activeSessions: number; conversations: number; messages: number; pendingReports: number };
  security: { totpConfigured: boolean; developmentPasswordLogin: boolean; transport: string; messagePayload: string };
};
type AdminUser = { id: string; account: string; displayName: string; role: string; status: UserStatus; createdAtUtc: string; lastSeenAtUtc: string; activeSessions: number; lockoutUntilUtc?: string };
type Report = { id: string; momentId: string; reason: string; detail: string; status: ReportStatus; createdAtUtc: string; reporter?: { account: string; displayName: string }; author?: { account: string; displayName: string }; momentText: string };
type Invite = { code: string; isActive: boolean; maxUses: number; usedCount: number; expiresAtUtc?: string };
type Audit = { id: string; adminAccount: string; action: string; targetType: string; targetId: string; detail: string; ipAddress: string; createdAtUtc: string };

const tabs: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "运营概览", icon: Gauge },
  { id: "users", label: "用户管理", icon: Users },
  { id: "reports", label: "举报处置", icon: FileWarning },
  { id: "invites", label: "邀请码", icon: TicketCheck },
  { id: "audit", label: "审计日志", icon: ListChecks },
];

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

function StatusPill({ status }: { status: string }) {
  const style = status === "Active" || status === "Resolved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : status === "Submitted" || status === "Restricted" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-rose-50 text-rose-700 ring-rose-200";
  const text: Record<string, string> = { Active: "正常", Restricted: "受限", Disabled: "停用", PendingDeletion: "待删除", Submitted: "待处理", Resolved: "已处理", Rejected: "已驳回" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${style}`}>{text[status] || status}</span>;
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: (session: AuthResponse) => void }) {
  const [account, setAccount] = useState("E_Admin");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runtime, setRuntime] = useState<{ version: string; previewAdminEnabled?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/health").then(response => response.json()).then(setRuntime).catch(() => setRuntime(null));
  }, []);

  async function authenticate(loginAccount = account, loginPassword = password) {
    setBusy(true); setError("");
    try {
      const result = pendingToken
        ? await api<AuthResponse>("/api/auth/totp", { method: "POST", body: JSON.stringify({ pendingToken, code: totp, deviceName: `E聊管理后台 · ${navigator.userAgent}` }) })
        : await api<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ account: loginAccount, password: loginPassword, deviceName: `E聊管理后台 · ${navigator.userAgent}`, deviceId: getDeviceId() }) });
      if (result.requiresTotp && result.pendingToken) { setPendingToken(result.pendingToken); return; }
      if (!result.accessToken || !result.user || result.user.role !== "Admin") throw new Error("该账号没有管理权限");
      setSession(result); onAuthenticated(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await authenticate();
  }

  return (
    <main className="grid min-h-screen bg-[#071421] text-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,.18),transparent_38%),radial-gradient(circle_at_90%_85%,rgba(16,185,129,.12),transparent_36%)]" />
        <div className="relative flex items-center gap-3"><img src={LOGO} alt="E聊" className="h-11 w-11" /><div><div className="text-xl font-semibold">E聊控制台</div><div className="text-xs tracking-[.18em] text-teal-300">OPERATIONS CENTER</div></div></div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-sm font-medium tracking-[.22em] text-teal-300">SECURE · AUDITABLE · CONTROLLED</p>
          <h1 className="text-6xl font-semibold leading-[1.08] tracking-[-.05em]">让每一次治理，<br /><span className="text-teal-300">都有迹可循。</span></h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-slate-300">统一查看运行状态、管理用户、处理举报和维护邀请码。所有关键操作都会写入审计日志。</p>
        </div>
        <div className="relative flex gap-8 text-xs text-slate-400"><span>ASP.NET Core 8</span><span>角色权限</span><span>操作审计</span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center bg-[#0b1b2a] px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><img src={LOGO} alt="E聊" className="h-10 w-10" /><div><div className="text-lg font-semibold">E聊控制台</div><div className="text-xs text-teal-300">OPERATIONS CENTER</div></div></div>
          <div className="rounded-[28px] border border-white/10 bg-white/[.06] p-7 shadow-2xl backdrop-blur sm:p-9">
            <div className="mb-8"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-teal-400/15 text-teal-300"><ShieldCheck /></div><h2 className="text-3xl font-semibold">{pendingToken ? "动态验证" : "管理员登录"}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{pendingToken ? "输入身份验证器中的 6 位动态验证码。" : "管理后台仅允许 Admin 角色账号访问。"}</p></div>
            <form onSubmit={submit} className="space-y-4">
              {pendingToken ? <label className="block"><span className="mb-2 block text-sm text-slate-300">动态验证码</span><input autoFocus value={totp} onChange={event => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000 000" className="auth-input text-center text-xl tracking-[.4em]" /></label> : <>
                <label className="block"><span className="mb-2 block text-sm text-slate-300">管理账号</span><input value={account} onChange={event => setAccount(event.target.value)} autoComplete="username" className="auth-input" /></label>
                <label className="block"><span className="mb-2 block text-sm text-slate-300">密码</span><input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="输入管理员密码" className="auth-input" /></label>
              </>}
              {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
              <button disabled={busy || (pendingToken ? totp.length !== 6 : !account || !password)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-400 py-3.5 font-semibold text-[#04201d] transition hover:bg-teal-300 active:scale-[.98] disabled:opacity-50">{busy ? <RefreshCw className="animate-spin" size={18} /> : <KeyRound size={18} />}{pendingToken ? "验证并进入" : "进入管理后台"}</button>
            </form>
            {!pendingToken && runtime?.previewAdminEnabled && <button type="button" disabled={busy} onClick={() => { setAccount("E_Admin"); setPassword("Heibai@99"); authenticate("E_Admin", "Heibai@99"); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300/25 bg-teal-300/10 py-3 text-sm font-medium text-teal-200 transition hover:bg-teal-300/15 disabled:opacity-50"><UserCheck size={17} />使用预览管理员一键登录</button>}
            {!pendingToken && runtime && <p className="mt-4 text-center text-[11px] text-slate-500">当前 API {runtime.version}{runtime.previewAdminEnabled ? " · 预览管理员已启用" : " · 需要正式管理员凭据"}</p>}
            <a href="/" className="mt-5 block text-center text-sm text-slate-400 transition hover:text-teal-300">返回 E聊客户端</a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Admin() {
  const [session, setAdminSession] = useState<AuthResponse | null>(() => {
    const value = getSession(); return value?.user?.role === "Admin" ? value : null;
  });
  const [tab, setTab] = useState<Tab>("overview");
  const [drawer, setDrawer] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const [reportStatus, setReportStatus] = useState<"all" | ReportStatus>("Submitted");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteUses, setInviteUses] = useState("20");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      if (tab === "overview") setOverview(await api<Overview>("/api/admin/overview"));
      if (tab === "users") setUsers(await api<AdminUser[]>(`/api/admin/users?limit=200${search ? `&search=${encodeURIComponent(search)}` : ""}${status !== "all" ? `&status=${status}` : ""}`));
      if (tab === "reports") setReports(await api<Report[]>(`/api/admin/reports?limit=200${reportStatus !== "all" ? `&status=${reportStatus}` : ""}`));
      if (tab === "invites") setInvites(await api<Invite[]>("/api/admin/invites?limit=200"));
      if (tab === "audit") setAudits(await api<Audit[]>("/api/admin/audit?limit=200"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "加载失败";
      if (message.includes("401") || message.includes("403") || message.includes("登录状态")) { setSession(null); setAdminSession(null); }
      toast.error(message);
    } finally { setBusy(false); }
  }, [reportStatus, search, session, status, tab]);

  useEffect(() => { document.title = "E聊管理后台"; return () => { document.title = "E聊"; }; }, []);
  useEffect(() => { load(); }, [load]);

  const currentUser = session?.user;
  const activeTab = useMemo(() => tabs.find(item => item.id === tab)!, [tab]);

  async function changeStatus(user: AdminUser, nextStatus: UserStatus) {
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.account)}/status`, { method: "POST", body: JSON.stringify({ status: nextStatus, reason: "管理后台操作" }) });
      toast.success(`${user.displayName} 已更新为 ${nextStatus}`); await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "操作失败"); }
  }

  async function revokeSessions(user: AdminUser) {
    try { await api(`/api/admin/users/${encodeURIComponent(user.account)}/sessions/revoke`, { method: "POST" }); toast.success(`已退出 ${user.displayName} 的全部设备`); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "操作失败"); }
  }

  async function decideReport(report: Report, nextStatus: "Resolved" | "Rejected") {
    try { await api(`/api/admin/reports/${report.id}/decision`, { method: "POST", body: JSON.stringify({ status: nextStatus, note: "管理后台处置" }) }); toast.success("举报状态已更新"); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "操作失败"); }
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/admin/invites", { method: "POST", body: JSON.stringify({ code: inviteCode, maxUses: Number(inviteUses), isActive: true }) });
      setInviteCode(""); toast.success("邀请码已保存"); await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "保存失败"); }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* clear local state regardless */ }
    setSession(null); setAdminSession(null);
  }

  if (!session) return <AdminLogin onAuthenticated={setAdminSession} />;

  return (
    <main className="min-h-screen bg-[#f1f5f7] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#081827] p-5 text-white transition-transform duration-200 lg:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between"><a href="/admin" className="flex items-center gap-3"><img src={LOGO} alt="E聊" className="h-10 w-10" /><div><div className="font-semibold">E聊控制台</div><div className="text-[10px] tracking-[.18em] text-teal-300">OPERATIONS</div></div></a><button onClick={() => setDrawer(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-white/10 lg:hidden"><X size={18} /></button></div>
        <nav className="mt-10 space-y-1.5">{tabs.map(item => <button key={item.id} onClick={() => { setTab(item.id); setDrawer(false); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${tab === item.id ? "bg-teal-400 font-medium text-[#05201d]" : "text-slate-300 hover:bg-white/[.07] hover:text-white"}`}><item.icon size={18} /><span className="flex-1 text-left">{item.label}</span>{tab === item.id && <ChevronRight size={15} />}</button>)}</nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-white/[.05] p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-400/15 text-teal-300"><CircleUserRound size={20} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{currentUser?.displayName}</div><div className="truncate text-xs text-slate-400">@{currentUser?.account}</div></div><button onClick={logout} title="退出" className="text-slate-400 hover:text-rose-300"><LogOut size={18} /></button></div></div>
      </aside>
      {drawer && <button aria-label="关闭导航" onClick={() => setDrawer(false)} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden" />}

      <section className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-7"><button onClick={() => setDrawer(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 lg:hidden"><Menu size={19} /></button><div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold">{activeTab.label}</h1><p className="hidden text-xs text-slate-500 sm:block">E聊运营与安全管理中心</p></div><button onClick={load} disabled={busy} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-teal-700"><RefreshCw size={16} className={busy ? "animate-spin" : ""} />刷新</button><div className="hidden items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />服务正常</div></header>

        <div className="mx-auto max-w-[1500px] p-4 md:p-7">
          {tab === "overview" && <OverviewPanel data={overview} />}
          {tab === "users" && <UsersPanel users={users} currentUserId={currentUser?.id || ""} search={search} setSearch={setSearch} status={status} setStatus={setStatus} onSearch={load} onStatus={changeStatus} onRevoke={revokeSessions} />}
          {tab === "reports" && <ReportsPanel reports={reports} status={reportStatus} setStatus={setReportStatus} onDecision={decideReport} />}
          {tab === "invites" && <InvitesPanel invites={invites} code={inviteCode} setCode={setInviteCode} uses={inviteUses} setUses={setInviteUses} onSubmit={createInvite} />}
          {tab === "audit" && <AuditPanel audits={audits} />}
        </div>
      </section>
    </main>
  );
}

function OverviewPanel({ data }: { data: Overview | null }) {
  if (!data) return <LoadingState />;
  const cards = [
    [Users, "用户总数", data.metrics.users, `${data.metrics.activeUsers} 位正常`],
    [Activity, "活跃会话", data.metrics.activeSessions, "当前有效设备"],
    [MessageCircleMore, "消息总数", data.metrics.messages, `${data.metrics.conversations} 个会话`],
    [AlertTriangle, "待处理举报", data.metrics.pendingReports, "需要运营复核"],
  ] as const;
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([Icon, title, value, desc]) => <article key={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{title}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p><p className="mt-2 text-xs text-slate-400">{desc}</p></div><div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon size={21} /></div></div></article>)}</div><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><article className="rounded-2xl bg-[#0b1b2a] p-6 text-white shadow-sm"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300"><CheckCircle2 /></div><div><h2 className="font-semibold">系统运行正常</h2><p className="text-xs text-slate-400">版本 {data.version} · {data.storage}</p></div></div><div className="mt-7 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><Metric label="正常用户" value={data.metrics.activeUsers} /><Metric label="受限用户" value={data.metrics.restrictedUsers} /><Metric label="停用用户" value={data.metrics.disabledUsers} /><Metric label="会话总数" value={data.metrics.conversations} /></div></article><article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70"><h2 className="font-semibold">安全状态</h2><div className="mt-5 space-y-4 text-sm"><SecurityRow label="消息载荷" value="AES-GCM 密文" ok /><SecurityRow label="生产传输" value="要求 TLS" ok /><SecurityRow label="管理员 TOTP" value={data.security.totpConfigured ? "已配置" : "未配置"} ok={data.security.totpConfigured} /><SecurityRow label="开发密码登录" value={data.security.developmentPasswordLogin ? "已启用" : "已关闭"} ok={!data.security.developmentPasswordLogin} /></div></article></div></div>;
}

function UsersPanel({ users, currentUserId, search, setSearch, status, setStatus, onSearch, onStatus, onRevoke }: { users: AdminUser[]; currentUserId: string; search: string; setSearch: (value: string) => void; status: "all" | UserStatus; setStatus: (value: "all" | UserStatus) => void; onSearch: () => void; onStatus: (user: AdminUser, status: UserStatus) => void; onRevoke: (user: AdminUser) => void }) {
  return <div className="space-y-5"><div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === "Enter" && onSearch()} placeholder="搜索账号或昵称" className="w-full rounded-xl bg-slate-100 py-2.5 pl-10 pr-3 text-sm outline-none ring-teal-400/40 focus:ring-2" /></div><select value={status} onChange={event => setStatus(event.target.value as "all" | UserStatus)} className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm outline-none"><option value="all">全部状态</option><option value="Active">正常</option><option value="Restricted">受限</option><option value="Disabled">停用</option><option value="PendingDeletion">待删除</option></select><button onClick={onSearch} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">查询</button></div><div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">用户</th><th className="px-5 py-4">角色</th><th className="px-5 py-4">状态</th><th className="px-5 py-4">设备</th><th className="px-5 py-4">最近活跃</th><th className="px-5 py-4 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(user => <tr key={user.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="font-medium">{user.displayName}</div><div className="mt-1 text-xs text-slate-400">@{user.account}</div></td><td className="px-5 py-4">{user.role}</td><td className="px-5 py-4"><StatusPill status={user.status} /></td><td className="px-5 py-4">{user.activeSessions}</td><td className="px-5 py-4 text-slate-500">{formatTime(user.lastSeenAtUtc)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{user.id !== currentUserId && <>{user.status !== "Active" ? <button onClick={() => onStatus(user, "Active")} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">恢复</button> : <><button onClick={() => onStatus(user, "Restricted")} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">限制</button><button onClick={() => onStatus(user, "Disabled")} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">停用</button></>}<button onClick={() => onRevoke(user)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">退出设备</button></>}</div></td></tr>)}</tbody></table></div>{users.length === 0 && <Empty text="没有匹配的用户" />}</div></div>;
}

function ReportsPanel({ reports, status, setStatus, onDecision }: { reports: Report[]; status: "all" | ReportStatus; setStatus: (value: "all" | ReportStatus) => void; onDecision: (report: Report, status: "Resolved" | "Rejected") => void }) {
  return <div className="space-y-5"><div className="flex justify-end"><select value={status} onChange={event => setStatus(event.target.value as "all" | ReportStatus)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="all">全部举报</option><option value="Submitted">待处理</option><option value="Resolved">已处理</option><option value="Rejected">已驳回</option></select></div><div className="grid gap-4">{reports.map(report => <article key={report.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><StatusPill status={report.status} /><span className="text-xs text-slate-400">{formatTime(report.createdAtUtc)}</span></div><h3 className="mt-4 font-semibold">{report.reason}</h3><p className="mt-2 text-sm text-slate-600">{report.detail || "未填写补充说明"}</p></div>{report.status === "Submitted" && <div className="flex shrink-0 gap-2"><button onClick={() => onDecision(report, "Rejected")} className="rounded-xl bg-slate-100 px-4 py-2 text-sm">驳回</button><button onClick={() => onDecision(report, "Resolved")} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white">确认处置</button></div>}</div><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p className="line-clamp-2 text-slate-700">{report.momentText}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400"><span>举报人：{report.reporter?.displayName || "未知"} @{report.reporter?.account}</span><span>发布者：{report.author?.displayName || "未知"} @{report.author?.account}</span></div></div></article>)}{reports.length === 0 && <Empty text="当前没有举报记录" />}</div></div>;
}

function InvitesPanel({ invites, code, setCode, uses, setUses, onSubmit }: { invites: Invite[]; code: string; setCode: (value: string) => void; uses: string; setUses: (value: string) => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={onSubmit} className="h-fit rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70"><div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><TicketCheck /></div><h2 className="font-semibold">创建邀请码</h2><p className="mt-1 text-sm text-slate-500">可重复提交同一码以更新可用次数。</p><label className="mt-6 block text-sm"><span className="mb-2 block text-slate-600">邀请码</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="例如 ECHAT_TEAM" className="w-full rounded-xl bg-slate-100 px-3 py-2.5 font-mono outline-none ring-teal-400/40 focus:ring-2" /></label><label className="mt-4 block text-sm"><span className="mb-2 block text-slate-600">最大使用次数</span><input value={uses} onChange={event => setUses(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-full rounded-xl bg-slate-100 px-3 py-2.5 outline-none ring-teal-400/40 focus:ring-2" /></label><button disabled={!code || !Number(uses)} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white disabled:opacity-50">保存邀请码</button></form><div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">邀请码</th><th className="px-5 py-4">使用情况</th><th className="px-5 py-4">状态</th><th className="px-5 py-4">过期时间</th></tr></thead><tbody className="divide-y divide-slate-100">{invites.map(invite => <tr key={invite.code}><td className="px-5 py-4 font-mono font-medium">{invite.code}</td><td className="px-5 py-4">{invite.usedCount} / {invite.maxUses}</td><td className="px-5 py-4"><StatusPill status={invite.isActive ? "Active" : "Disabled"} /></td><td className="px-5 py-4 text-slate-500">{formatTime(invite.expiresAtUtc)}</td></tr>)}</tbody></table></div></div></div>;
}

function AuditPanel({ audits }: { audits: Audit[] }) {
  return <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">时间</th><th className="px-5 py-4">管理员</th><th className="px-5 py-4">操作</th><th className="px-5 py-4">目标</th><th className="px-5 py-4">详情</th><th className="px-5 py-4">来源 IP</th></tr></thead><tbody className="divide-y divide-slate-100">{audits.map(item => <tr key={item.id}><td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatTime(item.createdAtUtc)}</td><td className="px-5 py-4 font-medium">{item.adminAccount}</td><td className="px-5 py-4"><code className="rounded bg-slate-100 px-2 py-1 text-xs text-teal-700">{item.action}</code></td><td className="px-5 py-4 text-slate-500">{item.targetType} · {item.targetId.slice(0, 10)}</td><td className="max-w-xs truncate px-5 py-4 text-slate-600" title={item.detail}>{item.detail || "—"}</td><td className="px-5 py-4 text-slate-400">{item.ipAddress}</td></tr>)}</tbody></table></div>{audits.length === 0 && <Empty text="完成管理操作后将在这里留下审计记录" />}</div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div><div className="text-2xl font-semibold">{value.toLocaleString()}</div><div className="mt-1 text-xs text-slate-400">{label}</div></div>; }
function SecurityRow({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className={`flex items-center gap-1.5 font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}>{ok ? <UserCheck size={15} /> : <Ban size={15} />}{value}</span></div>; }
function LoadingState() { return <div className="grid min-h-[420px] place-items-center"><RefreshCw className="animate-spin text-teal-600" /></div>; }
function Empty({ text }: { text: string }) { return <div className="grid min-h-40 place-items-center text-sm text-slate-400">{text}</div>; }
