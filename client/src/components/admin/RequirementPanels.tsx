import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Check,
  Eye,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AuthenticatedMedia from "@/components/AuthenticatedMedia";
import { api } from "@/lib/echat-api";

type ModuleRecord = {
  id: string;
  module: string;
  name: string;
  status: string;
  data: Record<string, string>;
  createdAtUtc: string;
  updatedAtUtc: string;
};
type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type User = {
  id: string;
  account: string;
  displayName: string;
  role: string;
  status: string;
};
type Conversation = {
  id: string;
  type: string;
  name: string;
  createdBy: string;
  memberCount: number;
  lastSequence: number;
  lastMessageAtUtc?: string;
  isDissolved: boolean;
};

const time = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
const badge = (value: string) => (
  <span
    className={`inline-flex rounded-full px-2 py-1 text-xs ${["Active", "Approved", "Published", "Completed", "Friend", "Sent", "Resolved", "success"].includes(value) ? "bg-emerald-50 text-emerald-700" : ["Pending", "Processing", "Observed", "pending"].includes(value) ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
  >
    {value}
  </span>
);
function Box({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 ${className}`}
    >
      {children}
    </section>
  );
}
function Title({
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
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`my-6 w-full ${wide ? "max-w-5xl" : "max-w-xl"} rounded-2xl bg-white p-6 shadow-2xl`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="关闭">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function useLoad<T>(path: string, fallback: T, refresh = 0) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
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
function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
      <span>
        第 {page} / {Math.max(1, totalPages)} 页 · 共 {total} 条
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(1)}
          className="admin-secondary"
        >
          首页
        </button>
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="admin-secondary"
        >
          上一页
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="admin-secondary"
        >
          下一页
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
          className="admin-secondary"
        >
          末页
        </button>
      </div>
    </div>
  );
}

