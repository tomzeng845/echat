import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  Crown,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { api, type ConversationMember } from "@/lib/echat-api";
import { resolveBuiltinAvatar } from "@/lib/builtin-avatars";
import QrCodeCard from "@/components/qr/QrCodeCard";
import QrCodeScanner from "@/components/qr/QrCodeScanner";

type GroupInfo = {
  id: string;
  name: string;
  announcement: string;
  remark: string;
  requireJoinApproval: boolean;
  members: ConversationMember[];
  joinRequests: string[];
};

type Props = {
  conversationId: string;
  messages: Array<{ id: string; plaintext: string; sentAtUtc: string }>;
  onClose: () => void;
  onChanged: () => void;
  onClear: () => void;
  onLeave: () => void;
  friendUserIds: string[];
  onMessageMember: (member: ConversationMember) => void;
  onVoiceCallMember: (member: ConversationMember) => void;
  onAddFriendMember: (member: ConversationMember) => void;
};

export default function GroupInfoPanel({
  conversationId,
  messages,
  onClose,
  onChanged,
  onClear,
  onLeave,
  friendUserIds,
  onMessageMember,
  onVoiceCallMember,
  onAddFriendMember,
}: Props) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [page, setPage] = useState<"info" | "manage" | "search">("info");
  const [qr, setQr] = useState<{
    qrPayload: string;
    expiresAtUtc: string;
    groupName: string;
  } | null>(null);
  const [editing, setEditing] = useState<
    "name" | "announcement" | "remark" | null
  >(null);
  const [value, setValue] = useState("");
  const [account, setAccount] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; senderId: string; content: string; sentAtUtc: string }>
  >([]);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState("");
  const [profileMember, setProfileMember] = useState<ConversationMember | null>(
    null
  );

  async function load() {
    try {
      setInfo(await api<GroupInfo>(`/api/groups/${conversationId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "群资料加载失败");
    }
  }
  useEffect(() => {
    void load();
  }, [conversationId]);
  async function save(kind: string) {
    if (kind !== "announcement" && !value.trim()) return;
    await api(`/api/groups/${conversationId}/${kind}`, {
      method: "PUT",
      body: JSON.stringify(
        kind === "name"
          ? { name: value }
          : kind === "announcement"
            ? { announcement: value }
            : { remark: value }
      ),
    });
    setEditing(null);
    await load();
    onChanged();
  }
  async function clearAnnouncement() {
    await api(`/api/groups/${conversationId}/announcement`, {
      method: "PUT",
      body: JSON.stringify({ announcement: "" }),
    });
    await load();
    onChanged();
  }
  async function createQr() {
    setQr(
      await api(`/api/qr/group/${conversationId}/create`, { method: "POST" })
    );
  }
  async function addMember() {
    if (!account.trim()) return;
    await api(`/api/groups/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: account.trim() }),
    });
    setAccount("");
    await load();
    onChanged();
  }
  async function removeMember(id: string) {
    await api(`/api/groups/${conversationId}/members/${id}`, {
      method: "DELETE",
    });
    await load();
    onChanged();
  }
  async function decide(id: string, approve: boolean) {
    await api(`/api/groups/${conversationId}/join-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ userId: id, approve }),
    });
    await load();
    onChanged();
  }
  function searchMessages() {
    setResults(
      messages
        .filter(item =>
          item.plaintext.toLowerCase().includes(query.toLowerCase())
        )
        .map(item => ({ ...item, senderId: "", content: item.plaintext }))
    );
  }
  async function setRole(userId: string, role: "Admin" | "Member") {
    await api(`/api/groups/${conversationId}/members/role`, {
      method: "PUT",
      body: JSON.stringify({ userId, role }),
    });
    await load();
    onChanged();
  }
  async function transferOwner(userId: string) {
    if (!window.confirm("确定转让群主吗？转让后你将成为群管理员。")) return;
    await api(`/api/groups/${conversationId}/transfer-owner`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    await load();
    onChanged();
  }

  if (!info)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
        <div className="rounded-2xl bg-white p-6 text-sm">
          {error || "正在加载群资料…"}
        </div>
      </div>
    );
  if (scan)
    return (
      <QrCodeScanner
        onClose={() => setScan(false)}
        onDetected={async raw => {
          try {
            const match = /^echat:\/\/group\/([A-Za-z0-9_-]{40,})$/i.exec(raw);
            if (!match) throw new Error("不是群二维码");
            const preview = await api<{
              groupName: string;
              memberCount: number;
              requireApproval: boolean;
            }>("/api/qr/group/preview", {
              method: "POST",
              body: JSON.stringify({ token: match[1] }),
            });
            if (
              !window.confirm(
                `加入群聊“${preview.groupName}”？${preview.requireApproval ? "需要群主或管理员审核。" : ""}`
              )
            )
              return;
            await api("/api/qr/group/join", {
              method: "POST",
              body: JSON.stringify({ token: match[1] }),
            });
            setScan(false);
            onChanged();
          } catch (e) {
            setError(e instanceof Error ? e.message : "入群失败");
            setScan(false);
          }
        }}
      />
    );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 p-0 md:p-6">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-[#f3f6f7] shadow-2xl md:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white/95 px-4 py-4 backdrop-blur">
          <button
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-100"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">
              聊天信息（{info.members.length}）
            </h2>
            <p className="text-xs text-slate-400">{info.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </header>
        <section className="grid grid-cols-2 gap-3 bg-white p-4">
          <button
            onClick={() => setPage("info")}
            className={`rounded-xl py-2 text-sm ${page === "info" ? "bg-teal-500 text-white" : "bg-slate-100"}`}
          >
            群资料
          </button>
          <button
            onClick={() => setPage("manage")}
            className={`rounded-xl py-2 text-sm ${page === "manage" ? "bg-teal-500 text-white" : "bg-slate-100"}`}
          >
            群管理
          </button>
        </section>
        {page === "info" && (
          <>
            <section className="mb-3 bg-white p-4">
              <div className="grid grid-cols-5 gap-3">
                {info.members.slice(0, 9).map(member => (
                  <div
                    key={member.userId}
                    className="cursor-pointer text-center text-xs text-slate-600"
                    onClick={() => setProfileMember(member)}
                  >
                    <img
                      src={resolveBuiltinAvatar(member.avatarUrl)}
                      alt={member.displayName}
                      className="mx-auto h-12 w-12 rounded-xl object-cover"
                    />
                    <p className="mt-1 truncate">{member.displayName}</p>
                  </div>
                ))}
                <button
                  onClick={() => setPage("manage")}
                  className="grid h-16 place-items-center rounded-xl border border-dashed text-slate-400"
                >
                  <Plus size={22} />
                </button>
              </div>
            </section>
            <GroupRow
              label="群聊名称"
              value={info.name}
              onClick={() => {
                setEditing("name");
                setValue(info.name);
              }}
            />
            <GroupRow
              label="群二维码"
              value="点击生成或扫码加入"
              icon={<QrCode size={18} />}
              onClick={createQr}
            />
            <GroupRow
              label="群公告"
              value={info.announcement || "未设置"}
              onClick={() => {
                setEditing("announcement");
                setValue(info.announcement);
              }}
            />
            {info.announcement && (
              <button
                type="button"
                onClick={() => void clearAnnouncement()}
                className="w-full rounded-xl bg-amber-50 px-4 py-2.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                关闭当前群公告
              </button>
            )}
            <GroupRow
              label="群管理"
              value="成员、管理员、进群审核"
              onClick={() => setPage("manage")}
            />
            <GroupRow
              label="备注"
              value={info.remark || "未设置"}
              onClick={() => {
                setEditing("remark");
                setValue(info.remark);
              }}
            />
            <GroupRow
              label="查找聊天内容"
              value="按关键词查找"
              icon={<Search size={18} />}
              onClick={() => setPage("search")}
            />
            <button
              onClick={onClear}
              className="mt-3 w-full bg-white p-4 text-left text-rose-600"
            >
              清空聊天记录
            </button>
            <button
              onClick={onLeave}
              className="mt-3 w-full bg-white p-4 text-center text-rose-600"
            >
              退出群聊
            </button>
          </>
        )}
        {page === "manage" && (
          <section className="space-y-3 p-3">
            <div className="rounded-2xl bg-white p-4">
              <h3 className="font-semibold">二维码进群</h3>
              <p className="mt-1 text-xs text-slate-500">
                可设置进群需要群主或管理员确认。
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={createQr}
                  className="flex-1 rounded-xl bg-slate-900 py-2 text-sm text-white"
                >
                  生成群二维码
                </button>
                <button
                  onClick={() => setScan(true)}
                  className="flex-1 rounded-xl bg-teal-500 py-2 text-sm text-white"
                >
                  扫描入群
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={info.requireJoinApproval}
                  onChange={async e => {
                    await api(`/api/groups/${conversationId}/join-approval`, {
                      method: "PUT",
                      body: JSON.stringify({
                        requireApproval: e.target.checked,
                      }),
                    });
                    await load();
                  }}
                />
                进群需要管理员确认
              </label>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <h3 className="font-semibold">增加群员</h3>
              <div className="mt-3 flex gap-2">
                <input
                  value={account}
                  onChange={e => setAccount(e.target.value)}
                  placeholder="输入用户 ID"
                  className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm"
                />
                <button
                  onClick={addMember}
                  className="rounded-xl bg-teal-500 px-4 text-sm text-white"
                >
                  添加
                </button>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <h3 className="font-semibold">群成员</h3>
              <div className="mt-3 space-y-2">
                {info.members.map(member => (
                  <div key={member.userId} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setProfileMember(member)}
                    >
                      <img
                        src={resolveBuiltinAvatar(member.avatarUrl)}
                        alt={member.displayName}
                        className="h-9 w-9 rounded-xl object-cover"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{member.displayName}</p>
                      <p className="text-xs text-slate-400">
                        {member.role === "Owner"
                          ? "群主"
                          : member.role === "Admin"
                            ? "群管理员"
                            : "成员"}
                      </p>
                    </div>
                    {member.role !== "Owner" && (
                      <div className="flex gap-1">
                        <button
                          title={
                            member.role === "Admin"
                              ? "取消管理员"
                              : "设为管理员"
                          }
                          onClick={() =>
                            setRole(
                              member.userId,
                              member.role === "Admin" ? "Member" : "Admin"
                            )
                          }
                          className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
                        >
                          <Shield size={16} />
                        </button>
                        <button
                          title="转让群主"
                          onClick={() => transferOwner(member.userId)}
                          className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
                        >
                          <Crown size={16} />
                        </button>
                        <button
                          onClick={() => removeMember(member.userId)}
                          className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {info.joinRequests.length > 0 && (
              <div className="rounded-2xl bg-white p-4">
                <h3 className="font-semibold">待审核入群申请</h3>
                {info.joinRequests.map(id => (
                  <div key={id} className="mt-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {id}
                    </span>
                    <button
                      onClick={() => decide(id, true)}
                      className="rounded-lg bg-teal-500 p-2 text-white"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => decide(id, false)}
                      className="rounded-lg bg-slate-100 p-2"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {page === "search" && (
          <section className="p-3">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜索聊天内容"
                className="min-w-0 flex-1 rounded-xl bg-white px-3 py-3 text-sm"
              />
              <button
                onClick={searchMessages}
                className="rounded-xl bg-teal-500 px-4 text-white"
              >
                <Search size={17} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {results.map(item => (
                <div key={item.id} className="rounded-xl bg-white p-3 text-sm">
                  <p>{item.content}</p>
                  <time className="text-xs text-slate-400">
                    {new Date(item.sentAtUtc).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {editing && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-semibold">
              {editing === "name"
                ? "修改群聊名称"
                : editing === "announcement"
                  ? "设置群公告"
                  : "设置备注"}
            </h3>
            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              className="mt-4 min-h-28 w-full rounded-xl bg-slate-100 p-3 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl bg-slate-100 py-2"
              >
                取消
              </button>
              <button
                onClick={() => save(editing)}
                className="flex-1 rounded-xl bg-teal-500 py-2 text-white"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {qr && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4">
          <div className="w-full max-w-sm">
            <button
              onClick={() => setQr(null)}
              className="mb-2 float-right rounded-xl bg-white p-2"
            >
              <X size={18} />
            </button>
            <QrCodeCard
              value={qr.qrPayload}
              label={`${qr.groupName} 群二维码`}
              expiresAt={qr.expiresAtUtc}
            />
          </div>
        </div>
      )}
      {profileMember && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/45 p-5">
          <section className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={resolveBuiltinAvatar(profileMember.avatarUrl)}
                  alt={profileMember.displayName}
                  className="h-16 w-16 rounded-2xl object-cover"
                />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {profileMember.displayName}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    ID：{profileMember.account || profileMember.userId}
                  </p>
                  <p className="text-xs text-slate-400">
                    用户编号：{profileMember.userId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileMember(null)}
                className="rounded-xl p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {friendUserIds.includes(profileMember.userId) ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMember(null);
                      onMessageMember(profileMember);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-sm font-medium text-white"
                  >
                    <MessageCircle size={16} /> 发消息
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMember(null);
                      onVoiceCallMember(profileMember);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-medium text-white"
                  >
                    <Phone size={16} /> 语音通话
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setProfileMember(null);
                    onAddFriendMember(profileMember);
                  }}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-sm font-medium text-white"
                >
                  <UserPlus size={16} /> 添加好友
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function GroupRow({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-px flex w-full items-center gap-3 bg-white p-4 text-left hover:bg-slate-50"
    >
      <span className="flex-1 text-sm text-slate-800">{label}</span>
      <span className="flex items-center gap-2 text-sm text-slate-400">
        {icon}
        {value}
      </span>
      <span className="text-slate-300">›</span>
    </button>
  );
}
