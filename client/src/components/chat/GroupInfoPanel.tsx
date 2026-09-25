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
  VolumeX,
  X,
} from "lucide-react";
import { api, type Contact, type ConversationMember } from "@/lib/echat-api";
import { resolveBuiltinAvatar } from "@/lib/builtin-avatars";
import QrCodeCard from "@/components/qr/QrCodeCard";
import QrCodeScanner from "@/components/qr/QrCodeScanner";

type GroupInfo = {
  id: string;
  name: string;
  announcement: string;
  remark: string;
  requireJoinApproval: boolean;
  allowMemberAddFriend: boolean;
  muteAll: boolean;
  disableRecall: boolean;
  disableNameChange: boolean;
  hideMemberCount: boolean;
  historyVisibleToNewMembers: boolean;
  members: ConversationMember[];
  memberCount: number;
  membersPageSize?: number;
  joinRequests: string[];
};

type Props = {
  conversationId: string;
  messages: Array<{ id: string; plaintext: string; sentAtUtc: string }>;
  onClose: () => void;
  onDissolved: () => void;
  onChanged: () => void;
  onClear: () => void;
  onLeave: () => void;
  currentUserId: string;
  contacts: Contact[];
  friendUserIds: string[];
  onMessageMember: (member: ConversationMember) => void;
  onVoiceCallMember: (member: ConversationMember) => void;
  onAddFriendMember: (member: ConversationMember) => void;
};