export function VerificationDialog({
  user,
  type,
  onClose,
  onSaved,
}: {
  user: { account: string; displayName: string };
  type: "RealName" | "Enterprise";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, reload } = useLoad<ModuleRecord[]>(
    `/api/admin/users/${user.account}/verifications`,
    []
  );
  const current = data.find(x => x.data.type === type);
  const [form, setForm] = useState({
    realName: "",
    idNumber: "",
    enterpriseName: "",
    creditCode: "",
    legalRepresentative: "",
    note: "",
  });
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (current)
      setForm(v => ({
        ...v,
        realName: current.data.realName || "",
        idNumber: current.data.idNumber || "",
        enterpriseName: current.data.enterpriseName || "",
        creditCode: current.data.creditCode || "",
        legalRepresentative: current.data.legalRepresentative || "",
        note: current.data.note || "",
      }));
  }, [current?.id]);
  const field = (key: keyof typeof form, placeholder: string) => (
    <input
      value={form[key]}
      onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
      placeholder={placeholder}
      className="admin-input"
    />
  );
  async function save() {
    try {
      await api(`/api/admin/users/${user.account}/verifications`, {
        method: "POST",
        body: JSON.stringify({ type, ...form, materialAssetIds: [] }),
      });
      toast.success("认证资料已保存");
      reload();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }
  async function decide(status: string) {
    if (!current) return toast.error("请先保存认证资料");
    try {
      await api(`/api/admin/verifications/${current.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ status, reason }),
      });
      toast.success("认证状态已更新");
      reload();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }
  return (
    <Modal
      title={`${type === "RealName" ? "实名认证" : "企业实名认证"}详情 · ${user.displayName}`}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {type === "RealName" ? (
          <>
            {field("realName", "真实姓名")}
            {field("idNumber", "身份证号（后台受保护）")}
          </>
        ) : (
          <>
            {field("enterpriseName", "企业名称")}
            {field("creditCode", "统一社会信用代码")}
            {field("legalRepresentative", "法定代表人")}
          </>
        )}
        {field("note", "申请备注")}
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span>当前状态</span>
          {badge(current?.status || "NotSubmitted")}
        </div>
        <p className="mt-2 text-slate-500">
          审核人：{current?.data.reviewedBy || "—"} ·{" "}
          {time(current?.data.reviewedAtUtc)}
        </p>
        {current?.data.reason && (
          <p className="mt-2 text-rose-600">原因：{current.data.reason}</p>
        )}
      </div>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="拒绝原因或审核说明"
        className="admin-input mt-4 min-h-20"
      />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={save} className="admin-secondary">
          编辑并保存
        </button>
        <button onClick={() => decide("Closed")} className="admin-secondary">
          关闭申请
        </button>
        <button onClick={() => decide("Rejected")} className="admin-danger">
          拒绝
        </button>
        <button
          onClick={() => decide("Approved")}
          className="admin-primary !w-auto"
        >
          审核通过
        </button>
      </div>
    </Modal>
  );
}

export function InviteManagementPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<
    {
      code: string;
      isActive: boolean;
      maxUses: number;
      usedCount: number;
      expiresAtUtc?: string;
    }[]
  >("/api/admin/invites?limit=200", [], refresh);
  const [form, setForm] = useState({
    code: "",
    maxUses: "100",
    expiresAtUtc: "",
    isActive: true,
  });
  async function generate() {
    const result = await api<{ code: string }>("/api/admin/invites/generate", {
      method: "POST",
    });
    setForm(v => ({ ...v, code: result.code }));
  }
  async function save() {
    try {
      await api("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          maxUses: Number(form.maxUses),
          expiresAtUtc: form.expiresAtUtc
            ? new Date(form.expiresAtUtc).toISOString()
            : null,
          isActive: form.isActive,
        }),
      });
      toast.success("邀请码已保存");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Box>
        <Title
          title="邀请码设置"
          description="邀请码必须为 8 位大写字母或数字。"
        />
        <input
          value={form.code}
          onChange={e =>
            setForm(v => ({
              ...v,
              code: e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 8),
            }))
          }
          placeholder="8 位邀请码"
          className="admin-input"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            value={form.maxUses}
            onChange={e => setForm(v => ({ ...v, maxUses: e.target.value }))}
            type="number"
            min="1"
            className="admin-input"
            placeholder="可用次数"
          />
          <input
            value={form.expiresAtUtc}
            onChange={e =>
              setForm(v => ({ ...v, expiresAtUtc: e.target.value }))
            }
            type="datetime-local"
            className="admin-input"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e => setForm(v => ({ ...v, isActive: e.target.checked }))}
          />
          启用
        </label>
        <div className="mt-4 flex gap-2">
          <button onClick={generate} className="admin-secondary">
            <RefreshCw size={15} />
            随机生成
          </button>
          <button
            onClick={save}
            disabled={form.code.length !== 8}
            className="admin-primary !w-auto"
          >
            提交
          </button>
        </div>
      </Box>
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">邀请码</th>
              <th>状态</th>
              <th>使用次数</th>
              <th>过期时间</th>
            </tr>
          </thead>
          <tbody>
            {data.map(x => (
              <tr key={x.code} className="border-t">
                <td className="p-4 font-mono font-semibold">{x.code}</td>
                <td>{badge(x.isActive ? "Active" : "Disabled")}</td>
                <td>
                  {x.usedCount} / {x.maxUses}
                </td>
                <td>{time(x.expiresAtUtc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && <Empty text="暂无邀请码" />}
      </Box>
    </div>
  );
}

export function LogsPanel({
  refresh,
  scope = "all",
  offline = false,
}: {
  refresh: number;
  scope?: string;
  offline?: boolean;
}) {
  const [query, setQuery] = useState({
    account: "",
    ip: "",
    result: "",
    fromUtc: "",
    toUtc: "",
    page: 1,
  });
  const params = useMemo(
    () =>
      new URLSearchParams(
        Object.entries({
          scope,
          account: query.account,
          ip: query.ip,
          result: query.result,
          fromUtc: query.fromUtc,
          toUtc: query.toUtc,
          page: String(query.page),
          pageSize: "20",
        })
          .filter(([, v]) => v)
          .map(([k, v]) => [k, String(v)])
      ).toString(),
    [query, scope]
  );
  const { data, loading } = useLoad<Page<ModuleRecord>>(
    `/api/admin/${offline ? "offline-logs" : "login-logs"}/search?${params}`,
    { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    refresh
  );
  return (
    <div>
      <Title
        title={
          offline
            ? "离线日志"
            : scope === "admin"
              ? "管理账号登录日志"
              : "用户登录日志"
        }
        description="支持账号、IP、结果和日期范围筛选的服务端分页日志。"
      />
      <Box className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            className="admin-filter-input"
            placeholder="账号"
            value={query.account}
            onChange={e =>
              setQuery(v => ({ ...v, account: e.target.value, page: 1 }))
            }
          />
          {!offline && (
            <input
              className="admin-filter-input"
              placeholder="IP"
              value={query.ip}
              onChange={e =>
                setQuery(v => ({ ...v, ip: e.target.value, page: 1 }))
              }
            />
          )}
          {!offline && (
            <select
              className="admin-filter-select"
              value={query.result}
              onChange={e =>
                setQuery(v => ({ ...v, result: e.target.value, page: 1 }))
              }
            >
              <option value="">全部结果</option>
              <option>success</option>
              <option>failed</option>
              <option>pending</option>
            </select>
          )}
          <input
            type="date"
            className="admin-filter-input"
            value={query.fromUtc}
            onChange={e =>
              setQuery(v => ({ ...v, fromUtc: e.target.value, page: 1 }))
            }
          />
          <input
            type="date"
            className="admin-filter-input"
            value={query.toUtc}
            onChange={e =>
              setQuery(v => ({ ...v, toUtc: e.target.value, page: 1 }))
            }
          />
        </div>
      </Box>
      <Box className="overflow-x-auto p-0">
        {loading ? (
          <Empty text="加载中" />
        ) : (
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4">时间</th>
                <th>账号</th>
                <th>设备类型</th>
                <th>设备型号</th>
                <th>系统版本</th>
                <th>APP版本</th>
                <th>IP</th>
                <th>地址</th>
                <th>结果</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(x => (
                <tr key={x.id} className="border-t">
                  <td className="p-4">{time(x.createdAtUtc)}</td>
                  <td>@{x.data.account || "—"}</td>
                  <td>{x.data.deviceType || "Desktop"}</td>
                  <td>{x.data.deviceModel || x.data.device || "浏览器设备"}</td>
                  <td>{x.data.osVersion || "—"}</td>
                  <td>{x.data.appVersion || "Web"}</td>
                  <td>{x.data.ip || "—"}</td>
                  <td>{x.data.address || "—"}</td>
                  <td>{badge(x.data.result || x.status)}</td>
                  <td>{x.data.reason || x.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={query.page}
          totalPages={data.totalPages}
          total={data.total}
          onPage={page => setQuery(v => ({ ...v, page }))}
        />
      </Box>
    </div>
  );
}

export function FailureIpPanel({ refresh }: { refresh: number }) {
  const [search, setSearch] = useState("");
  const { data, reload } = useLoad<
    Page<{
      ip: string;
      count: number;
      accounts: string;
      lastAtUtc: string;
      lastReason: string;
      status: string;
      note: string;
    }>
  >(
    `/api/admin/login-failure-ips?search=${encodeURIComponent(search)}`,
    { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    refresh
  );
  async function decide(ip: string, status: string) {
    await api(
      `/api/admin/login-failure-ips/${encodeURIComponent(ip)}/decision`,
      { method: "POST", body: JSON.stringify({ status, note: "后台处置" }) }
    );
    reload();
  }
  return (
    <div>
      <Title
        title="登录失败 IP 统计"
        description="按来源 IP 聚合失败事件，可标记封禁、忽略或恢复观察。"
      />
      <Box className="mb-4">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="IP 或账号"
            className="admin-filter-input"
          />
          <button onClick={reload} className="admin-primary !w-auto">
            <Search size={15} />
            查询
          </button>
        </div>
      </Box>
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">IP</th>
              <th>失败次数</th>
              <th>涉及账号</th>
              <th>最后原因</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(x => (
              <tr key={x.ip} className="border-t">
                <td className="p-4 font-mono">{x.ip}</td>
                <td className="font-semibold text-rose-600">{x.count}</td>
                <td>{x.accounts}</td>
                <td>
                  {x.lastReason}
                  <div className="text-xs text-slate-400">
                    {time(x.lastAtUtc)}
                  </div>
                </td>
                <td>{badge(x.status)}</td>
                <td className="space-x-2">
                  <button
                    onClick={() => decide(x.ip, "Blocked")}
                    className="admin-danger"
                  >
                    封禁
                  </button>
                  <button
                    onClick={() => decide(x.ip, "Ignored")}
                    className="admin-secondary"
                  >
                    忽略
                  </button>
                  <button
                    onClick={() => decide(x.ip, "Observed")}
                    className="admin-secondary"
                  >
                    恢复
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <Empty text="暂无失败 IP" />}
      </Box>
    </div>
  );
}

export function FeedbackPanel({ refresh }: { refresh: number }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<string[]>([]);
  const [selected, setSelected] = useState<ModuleRecord>();
  const [reply, setReply] = useState("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ content: "", contact: "" });
  const [images, setImages] = useState<File[]>([]);
  const { data, reload } = useLoad<Page<ModuleRecord>>(
    `/api/admin/feedback/search?status=${status}&page=${page}&pageSize=20`,
    { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    refresh
  );
  async function decide(next: string) {
    if (!selected) return;
    await api(`/api/admin/feedback/${selected.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ status: next, reply }),
    });
    setSelected(undefined);
    reload();
    toast.success("反馈已处理");
  }
  async function markSeen(ids: string[]) {
    if (!ids.length) return toast.error("请先选择反馈");
    await api("/api/admin/feedback/seen", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    setChecked([]);
    reload();
    toast.success(`已标记 ${ids.length} 条反馈为已查看`);
  }
  async function createFeedback() {
    if (!createForm.content.trim()) return toast.error("请输入反馈内容");
    const body = new FormData();
    body.append("content", createForm.content.trim());
    body.append("contact", createForm.contact.trim());
    images.forEach(image => body.append("images", image));
    await api("/api/admin/feedback", { method: "POST", body });
    setCreating(false);
    setCreateForm({ content: "", contact: "" });
    setImages([]);
    setPage(1);
    reload();
    toast.success("反馈已新增");
  }
  return (
    <div>
      <Title
        title="意见反馈"
        description="筛选、查看反馈详情并记录处理回复。"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCreating(true)}
              className="admin-primary !w-auto"
            >
              <Plus size={15} />
              新增
            </button>
            <select
              value={status}
              onChange={e => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="">全部状态</option>
              <option>Submitted</option>
              <option>Processing</option>
              <option>Resolved</option>
              <option>Rejected</option>
            </select>
            <button
              onClick={() => markSeen(checked)}
              className="admin-secondary"
            >
              批量已查看
            </button>
          </div>
        }
      />
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">
                <input
                  type="checkbox"
                  aria-label="选择本页全部反馈"
                  checked={
                    Boolean(data.items.length) &&
                    data.items.every(x => checked.includes(x.id))
                  }
                  onChange={e =>
                    setChecked(
                      e.target.checked ? data.items.map(x => x.id) : []
                    )
                  }
                />
              </th>
              <th>时间</th>
              <th>反馈摘要</th>
              <th>用户</th>
              <th>联系方式</th>
              <th>状态</th>
              <th>查看状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">
                  <input
                    type="checkbox"
                    aria-label={`选择反馈 ${x.name}`}
                    checked={checked.includes(x.id)}
                    onChange={e =>
                      setChecked(v =>
                        e.target.checked
                          ? v.includes(x.id)
                            ? v
                            : [...v, x.id]
                          : v.filter(id => id !== x.id)
                      )
                    }
                  />
                </td>
                <td>{time(x.createdAtUtc)}</td>
                <td
                  className="max-w-md truncate"
                  title={x.data.content || x.name}
                >
                  {x.data.content || x.name}
                </td>
                <td>{x.data.account || x.data.userId || "—"}</td>
                <td>{x.data.contact || "—"}</td>
                <td>{badge(x.status)}</td>
                <td>{badge(x.data.seen === "true" ? "已查看" : "未查看")}</td>
                <td>
                  <button
                    onClick={async () => {
                      if (x.data.seen !== "true") await markSeen([x.id]);
                      setSelected(x);
                      setReply(x.data.reply || "");
                    }}
                    className="admin-secondary"
                  >
                    <Eye size={15} />
                    查看处理
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={data.totalPages}
          total={data.total}
          onPage={setPage}
        />
      </Box>
      {selected && (
        <Modal title="反馈详情" onClose={() => setSelected(undefined)}>
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">
            {selected.data.content || selected.name}
          </p>
          {selected.data.imageAssetIds && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {selected.data.imageAssetIds
                .split(",")
                .filter(Boolean)
                .map(id => (
                  <div
                    key={id}
                    className="aspect-square overflow-hidden rounded-xl"
                  >
                    <AuthenticatedMedia
                      src={`/api/media/${id}/content`}
                      type="image"
                      alt="反馈图片"
                    />
                  </div>
                ))}
            </div>
          )}
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="处理备注与回复"
            className="admin-input mt-4 min-h-28"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => decide("Processing")}
              className="admin-secondary"
            >
              处理中
            </button>
            <button onClick={() => decide("Rejected")} className="admin-danger">
              驳回
            </button>
            <button
              onClick={() => decide("Resolved")}
              className="admin-primary !w-auto"
            >
              解决
            </button>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title="新增意见反馈" onClose={() => setCreating(false)}>
          <textarea
            value={createForm.content}
            onChange={event =>
              setCreateForm(value => ({
                ...value,
                content: event.target.value,
              }))
            }
            placeholder="请输入反馈文字（最多 2000 字）"
            maxLength={2000}
            className="admin-input min-h-36"
          />
          <input
            value={createForm.contact}
            onChange={event =>
              setCreateForm(value => ({
                ...value,
                contact: event.target.value,
              }))
            }
            placeholder="联系方式（选填）"
            className="admin-input mt-3"
          />
          <label className="mt-3 block rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            上传图片（最多 6 张，单张不超过 5 MB）
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="mt-2 block w-full text-xs"
              onChange={event => {
                const selectedFiles = Array.from(event.target.files || []);
                if (selectedFiles.length > 6) {
                  toast.error("最多选择 6 张图片");
                  event.currentTarget.value = "";
                  return;
                }
                setImages(selectedFiles);
              }}
            />
          </label>
          {images.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              已选择 {images.length} 张：
              {images.map(file => file.name).join("、")}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              className="admin-secondary"
            >
              取消
            </button>
            <button
              onClick={createFeedback}
              disabled={!createForm.content.trim()}
              className="admin-primary !w-auto"
            >
              提交反馈
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function FundSubjectsPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<ModuleRecord[]>(
    "/api/admin/fund/subjects",
    [],
    refresh
  );
  const initial = {
    code: "",
    name: "",
    direction: "Both",
    minAmount: "1",
    maxAmount: "1000000",
    enabled: true,
    remark: "",
  };
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState<string>();
  async function save() {
    try {
      await api(`/api/admin/fund/subjects${editing ? `/${editing}` : ""}`, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          minAmount: Number(form.minAmount),
          maxAmount: Number(form.maxAmount),
        }),
      });
      setForm(initial);
      setEditing(undefined);
      reload();
      toast.success("额度科目已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }
  async function disable(id: string) {
    await api(`/api/admin/fund/subjects/${id}`, { method: "DELETE" });
    reload();
    toast.success("额度科目已停用");
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Box>
        <Title
          title={editing ? "编辑额度科目" : "新增额度科目"}
          description="配置编码、增减方向、状态与金额上下限。"
        />
        <div className="space-y-3">
          <input
            value={form.code}
            onChange={e =>
              setForm(v => ({ ...v, code: e.target.value.toUpperCase() }))
            }
            placeholder="科目标识"
            className="admin-input"
          />
          <input
            value={form.name}
            onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
            placeholder="科目名称"
            className="admin-input"
          />
          <select
            value={form.direction}
            onChange={e => setForm(v => ({ ...v, direction: e.target.value }))}
            className="admin-input"
          >
            <option>Increase</option>
            <option>Decrease</option>
            <option>Both</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={form.minAmount}
              onChange={e =>
                setForm(v => ({ ...v, minAmount: e.target.value }))
              }
              className="admin-input"
              placeholder="最小金额"
            />
            <input
              type="number"
              value={form.maxAmount}
              onChange={e =>
                setForm(v => ({ ...v, maxAmount: e.target.value }))
              }
              className="admin-input"
              placeholder="最大金额"
            />
          </div>
          <textarea
            value={form.remark}
            onChange={e => setForm(v => ({ ...v, remark: e.target.value }))}
            placeholder="备注"
            className="admin-input"
          />
          <button onClick={save} className="admin-primary">
            保存科目
          </button>
        </div>
      </Box>
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">编码</th>
              <th>名称</th>
              <th>方向</th>
              <th>金额范围</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4 font-mono">{x.data.code}</td>
                <td>{x.name}</td>
                <td>{x.data.direction || "Both"}</td>
                <td>
                  {x.data.minAmount || "1.00"}–
                  {x.data.maxAmount || "1000000.00"}
                </td>
                <td>{badge(x.status)}</td>
                <td className="space-x-2">
                  <button
                    onClick={() => {
                      setEditing(x.id);
                      setForm({
                        code: x.data.code || "",
                        name: x.name,
                        direction: x.data.direction || "Both",
                        minAmount: x.data.minAmount || "1",
                        maxAmount: x.data.maxAmount || "1000000",
                        enabled: x.status === "Active",
                        remark: x.data.remark || "",
                      });
                    }}
                    className="admin-secondary"
                  >
                    编辑
                  </button>
                  {x.status === "Active" && (
                    <button
                      onClick={() => disable(x.id)}
                      className="admin-danger"
                    >
                      停用
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  );
}

export function FundAdjustmentsPanel({ refresh }: { refresh: number }) {
  const { data: users } = useLoad<
    { account: string; displayName: string; balance: string }[]
  >("/api/admin/wallets", [], refresh);
  const { data: subjects } = useLoad<ModuleRecord[]>(
    "/api/admin/fund/subjects",
    [],
    refresh
  );
  const [filters, setFilters] = useState({ account: "", direction: "" });
  const { data, reload } = useLoad<Page<ModuleRecord>>(
    `/api/admin/fund/adjustments?account=${encodeURIComponent(filters.account)}&direction=${filters.direction}`,
    { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    refresh
  );
  const [form, setForm] = useState({
    account: "",
    subjectCode: "",
    direction: "Increase",
    amount: "",
    note: "",
  });
  async function adjust() {
    try {
      await api("/api/admin/fund/adjustments", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      toast.success("额度已调整");
      setForm(v => ({ ...v, amount: "", note: "" }));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调整失败");
    }
  }
  return (
    <div>
      <Title
        title="额度增减记录"
        description="使用已配置科目执行调增或调减，并分页查询完整流水。"
        action={
          <button
            onClick={() =>
              document
                .getElementById("fund-adjust-form")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="admin-primary !w-auto"
          >
            <Plus size={15} />
            额度调增/调减
          </button>
        }
      />
      <Box id="fund-adjust-form" className="mb-4">
        <div className="grid gap-2 md:grid-cols-5">
          <select
            value={form.account}
            onChange={e => setForm(v => ({ ...v, account: e.target.value }))}
            className="admin-input"
          >
            <option value="">选择用户账号</option>
            {users.map(x => (
              <option key={x.account} value={x.account}>
                {x.displayName} @{x.account} · {x.balance}
              </option>
            ))}
          </select>
          <select
            value={form.subjectCode}
            onChange={e =>
              setForm(v => ({ ...v, subjectCode: e.target.value }))
            }
            className="admin-input"
          >
            <option value="">选择科目</option>
            {subjects
              .filter(x => x.status === "Active")
              .map(x => (
                <option key={x.id} value={x.data.code}>
                  {x.name} · {x.data.direction || "Both"}
                </option>
              ))}
          </select>
          <select
            value={form.direction}
            onChange={e => setForm(v => ({ ...v, direction: e.target.value }))}
            className="admin-input"
          >
            <option>Increase</option>
            <option>Decrease</option>
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={e => setForm(v => ({ ...v, amount: e.target.value }))}
            placeholder="正数金额"
            className="admin-input"
          />
          <input
            value={form.note}
            onChange={e => setForm(v => ({ ...v, note: e.target.value }))}
            placeholder="备注"
            className="admin-input"
          />
        </div>
        <button
          onClick={adjust}
          disabled={!form.account || !form.subjectCode || !form.amount}
          className="admin-primary mt-3 !w-auto"
        >
          确认调整
        </button>
      </Box>
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">时间</th>
              <th>用户账号</th>
              <th>科目</th>
              <th>方向</th>
              <th>金额</th>
              <th>调整前</th>
              <th>调整后</th>
              <th>操作人</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">{time(x.createdAtUtc)}</td>
                <td>@{x.data.account}</td>
                <td>
                  {x.name}
                  <div className="text-xs text-slate-400">
                    {x.data.subjectCode}
                  </div>
                </td>
                <td>
                  {badge(
                    x.data.direction ||
                      (Number(x.data.amount) >= 0 ? "Increase" : "Decrease")
                  )}
                </td>
                <td>{x.data.amount}</td>
                <td>{x.data.balanceBefore}</td>
                <td>{x.data.balanceAfter}</td>
                <td>{x.data.operator || "—"}</td>
                <td>{x.data.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  );
}

export function TransactionDetailsPanel({ refresh }: { refresh: number }) {
  const [draft, setDraft] = useState({
    search: "",
    minAmount: "",
    maxAmount: "",
  });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (filters.search) params.set("search", filters.search);
  if (filters.minAmount) params.set("minAmount", filters.minAmount);
  if (filters.maxAmount) params.set("maxAmount", filters.maxAmount);
  const { data } = useLoad<Page<ModuleRecord>>(
    `/api/admin/fund/transactions?${params}`,
    { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    refresh
  );
  return (
    <div>
      <Title
        title="交易明细"
        description="按账号、科目、备注和金额区间分页查询额度交易流水。"
      />
      <Box className="mb-4">
        <div className="grid gap-2 md:grid-cols-4">
          <input
            value={draft.search}
            onChange={e => setDraft(v => ({ ...v, search: e.target.value }))}
            placeholder="账号 / 科目 / 备注"
            className="admin-filter-input"
          />
          <input
            value={draft.minAmount}
            onChange={e => setDraft(v => ({ ...v, minAmount: e.target.value }))}
            type="number"
            step="0.01"
            placeholder="最小金额"
            className="admin-filter-input"
          />
          <input
            value={draft.maxAmount}
            onChange={e => setDraft(v => ({ ...v, maxAmount: e.target.value }))}
            type="number"
            step="0.01"
            placeholder="最大金额"
            className="admin-filter-input"
          />
          <button
            onClick={() => {
              setFilters({ ...draft });
              setPage(1);
            }}
            className="admin-primary !w-auto"
          >
            <Search size={15} /> 查询
          </button>
        </div>
      </Box>
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">交易时间</th>
              <th>用户</th>
              <th>科目</th>
              <th>方向</th>
              <th>金额</th>
              <th>调整前</th>
              <th>调整后</th>
              <th>操作人</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">{time(x.createdAtUtc)}</td>
                <td>@{x.data.account}</td>
                <td>
                  {x.name}
                  <div className="text-xs text-slate-400">
                    {x.data.subjectCode}
                  </div>
                </td>
                <td>{badge(x.data.direction || "—")}</td>
                <td className="font-semibold tabular-nums">{x.data.amount}</td>
                <td>{x.data.balanceBefore}</td>
                <td>{x.data.balanceAfter}</td>
                <td>{x.data.operator || "—"}</td>
                <td>{x.data.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <Empty text="暂无交易明细" />}
        <Pagination
          page={page}
          totalPages={data.totalPages}
          total={data.total}
          onPage={setPage}
        />
      </Box>
    </div>
  );
}

export function PushProvidersPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<
    {
      provider: string;
      enabled: boolean;
      appId: string;
      secretMasked: string;
      lastTestStatus: string;
      lastTestAtUtc?: string;
    }[]
  >("/api/admin/push-providers", [], refresh);
  const [editing, setEditing] = useState<string>();
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  async function save(provider: string) {
    await api(`/api/admin/push-providers/${provider}`, {
      method: "PUT",
      body: JSON.stringify({ appId, secret, enabled: "true" }),
    });
    setEditing(undefined);
    setSecret("");
    reload();
    toast.success("推送配置已加密保存");
  }
  async function test(provider: string) {
    const result = await api<{ message: string }>(
      `/api/admin/push-providers/${provider}/test`,
      { method: "POST" }
    );
    toast.info(result.message);
    reload();
  }
  return (
    <div>
      <Title
        title="安卓厂商推送设置"
        description="支持小米、华为、荣耀、OPPO 和 vivo；密钥加密保存且不回传浏览器。"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map(x => (
          <Box key={x.provider}>
            <div className="flex items-center justify-between">
              <b className="uppercase">{x.provider}</b>
              {badge(x.enabled ? "Active" : "Disabled")}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              AppId：{x.appId || "未配置"}
            </p>
            <p className="text-sm text-slate-500">
              Secret：{x.secretMasked || "未配置"}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {x.lastTestStatus} · {time(x.lastTestAtUtc)}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setEditing(x.provider);
                  setAppId(x.appId);
                }}
                className="admin-secondary"
              >
                配置
              </button>
              <button
                onClick={() => test(x.provider)}
                className="admin-secondary"
              >
                连接测试
              </button>
            </div>
          </Box>
        ))}
      </div>
      {editing && (
        <Modal
          title={`配置 ${editing.toUpperCase()} 推送`}
          onClose={() => setEditing(undefined)}
        >
          <input
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder="AppId"
            className="admin-input"
          />
          <input
            value={secret}
            onChange={e => setSecret(e.target.value)}
            type="password"
            placeholder="AppSecret / Token"
            className="admin-input mt-3"
          />
          <p className="mt-3 text-xs text-amber-700">
            连接测试仅验证本地配置完整性；配置厂商网关后才会真实投递。
          </p>
          <button onClick={() => save(editing)} className="admin-primary mt-4">
            保存
          </button>
        </Modal>
      )}
    </div>
  );
}

export function AnnouncementPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<ModuleRecord[]>(
    "/api/admin/modules/system.announcements",
    [],
    refresh
  );
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const filtered = data.filter(
    x =>
      (!search ||
        x.name.includes(search) ||
        x.data.content?.includes(search)) &&
      (!status || x.status === status)
  );
  const pageSize = 10;
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  async function create() {
    await api(
      `/api/admin/modules/system.announcements${editingId ? `/${editingId}` : ""}`,
      {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          status: "Draft",
          data: { content, target: "all" },
        }),
      }
    );
    setName("");
    setContent("");
    setEditingId(undefined);
    reload();
  }
  async function action(id: string, next: string) {
    await api(`/api/admin/announcements/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action: next }),
    });
    reload();
    toast.success(next === "publish" ? "公告已发布" : "公告已撤回");
  }
  async function remove(id: string) {
    if (!window.confirm("确定删除这条公告吗？")) return;
    await api(`/api/admin/modules/system.announcements/${id}`, {
      method: "DELETE",
    });
    reload();
    toast.success("公告已删除");
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Box>
        <Title
          title={editingId ? "编辑公告" : "新增公告"}
          description="公告先保存为草稿，再发布给在线用户；历史记录可撤回。"
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="公告标题"
          className="admin-input"
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="公告正文"
          className="admin-input mt-3 min-h-36"
        />
        <button
          onClick={create}
          disabled={!name || !content}
          className="admin-primary mt-3"
        >
          {editingId ? "保存修改" : "保存草稿"}
        </button>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(undefined);
              setName("");
              setContent("");
            }}
            className="admin-secondary mt-2"
          >
            取消编辑
          </button>
        )}
      </Box>
      <div className="grid content-start gap-3">
        <Box>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="搜索标题或正文"
              className="admin-filter-input"
            />
            <select
              value={status}
              onChange={e => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="">全部状态</option>
              <option>Draft</option>
              <option>Published</option>
              <option>Revoked</option>
            </select>
            <span className="self-center text-sm text-slate-500">
              共 {filtered.length} 条
            </span>
          </div>
        </Box>
        {rows.map(x => (
          <Box key={x.id}>
            <div className="flex justify-between">
              <b>{x.name}</b>
              {badge(x.status)}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
              {x.data.content}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setEditingId(x.id);
                  setName(x.name);
                  setContent(x.data.content || "");
                }}
                className="admin-secondary"
              >
                编辑
              </button>
              {x.status !== "Published" && (
                <button
                  onClick={() => action(x.id, "publish")}
                  className="admin-primary !w-auto"
                >
                  <Send size={15} />
                  发布
                </button>
              )}
              {x.status === "Published" && (
                <button
                  onClick={() => action(x.id, "revoke")}
                  className="admin-danger"
                >
                  撤回
                </button>
              )}
              <button onClick={() => remove(x.id)} className="admin-danger">
                删除
              </button>
            </div>
          </Box>
        ))}
        {!rows.length && (
          <Box>
            <Empty text="暂无公告" />
          </Box>
        )}
        <Box className="p-0">
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
            total={filtered.length}
            onPage={setPage}
          />
        </Box>
      </div>
    </div>
  );
}

export function OperatorsPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<User[]>("/api/admin/operators", [], refresh);
  const [form, setForm] = useState({
    account: "",
    displayName: "",
    password: "",
    role: "Admin",
  });
  const [editing, setEditing] = useState<User>();
  const [enroll, setEnroll] = useState<{
    account: string;
    secret: string;
    provisioningUri: string;
  }>();
  const [code, setCode] = useState("");
  async function create() {
    if (editing) {
      await api(`/api/admin/requirements/operators/${editing.account}`, {
        method: "PUT",
        body: JSON.stringify({
          displayName: form.displayName,
          role: "Admin",
          status: editing.status,
        }),
      });
    } else {
      await api("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ ...form, role: "Admin" }),
      });
    }
    setEditing(undefined);
    setForm({ account: "", displayName: "", password: "", role: "Admin" });
    reload();
  }
  async function remove(account: string) {
    if (!window.confirm(`确定停用管理账号 @${account} 吗？`)) return;
    await api(`/api/admin/requirements/operators/${account}`, {
      method: "DELETE",
    });
    reload();
  }
  async function startTotp(account: string) {
    const result = await api<{ secret: string; provisioningUri: string }>(
      `/api/admin/operators/${account}/totp/enroll`,
      { method: "POST" }
    );
    setEnroll({ account, ...result });
  }
  async function confirm() {
    if (!enroll) return;
    await api(`/api/admin/operators/${enroll.account}/totp/confirm`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    toast.success("Google Authenticator 已启用");
    setEnroll(undefined);
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Box>
        <Title
          title={editing ? "编辑管理账号" : "新增管理账号"}
          description="管理账号与普通用户完全隔离，统一使用 Admin 角色和独立动态验证码。"
        />
        <div className="space-y-3">
          <input
            value={form.account}
            disabled={Boolean(editing)}
            onChange={e => setForm(v => ({ ...v, account: e.target.value }))}
            placeholder="账号"
            className="admin-input"
          />
          <input
            value={form.displayName}
            onChange={e =>
              setForm(v => ({ ...v, displayName: e.target.value }))
            }
            placeholder="显示名称"
            className="admin-input"
          />
          <input
            value={form.password}
            onChange={e => setForm(v => ({ ...v, password: e.target.value }))}
            type="password"
            placeholder="至少 8 位密码"
            className="admin-input"
          />
          <button onClick={create} className="admin-primary">
            {editing ? "保存管理账号" : "创建管理账号"}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(undefined);
                setForm({
                  account: "",
                  displayName: "",
                  password: "",
                  role: "Admin",
                });
              }}
              className="admin-secondary"
            >
              取消编辑
            </button>
          )}
        </div>
      </Box>
      <div className="grid content-start gap-3">
        {data.map(x => (
          <Box key={x.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <b>{x.displayName}</b>
                <p className="text-sm text-slate-500">@{x.account}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {badge(x.role)}
                {badge(x.status)}
                <button
                  onClick={() => {
                    setEditing(x);
                    setForm({
                      account: x.account,
                      displayName: x.displayName,
                      password: "",
                      role: "Admin",
                    });
                  }}
                  className="admin-secondary"
                >
                  编辑
                </button>
                <button
                  onClick={() => remove(x.account)}
                  className="admin-danger"
                >
                  删除
                </button>
                {x.role === "Admin" && (
                  <button
                    onClick={() => startTotp(x.account)}
                    className="admin-secondary"
                  >
                    <KeyRound size={15} />
                    绑定/轮换密钥
                  </button>
                )}
              </div>
            </div>
          </Box>
        ))}
      </div>
      {enroll && (
        <Modal
          title={`绑定 Google Authenticator · @${enroll.account}`}
          onClose={() => setEnroll(undefined)}
        >
          <div className="grid place-items-center rounded-xl bg-white p-4">
            <QRCodeSVG value={enroll.provisioningUri} size={220} />
          </div>
          <p className="mt-3 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs">
            {enroll.secret}
          </p>
          <input
            value={code}
            onChange={e =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="输入应用中的 6 位验证码确认"
            className="admin-input mt-3"
          />
          <button
            onClick={confirm}
            disabled={code.length !== 6}
            className="admin-primary mt-3"
          >
            确认启用
          </button>
        </Modal>
      )}
    </div>
  );
}

export function GenericManagedPanel({
  refresh,
  title,
  description,
  module,
  fields,
  runnable = false,
  fixedNames,
}: {
  refresh: number;
  title: string;
  description: string;
  module: string;
  fields: {
    key: string;
    label: string;
    multiline?: boolean;
    options?: string[];
    optionLabels?: Record<string, string>;
  }[];
  runnable?: boolean;
  fixedNames?: string[];
}) {
  const { data, reload } = useLoad<ModuleRecord[]>(
    `/api/admin/modules/${module}`,
    [],
    refresh
  );
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const filtered = data.filter(
    item =>
      (!search ||
        item.name.includes(search) ||
        Object.values(item.data).some(value => value.includes(search))) &&
      (!statusFilter || item.status === statusFilter)
  );
  const pageSize = 10;
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  async function save() {
    await api(
      `/api/admin/modules/${module}${editingId ? `/${editingId}` : ""}`,
      {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({ name, status: "Active", data: values }),
      }
    );
    setName("");
    setValues({});
    setEditingId(undefined);
    reload();
    toast.success("配置已保存");
  }
  async function remove(id: string) {
    if (!window.confirm(`确定删除这个${title}吗？`)) return;
    await api(`/api/admin/modules/${module}/${id}`, { method: "DELETE" });
    reload();
    toast.success("记录已删除");
  }
  async function run(id: string) {
    await api(`/api/admin/automations/${id}/run`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    toast.success("已人工触发并记录发送日志");
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Box>
        <Title
          title={`${editingId ? "编辑" : fixedNames ? "选择" : "新增"}${title}`}
          description={description}
        />
        {fixedNames ? (
          <select
            value={name}
            onChange={event => {
              const selectedName = event.target.value;
              const existing = data.find(item => item.name === selectedName);
              setName(selectedName);
              setEditingId(existing?.id);
              setValues(existing?.data || {});
            }}
            className="admin-input"
          >
            <option value="">请选择固定角色</option>
            {fixedNames.map(fixedName => (
              <option key={fixedName} value={fixedName}>
                {fixedName}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`${title}名称`}
            className="admin-input"
          />
        )}
        {fields.map(f =>
          f.options ? (
            <label key={f.key} className="mt-3 block text-sm text-slate-600">
              {f.label}
              <select
                multiple
                value={String(values[f.key] || "")
                  .split(",")
                  .filter(Boolean)}
                onChange={e => {
                  const selected = Array.from(e.currentTarget.options)
                    .filter(option => option.selected)
                    .map(option => option.value)
                    .join(",");
                  setValues(v => ({ ...v, [f.key]: selected }));
                }}
                className="admin-input mt-2 min-h-40"
              >
                {f.options.map(option => (
                  <option key={option} value={option}>
                    {f.optionLabels?.[option] || option}
                  </option>
                ))}
              </select>
            </label>
          ) : f.multiline ? (
            <textarea
              key={f.key}
              value={values[f.key] || ""}
              onChange={e =>
                setValues(v => ({ ...v, [f.key]: e.target.value }))
              }
              placeholder={f.label}
              className="admin-input mt-3 min-h-24"
            />
          ) : (
            <input
              key={f.key}
              value={values[f.key] || ""}
              onChange={e =>
                setValues(v => ({ ...v, [f.key]: e.target.value }))
              }
              placeholder={f.label}
              className="admin-input mt-3"
            />
          )
        )}
        <div className="mt-3 flex gap-2">
          <button onClick={save} disabled={!name} className="admin-primary">
            保存
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(undefined);
                setName("");
                setValues({});
              }}
              className="admin-secondary"
            >
              取消编辑
            </button>
          )}
        </div>
      </Box>
      <div className="grid content-start gap-3">
        <Box>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={`搜索${title}名称或内容`}
              className="admin-filter-input"
            />
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="">全部状态</option>
              <option>Active</option>
              <option>Disabled</option>
            </select>
          </div>
        </Box>
        {rows.map(x => (
          <Box key={x.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex gap-2">
                  <b>{x.name}</b>
                  {badge(x.status)}
                </div>
                {Object.entries(x.data).map(([k, v]) => (
                  <p
                    key={k}
                    className="mt-1 max-w-3xl break-all text-sm text-slate-500"
                  >
                    <span className="font-medium text-slate-700">
                      {fields.find(field => field.key === k)?.label || k}：
                    </span>
                    {fields.find(field => field.key === k)?.optionLabels
                      ? v
                          .split(",")
                          .filter(Boolean)
                          .map(
                            value =>
                              fields.find(field => field.key === k)
                                ?.optionLabels?.[value] || value
                          )
                          .join("、")
                      : v}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setEditingId(x.id);
                    setName(x.name);
                    setValues(x.data);
                  }}
                  className="admin-secondary"
                >
                  编辑
                </button>
                {runnable && (
                  <button
                    onClick={() => run(x.id)}
                    className="admin-primary !w-auto"
                  >
                    <Send size={15} />
                    人工触发
                  </button>
                )}
                {!fixedNames && (
                  <button onClick={() => remove(x.id)} className="admin-danger">
                    删除
                  </button>
                )}
              </div>
            </div>
          </Box>
        ))}
        {!rows.length && (
          <Box>
            <Empty text={`暂无${title}`} />
          </Box>
        )}
        <Box className="p-0">
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
            total={filtered.length}
            onPage={setPage}
          />
        </Box>
      </div>
    </div>
  );
}

export function ConversationsPanel({
  refresh,
  groupsOnly = false,
}: {
  refresh: number;
  groupsOnly?: boolean;
}) {
  const { data, reload } = useLoad<Conversation[]>(
    "/api/admin/conversations",
    [],
    refresh
  );
  const [details, setDetails] = useState<any>();
  const rows = groupsOnly ? data.filter(x => x.type === "Group") : data;
  async function view(id: string) {
    setDetails(await api(`/api/admin/conversations/${id}/messages?limit=100`));
  }
  async function action(item: Conversation) {
    await api(`/api/admin/conversations/${item.id}/action`, {
      method: "POST",
      body: JSON.stringify({
        action: item.isDissolved ? "restore" : "dissolve",
        note: "文档后台操作",
      }),
    });
    reload();
  }
  return (
    <div>
      <Title
        title={groupsOnly ? "群监控" : "会话管理"}
        description={
          groupsOnly
            ? "查看群主、人数、消息数量和运行状态。"
            : "分页查看会话元数据，并审计新明文与历史密文消息时间线。"
        }
      />
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">会话</th>
              <th>类型</th>
              <th>创建者</th>
              <th>成员</th>
              <th>消息</th>
              <th>最后消息</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">
                  <b>{x.name || "未命名会话"}</b>
                  <div className="font-mono text-xs text-slate-400">{x.id}</div>
                </td>
                <td>{x.type}</td>
                <td>{x.createdBy}</td>
                <td>{x.memberCount}</td>
                <td>{x.lastSequence}</td>
                <td>{time(x.lastMessageAtUtc)}</td>
                <td>{badge(x.isDissolved ? "Dissolved" : "Active")}</td>
                <td className="space-x-2">
                  <button
                    onClick={() => view(x.id)}
                    className="admin-secondary"
                  >
                    <Eye size={15} />
                    聊天记录
                  </button>
                  {x.type === "Group" && (
                    <button onClick={() => action(x)} className="admin-danger">
                      {x.isDissolved ? "恢复" : "解散"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      {details && (
        <Modal
          title={`聊天记录 · ${details.conversation.name || details.conversation.id}`}
          onClose={() => setDetails(undefined)}
          wide
        >
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            新消息按需求以明文保存并可在后台查看；协议切换前的 AES-GCM
            历史消息仍只显示密文。
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {details.messages.map((m: any) => (
              <div key={m.id} className="rounded-xl bg-slate-50 p-4">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>
                    {m.displayName || m.account || m.senderId} · #{m.sequence} ·{" "}
                    {m.kind}
                  </span>
                  <span>{time(m.sentAtUtc)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {m.plaintextAvailable
                    ? m.content || "（空消息）"
                    : `历史加密消息：${m.ciphertext.slice(0, 240)}${m.ciphertext.length > 240 ? "…" : ""}`}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ConversationSearchPanel({
  refresh,
  groupsOnly = false,
}: {
  refresh: number;
  groupsOnly?: boolean;
}) {
  type Row = Conversation & { owner: string; members: string[] };
  const [draft, setDraft] = useState({ search: "", account: "", status: "" });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<any>();
  const [groupForm, setGroupForm] = useState<{
    id?: string;
    name: string;
    ownerAccount: string;
    memberAccounts: string;
  }>({ name: "", ownerAccount: "", memberAccounts: "" });
  const [showGroupForm, setShowGroupForm] = useState(false);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
    groupsOnly: String(groupsOnly),
  });
  Object.entries(filters).forEach(
    ([key, value]) => value && params.set(key, value)
  );
  const { data, reload } = useLoad<Page<Row>>(
    `/api/admin/chat/conversations?${params}`,
    { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    refresh
  );
  async function view(id: string) {
    setDetails(await api(`/api/admin/conversations/${id}/messages?limit=100`));
  }
  async function action(item: Row) {
    await api(`/api/admin/conversations/${item.id}/action`, {
      method: "POST",
      body: JSON.stringify({
        action: item.isDissolved ? "restore" : "dissolve",
        note: "V2 后台操作",
      }),
    });
    reload();
  }
  async function saveGroup() {
    if (groupForm.id) {
      await api(`/api/admin/chat/groups/${groupForm.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: groupForm.name }),
      });
    } else {
      await api("/api/admin/chat/groups", {
        method: "POST",
        body: JSON.stringify({
          name: groupForm.name,
          ownerAccount: groupForm.ownerAccount,
          memberAccounts: groupForm.memberAccounts
            .split(/[\s,，]+/)
            .filter(Boolean),
        }),
      });
    }
    setShowGroupForm(false);
    setGroupForm({ name: "", ownerAccount: "", memberAccounts: "" });
    reload();
    toast.success("群资料已保存");
  }
  return (
    <div>
      <Title
        title={groupsOnly ? "群管理" : "会话管理"}
        description={
          groupsOnly
            ? "按群号、群名、群主、成员和状态筛选群聊。"
            : "按会话号、名称、成员账号和状态分页查询。"
        }
        action={
          groupsOnly ? (
            <button
              onClick={() => setShowGroupForm(true)}
              className="admin-primary !w-auto"
            >
              新增群聊
            </button>
          ) : undefined
        }
      />
      <Box className="mb-4">
        <div className="grid gap-2 md:grid-cols-4">
          <input
            value={draft.search}
            onChange={e => setDraft(v => ({ ...v, search: e.target.value }))}
            placeholder={groupsOnly ? "群号 / 群名" : "会话号 / 名称"}
            className="admin-filter-input"
          />
          <input
            value={draft.account}
            onChange={e => setDraft(v => ({ ...v, account: e.target.value }))}
            placeholder="群主 / 成员账号"
            className="admin-filter-input"
          />
          <select
            value={draft.status}
            onChange={e => setDraft(v => ({ ...v, status: e.target.value }))}
            className="admin-filter-select"
          >
            <option value="">全部状态</option>
            <option value="Active">正常</option>
            <option value="Dissolved">已解散</option>
          </select>
          <button
            onClick={() => {
              setFilters({ ...draft });
              setPage(1);
            }}
            className="admin-primary !w-auto"
          >
            <Search size={15} /> 查询
          </button>
        </div>
      </Box>
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">{groupsOnly ? "群" : "会话"}</th>
              <th>类型</th>
              <th>群主/创建者</th>
              <th>成员</th>
              <th>人数</th>
              <th>消息数</th>
              <th>最后消息</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">
                  <b>{x.name || "未命名"}</b>
                  <div className="font-mono text-xs text-slate-400">{x.id}</div>
                </td>
                <td>{x.type}</td>
                <td>@{x.owner}</td>
                <td className="max-w-56 truncate" title={x.members.join(", ")}>
                  {x.members.join(", ") || "—"}
                </td>
                <td>{x.memberCount}</td>
                <td>{x.lastSequence}</td>
                <td>{time(x.lastMessageAtUtc)}</td>
                <td>{badge(x.isDissolved ? "Dissolved" : "Active")}</td>
                <td className="space-x-2">
                  <button
                    onClick={() => view(x.id)}
                    className="admin-secondary"
                  >
                    <Eye size={15} />
                    聊天记录
                  </button>
                  {x.type === "Group" && (
                    <>
                      <button
                        onClick={() => {
                          setGroupForm({
                            id: x.id,
                            name: x.name,
                            ownerAccount: x.owner,
                            memberAccounts: x.members.join(","),
                          });
                          setShowGroupForm(true);
                        }}
                        className="admin-secondary"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => action(x)}
                        className={
                          x.isDissolved ? "admin-secondary" : "admin-danger"
                        }
                      >
                        {x.isDissolved ? "恢复" : "解散"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && (
          <Empty text={groupsOnly ? "暂无群聊" : "暂无会话"} />
        )}
        <Pagination
          page={page}
          totalPages={data.totalPages}
          total={data.total}
          onPage={setPage}
        />
      </Box>
      {details && (
        <Modal
          title={`聊天记录 · ${details.conversation.name || details.conversation.id}`}
          onClose={() => setDetails(undefined)}
          wide
        >
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            新消息按需求以明文保存并可在后台查看；协议切换前的 AES-GCM
            历史消息仍只显示密文。
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {details.messages.map((message: any) => (
              <div key={message.id} className="rounded-xl bg-slate-50 p-4">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>
                    {message.displayName || message.account || message.senderId}{" "}
                    · #{message.sequence} · {message.kind}
                  </span>
                  <span>{time(message.sentAtUtc)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {message.plaintextAvailable
                    ? message.content || "（空消息）"
                    : `历史加密消息：${message.ciphertext.slice(0, 240)}${message.ciphertext.length > 240 ? "…" : ""}`}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {showGroupForm && (
        <Modal
          title={groupForm.id ? "编辑群聊" : "新增群聊"}
          onClose={() => setShowGroupForm(false)}
        >
          <input
            value={groupForm.name}
            onChange={event =>
              setGroupForm(value => ({ ...value, name: event.target.value }))
            }
            placeholder="群名称"
            className="admin-input"
          />
          {!groupForm.id && (
            <>
              <input
                value={groupForm.ownerAccount}
                onChange={event =>
                  setGroupForm(value => ({
                    ...value,
                    ownerAccount: event.target.value,
                  }))
                }
                placeholder="群主账号"
                className="admin-input mt-3"
              />
              <textarea
                value={groupForm.memberAccounts}
                onChange={event =>
                  setGroupForm(value => ({
                    ...value,
                    memberAccounts: event.target.value,
                  }))
                }
                placeholder="成员账号，使用空格或逗号分隔"
                className="admin-input mt-3 min-h-28"
              />
              <p className="mt-2 text-xs text-amber-700">
                后台建群会临时生成 AES 群密钥并仅保存成员 RSA-OAEP
                密钥信封，明文密钥不会持久化。
              </p>
            </>
          )}
          <button
            onClick={saveGroup}
            disabled={
              !groupForm.name || (!groupForm.id && !groupForm.ownerAccount)
            }
            className="admin-primary mt-4"
          >
            保存
          </button>
        </Modal>
      )}
    </div>
  );
}

export function ContactsPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<
    {
      id: string;
      user: string;
      peer: string;
      status: string;
      remark: string;
      updatedAtUtc: string;
    }[]
  >("/api/admin/contacts", [], refresh);
  async function update(id: string, status: string) {
    await api(`/api/admin/contacts/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status, remark: "后台调整" }),
    });
    reload();
  }
  return (
    <div>
      <Title
        title="通讯录"
        description="查询用户好友、屏蔽和删除关系，并可执行关系治理。"
      />
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">用户</th>
              <th>联系人</th>
              <th>关系</th>
              <th>备注</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">@{x.user}</td>
                <td>@{x.peer}</td>
                <td>{badge(x.status)}</td>
                <td>{x.remark || "—"}</td>
                <td>{time(x.updatedAtUtc)}</td>
                <td className="space-x-2">
                  <button
                    onClick={() => update(x.id, "Friend")}
                    className="admin-secondary"
                  >
                    恢复好友
                  </button>
                  <button
                    onClick={() => update(x.id, "Blocked")}
                    className="admin-danger"
                  >
                    屏蔽
                  </button>
                  <button
                    onClick={() => update(x.id, "Deleted")}
                    className="admin-danger"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  );
}

export function GroupInvitesPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<ModuleRecord[]>(
    "/api/admin/group-invites",
    [],
    refresh
  );
  const { data: conversations } = useLoad<Conversation[]>(
    "/api/admin/conversations",
    [],
    refresh
  );
  const [form, setForm] = useState({
    code: "",
    conversationId: "",
    maxUses: "100",
    expiresAtUtc: "",
  });
  async function save() {
    await api("/api/admin/group-invites", {
      method: "POST",
      body: JSON.stringify({
        code: form.code,
        conversationId: form.conversationId,
        maxUses: Number(form.maxUses),
        expiresAtUtc: form.expiresAtUtc
          ? new Date(form.expiresAtUtc).toISOString()
          : null,
        enabled: true,
      }),
    });
    reload();
    toast.success("群邀请码已保存");
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Box>
        <Title
          title="新增群邀请码"
          description="选择真实群聊并配置次数和有效期；与注册邀请码严格分离。"
        />
        <input
          value={form.code}
          onChange={e =>
            setForm(v => ({ ...v, code: e.target.value.toUpperCase() }))
          }
          placeholder="6–16 位群邀请码"
          className="admin-input"
        />
        <select
          value={form.conversationId}
          onChange={e =>
            setForm(v => ({ ...v, conversationId: e.target.value }))
          }
          className="admin-input mt-3"
        >
          <option value="">选择群聊</option>
          {conversations
            .filter(x => x.type === "Group")
            .map(x => (
              <option key={x.id} value={x.id}>
                {x.name || x.id}
              </option>
            ))}
        </select>
        <input
          type="number"
          value={form.maxUses}
          onChange={e => setForm(v => ({ ...v, maxUses: e.target.value }))}
          className="admin-input mt-3"
          placeholder="可用次数"
        />
        <input
          type="datetime-local"
          value={form.expiresAtUtc}
          onChange={e => setForm(v => ({ ...v, expiresAtUtc: e.target.value }))}
          className="admin-input mt-3"
        />
        <button
          onClick={save}
          disabled={!form.code || !form.conversationId}
          className="admin-primary mt-3"
        >
          提交
        </button>
      </Box>
      <div className="grid content-start gap-3">
        {data.map(x => (
          <Box key={x.id}>
            <div className="flex justify-between">
              <div>
                <b>{x.data.groupName || x.name}</b>
                <p className="mt-1 font-mono text-sm">{x.data.code}</p>
              </div>
              {badge(x.status)}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              已用 {x.data.usedCount || 0} / {x.data.maxUses} ·{" "}
              {time(x.data.expiresAtUtc)}
            </p>
          </Box>
        ))}
      </div>
    </div>
  );
}

export function ErrorLogsPanel({ refresh }: { refresh: number }) {
  const { data, reload } = useLoad<ModuleRecord[]>(
    "/api/admin/modules/system.error-logs",
    [],
    refresh
  );
  const [selected, setSelected] = useState<ModuleRecord>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const filtered = data.filter(
    item =>
      (!search ||
        item.name.includes(search) ||
        Object.values(item.data).some(value => value.includes(search))) &&
      (!status || item.status === status)
  );
  const pageSize = 20;
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  async function resolve(id: string) {
    await api(`/api/admin/error-logs/${id}/resolve`, { method: "POST" });
    setSelected(undefined);
    reload();
  }
  return (
    <div>
      <Title
        title="报错日志"
        description="按 traceId、请求路径、异常类型和处理状态查看 API 错误。"
        action={
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="异常 / TraceId / 路径 / 用户"
              className="admin-filter-input"
            />
            <select
              value={status}
              onChange={event => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="">全部状态</option>
              <option>Open</option>
              <option>Resolved</option>
            </select>
          </div>
        }
      />
      <Box className="overflow-x-auto p-0">
        <table className="w-full min-w-[1450px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">时间</th>
              <th>异常</th>
              <th>用户</th>
              <th>设备/型号</th>
              <th>系统/APP</th>
              <th>IP/地址</th>
              <th>方法/路径</th>
              <th>TraceId</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.id} className="border-t">
                <td className="p-4">{time(x.createdAtUtc)}</td>
                <td>{x.name}</td>
                <td>{x.data.userId || "—"}</td>
                <td>
                  {x.data.deviceType || "—"} · {x.data.deviceModel || "—"}
                </td>
                <td>
                  {x.data.osVersion || "—"} · {x.data.appVersion || "Web"}
                </td>
                <td>
                  {x.data.ip || "—"}
                  <div className="text-xs text-slate-400">
                    {x.data.address || "—"}
                  </div>
                </td>
                <td>
                  {x.data.method} {x.data.path}
                </td>
                <td className="font-mono text-xs">{x.data.traceId}</td>
                <td>{badge(x.status)}</td>
                <td>
                  <button
                    onClick={() => setSelected(x)}
                    className="admin-secondary"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text="暂无报错日志" />}
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
          total={filtered.length}
          onPage={setPage}
        />
      </Box>
      {selected && (
        <Modal title="报错日志详情" onClose={() => setSelected(undefined)}>
          <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <p>
              <b>TraceId：</b>
              {selected.data.traceId}
            </p>
            <p>
              <b>请求：</b>
              {selected.data.method} {selected.data.path}
            </p>
            <p className="break-all">
              <b>异常：</b>
              {selected.data.message}
            </p>
            <p>
              <b>时间：</b>
              {time(selected.createdAtUtc)}
            </p>
            <p>
              <b>用户：</b>
              {selected.data.userId || "—"}
            </p>
            <p>
              <b>设备：</b>
              {selected.data.deviceType || "—"} ·{" "}
              {selected.data.deviceModel || "—"}
            </p>
            <p>
              <b>系统/版本：</b>
              {selected.data.osVersion || "—"} ·{" "}
              {selected.data.appVersion || "Web"}
            </p>
            <p>
              <b>IP/地址：</b>
              {selected.data.ip || "—"} · {selected.data.address || "—"}
            </p>
          </div>
          <button
            onClick={() => resolve(selected.id)}
            className="admin-primary mt-4"
          >
            标记已处理
          </button>
        </Modal>
      )}
    </div>
  );
}