export default function GroupInfoPanel({
  conversationId,
  messages,
  onClose,
  onDissolved,
  onChanged,
  onClear,
  onLeave,
  currentUserId,
  contacts,
  friendUserIds,
  onMessageMember,
  onVoiceCallMember,
  onAddFriendMember,
}: Props) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [page, setPage] = useState<"info" | "manage" | "invite" | "search">("info");
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
  const [dissolving, setDissolving] = useState(false);
  const [profileMember, setProfileMember] = useState<ConversationMember | null>(
    null
  );
  const [selectedMuteIds, setSelectedMuteIds] = useState<string[]>([]);
  const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviting, setInviting] = useState(false);

  async function load() {
    try {
      const next = await api<GroupInfo>(`/api/groups/${conversationId}`);
      setInfo(next);
      setSelectedMuteIds(
        next.members.filter(member => member.muted).map(member => member.userId)
      );
      setLoadingMoreMembers(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "群资料加载失败");
    }
  }
  useEffect(() => {
    void load();
  }, [conversationId]);
  async function loadMoreMembers() {
    if (!info || loadingMoreMembers || info.members.length >= info.memberCount) return;
    setLoadingMoreMembers(true);
    try {
      const pageSize = info.membersPageSize ?? 100;
      const page = Math.floor(info.members.length / pageSize) + 1;
      const next = await api<{ items: ConversationMember[] }>(
        `/api/groups/${conversationId}/members/page?page=${page}&pageSize=${pageSize}`
      );
      setInfo(current =>
        current
          ? { ...current, members: [...current.members, ...next.items] }
          : current
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "群成员加载失败");
    } finally {
      setLoadingMoreMembers(false);
    }
  }
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
  async function updateMute(muted: boolean) {
    if (selectedMuteIds.length === 0) return;
    await api(`/api/groups/${conversationId}/members/mute`, {
      method: "PUT",
      body: JSON.stringify({ userIds: selectedMuteIds, muted }),
    });
    await load();
    onChanged();
  }
  async function updateSettings(key: string, value: boolean) {
    await api(`/api/groups/${conversationId}/settings`, { method: "PUT", body: JSON.stringify({ [key]: value }) });
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
  async function inviteSelectedFriends() {
    if (selectedInviteIds.length === 0 || inviting) return;
    setInviting(true);
    setError("");
    try {
      for (const userId of selectedInviteIds) {
        await api(`/api/groups/${conversationId}/members`, {
          method: "POST",
          body: JSON.stringify({ userId }),
        });
      }
      setSelectedInviteIds([]);
      setInviteQuery("");
      await load();
      onChanged();
      setPage("info");
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加群成员失败");
      await load();
    } finally {
      setInviting(false);
    }
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

  const currentMember = info?.members.find(member => member.userId === currentUserId);
  const canManage = currentMember?.role === "Owner" || currentMember?.role === "Admin";
  const canDissolve = canManage;
  const existingMemberIds = new Set(
    (info?.members ?? []).map(member => member.userId)
  );
  const inviteContacts = contacts
    .filter(contact => contact.status === "Friend" && !existingMemberIds.has(contact.user.id))
    .filter(contact => {
      const keyword = inviteQuery.trim().toLowerCase();
      if (!keyword) return true;
      return [contact.user.displayName, contact.user.account, contact.remark]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(keyword));
    })
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, "zh-CN"));
  async function dissolve() {
    if (dissolving || !canDissolve || !window.confirm("解散后所有成员将无法继续使用此群聊，确定解散吗？")) return;
    setError("");
    setDissolving(true);
    try {
      try {
        await api(`/api/groups/${conversationId}/dissolve`, { method: "POST" });
      } catch (cause) {
        const status = cause && typeof cause === "object" && "status" in cause
          ? Number((cause as { status?: unknown }).status)
          : 0;
        if (status !== 405) throw cause;
        await api(`/api/groups/${conversationId}/dissolve`, { method: "DELETE" });
      }
      onDissolved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解散群聊失败");
    } finally {
      setDissolving(false);
    }
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
    <div className="echat-drawer-shell fixed inset-0 z-50 flex h-dvh justify-end bg-slate-950/50 p-0 backdrop-blur-sm md:h-auto md:p-6">
      <div className="echat-drawer-enter h-full min-h-0 w-full max-w-xl overflow-y-auto bg-[#f3f6f7] shadow-2xl md:max-h-[calc(100dvh-3rem)] md:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white/95 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回聊天"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-teal-700"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">
              聊天信息（{info.members.length}）
            </h2>
            <p className="text-xs text-slate-400">{info.name}</p>
          </div>
        </header>
        <section className="grid grid-cols-2 gap-3 bg-white p-4">
          <button
            onClick={() => setPage("info")}
            className={`rounded-xl py-2 text-sm ${page === "info" ? "bg-teal-500 text-white" : "bg-slate-100"}`}
          >
            群资料
          </button>
          {canManage && (
            <button
              onClick={() => setPage("manage")}
              className={`rounded-xl py-2 text-sm ${page === "manage" ? "bg-teal-500 text-white" : "bg-slate-100"}`}
            >
              群管理
            </button>
          )}
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
                  onClick={() => {
                    setSelectedInviteIds([]);
                    setInviteQuery("");
                    setError("");
                    setPage("invite");
                  }}
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
            {canManage && (
              <>
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
              </>
            )}
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
        {page === "manage" && canManage && (
          <section className="space-y-3 p-3">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
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
              {currentMember?.role === "Owner" && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{([["allowMemberAddFriend", "允许群成员相互添加好友"], ["muteAll", "全员禁言"], ["disableRecall", "禁止撤回消息"], ["disableNameChange", "禁止修改群名称"], ["hideMemberCount", "隐藏群人数"], ["historyVisibleToNewMembers", "新成员可查看历史消息"]] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><input type="checkbox" checked={Boolean(info[key])} onChange={e => void updateSettings(key, e.target.checked)} /></label>)}</div>}
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
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void updateMute(true)}
                  disabled={selectedMuteIds.length === 0}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs text-white disabled:opacity-40"
                >
                  <VolumeX size={14} /> 禁言选中成员
                </button>
                <button
                  type="button"
                  onClick={() => void updateMute(false)}
                  disabled={selectedMuteIds.length === 0}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 disabled:opacity-40"
                >
                  解除禁言
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {info.members.map(member => (
                  <div key={member.userId} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={`选择${member.displayName}禁言`}
                      checked={selectedMuteIds.includes(member.userId)}
                      disabled={member.role === "Owner"}
                      onChange={event =>
                        setSelectedMuteIds(current =>
                          event.target.checked
                            ? [...current, member.userId]
                            : current.filter(id => id !== member.userId)
                        )
                      }
                    />
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
                      {member.muted && (
                        <p className="text-xs text-amber-600">已禁言</p>
                      )}
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
              {info.members.length < info.memberCount && (
                <button
                  type="button"
                  onClick={() => void loadMoreMembers()}
                  disabled={loadingMoreMembers}
                  className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-xs text-slate-600 disabled:opacity-50"
                >
                  {loadingMoreMembers
                    ? "正在加载成员…"
                    : `加载更多成员（${info.members.length}/${info.memberCount}）`}
                </button>
              )}
            </div>
            {canDissolve && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <h3 className="font-semibold text-rose-800">危险操作</h3>
                <p className="mt-1 text-xs text-rose-700">
                  群主或群管理员可以解散群组，解散后所有成员将无法继续发送消息。
                </p>
                <button
                  type="button"
                  onClick={() => void dissolve()}
                  disabled={dissolving}
                  className="mt-3 w-full rounded-xl bg-rose-600 py-2.5 text-sm font-medium text-white hover:bg-rose-700"
                >
                  {dissolving ? "正在解散…" : "解散群组"}
                </button>
              </div>
            )}
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
        {page === "invite" && (
          <section className="min-h-full bg-[#f3f6f7]">
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white/95 px-4 py-3 backdrop-blur">
              <button
                type="button"
                onClick={() => setPage("info")}
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"
                aria-label="返回群资料"
              >
                <ChevronLeft size={20} />
              </button>
              <h3 className="flex-1 text-center text-lg font-semibold">选择联系人</h3>
              <button
                type="button"
                disabled={selectedInviteIds.length === 0 || inviting}
                onClick={() => void inviteSelectedFriends()}
                className="rounded-xl bg-teal-500 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                {inviting ? "添加中…" : `完成${selectedInviteIds.length ? `（${selectedInviteIds.length}）` : ""}`}
              </button>
            </div>
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={inviteQuery}
                  onChange={event => setInviteQuery(event.target.value)}
                  placeholder="搜索好友"
                  className="w-full rounded-xl bg-white px-10 py-3 text-sm outline-none ring-teal-300 focus:ring-2"
                />
              </div>
              {error && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}
            </div>
            <div className="border-y border-slate-100 bg-white px-4 py-3 text-sm font-medium text-slate-700">
              我的好友（{inviteContacts.length}）
            </div>
            <div className="bg-white">
              {inviteContacts.length ? inviteContacts.map(contact => {
                const checked = selectedInviteIds.includes(contact.user.id);
                return (
                  <button
                    key={contact.user.id}
                    type="button"
                    onClick={() => setSelectedInviteIds(current => checked
                      ? current.filter(id => id !== contact.user.id)
                      : [...current, contact.user.id])}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${checked ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 text-transparent"}`}>
                      <Check size={15} />
                    </span>
                    <img
                      src={resolveBuiltinAvatar(contact.user.avatarUrl)}
                      alt={contact.user.displayName}
                      className="h-11 w-11 rounded-xl object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{contact.user.displayName}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-400">{contact.remark || contact.user.account}</span>
                    </span>
                  </button>
                );
              }) : (
                <p className="px-4 py-12 text-center text-sm text-slate-400">
                  {inviteQuery ? "没有找到匹配的好友" : "暂无可添加的好友"}
                </p>
              )}
            </div>
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
                    {new Date(item.sentAtUtc).toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    }).replaceAll("/", "-")}
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
