import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Flag,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AuthenticatedMedia from "./AuthenticatedMedia";
import {
  api,
  uploadMedia,
  type Contact,
  type Moment,
  type MomentVisibility,
  type User,
} from "@/lib/echat-api";
import { resolveBuiltinAvatar } from "@/lib/builtin-avatars";

function timeAgo(value: string) {
  const seconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  );
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`;
  return new Date(value).toLocaleDateString("zh-CN");
}

function MiniAvatar({
  user,
}: {
  user: Pick<User, "displayName" | "avatarUrl">;
}) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[15px] bg-gradient-to-br from-teal-400 to-emerald-600 text-sm font-semibold text-white">
      <img
        src={resolveBuiltinAvatar(user.avatarUrl)}
        alt=""
        className="h-full w-full object-cover"
      />
    </div>
  );
}
function LocalPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!url) return null;
  return file.type.startsWith("video/") ? (
    <video src={url} muted playsInline className="h-full w-full object-cover" />
  ) : (
    <img src={url} alt="" className="h-full w-full object-cover" />
  );
}
const visibilityLabel: Record<MomentVisibility, string> = {
  Friends: "好友可见",
  Private: "仅自己可见",
  Selected: "部分好友可见",
  Excluded: "不给谁看",
};

export default function MomentsPanel({ user }: { user: User }) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [visibility, setVisibility] = useState<MomentVisibility>("Friends");
  const [audience, setAudience] = useState<string[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [reporting, setReporting] = useState<Moment | null>(null);
  const [reportReason, setReportReason] = useState("垃圾广告");
  const [reportDetail, setReportDetail] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [nextMoments, nextContacts] = await Promise.all([
        api<Moment[]>("/api/moments?limit=30"),
        api<Contact[]>("/api/contacts"),
      ]);
      setMoments(nextMoments);
      setContacts(nextContacts.filter(x => x.status === "Friend"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "朋友圈加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("echat-moment-updated", refresh);
    return () => window.removeEventListener("echat-moment-updated", refresh);
  }, [load]);

  function addFiles(next: FileList | null) {
    if (next)
      setFiles(current =>
        [
          ...current,
          ...Array.from(next).filter(
            file =>
              file.type.startsWith("image/") || file.type.startsWith("video/")
          ),
        ].slice(0, 9)
      );
  }
  async function publish() {
    if (!text.trim() && files.length === 0) return;
    if (
      (visibility === "Selected" || visibility === "Excluded") &&
      audience.length === 0
    )
      return toast.warning("请选择至少一位好友");
    setPublishing(true);
    try {
      const assets = [];
      for (const file of files)
        assets.push(await uploadMedia(file, file.name, "Moment"));
      await api<Moment>("/api/moments", {
        method: "POST",
        body: JSON.stringify({
          text: text.trim(),
          mediaAssetIds: assets.map(asset => asset.id),
          visibility,
          audienceUserIds: audience,
        }),
      });
      setText("");
      setFiles([]);
      setVisibility("Friends");
      setAudience([]);
      setComposer(false);
      await load();
      toast.success("动态已发布");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  }
  async function toggleLike(moment: Moment) {
    setMoments(current =>
      current.map(item =>
        item.id === moment.id ? { ...item, likedByMe: !item.likedByMe } : item
      )
    );
    try {
      await api<void>(`/api/moments/${moment.id}/like`, {
        method: moment.likedByMe ? "DELETE" : "POST",
      });
      await load();
    } catch (cause) {
      await load();
      toast.error(cause instanceof Error ? cause.message : "点赞失败");
    }
  }
  async function comment(momentId: string) {
    const value = commentDrafts[momentId]?.trim();
    if (!value) return;
    try {
      await api(`/api/moments/${momentId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: value }),
      });
      setCommentDrafts(current => ({ ...current, [momentId]: "" }));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "评论失败");
    }
  }
  async function remove(momentId: string) {
    try {
      await api<void>(`/api/moments/${momentId}`, { method: "DELETE" });
      setMoments(current => current.filter(item => item.id !== momentId));
      toast.success("动态已删除");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "删除失败");
    }
  }
  async function report() {
    if (!reporting) return;
    try {
      await api(`/api/moments/${reporting.id}/reports`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason, detail: reportDetail }),
      });
      toast.success("举报已提交，可在后续治理中心查看状态");
      setReporting(null);
      setReportDetail("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "举报失败");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f3f6f7]">
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8">
        <div>
          <p className="text-xs font-medium tracking-[.16em] text-teal-600">
            SOCIAL · PRIVACY FIRST
          </p>
          <h1 className="mt-1 text-xl font-semibold">朋友圈</h1>
        </div>
        <button
          onClick={() => setComposer(true)}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition active:scale-[.97]"
        >
          <Camera size={17} />
          发布动态
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 overflow-hidden rounded-[26px] bg-[#0a1b2b] p-6 text-white shadow-lg">
            <p className="text-xs uppercase tracking-[.2em] text-teal-300">
              E聊 Moments
            </p>
            <div className="mt-6 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  记录此刻，由你决定谁可见
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  动态、点赞与评论会实时同步。
                </p>
              </div>
              <MiniAvatar user={user} />
            </div>
          </div>
          {loading ? (
            <div className="grid place-items-center py-24">
              <Loader2 className="animate-spin text-teal-500" />
            </div>
          ) : moments.length === 0 ? (
            <div className="rounded-3xl bg-white py-20 text-center shadow-sm">
              <ImagePlus className="mx-auto text-slate-300" />
              <p className="mt-4 text-sm font-semibold text-slate-600">
                还没有动态
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {moments.map(moment => (
                <article
                  key={moment.id}
                  className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200/60"
                >
                  <div className="flex items-start gap-3">
                    <MiniAvatar user={moment.author} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {moment.author.displayName}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {timeAgo(moment.createdAtUtc)} ·{" "}
                            {visibilityLabel[moment.visibility || "Friends"]}
                          </p>
                        </div>
                        {moment.author.id === user.id ? (
                          <button
                            onClick={() => remove(moment.id)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                            title="删除动态"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setReporting(moment)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-amber-50 hover:text-amber-600"
                            title="举报动态"
                          >
                            <Flag size={15} />
                          </button>
                        )}
                      </div>
                      {moment.text && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {moment.text}
                        </p>
                      )}
                      {moment.media.length > 0 && (
                        <div
                          className={`mt-3 grid gap-1.5 overflow-hidden rounded-2xl ${moment.media.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}
                        >
                          {moment.media.map(asset => (
                            <div
                              key={asset.id}
                              className={`${moment.media.length === 1 ? "aspect-video max-w-md" : "aspect-square"} overflow-hidden rounded-xl`}
                            >
                              <AuthenticatedMedia
                                src={asset.contentUrl}
                                type={
                                  asset.contentType.startsWith("video/")
                                    ? "video"
                                    : "image"
                                }
                                alt={asset.fileName}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3">
                        <button
                          onClick={() => toggleLike(moment)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${moment.likedByMe ? "bg-rose-50 text-rose-500" : "text-slate-500 hover:bg-slate-100"}`}
                        >
                          <Heart
                            size={16}
                            fill={moment.likedByMe ? "currentColor" : "none"}
                          />
                          {moment.likes.length || "点赞"}
                        </button>
                        <button
                          onClick={() =>
                            document
                              .getElementById(`comment-${moment.id}`)
                              ?.focus()
                          }
                          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          <MessageCircle size={16} />
                          {moment.comments.length || "评论"}
                        </button>
                      </div>
                      {moment.likes.length > 0 && (
                        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {moment.likes
                            .map(like => like.displayName)
                            .join("、")}
                        </div>
                      )}
                      {moment.comments.length > 0 && (
                        <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2">
                          {moment.comments.map(item => (
                            <p key={item.id} className="text-xs leading-5">
                              <span className="font-semibold text-teal-700">
                                {item.displayName}：
                              </span>
                              {item.text}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <input
                          id={`comment-${moment.id}`}
                          value={commentDrafts[moment.id] || ""}
                          onChange={event =>
                            setCommentDrafts(current => ({
                              ...current,
                              [moment.id]: event.target.value,
                            }))
                          }
                          onKeyDown={event =>
                            event.key === "Enter" && comment(moment.id)
                          }
                          placeholder="写下评论…"
                          className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs outline-none ring-teal-300/50 focus:ring-2"
                        />
                        <button
                          onClick={() => comment(moment.id)}
                          disabled={!commentDrafts[moment.id]?.trim()}
                          className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500 text-white disabled:bg-slate-300"
                        >
                          <SendHorizontal size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      {composer && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">发布朋友圈</h2>
              <button
                onClick={() => setComposer(false)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              value={text}
              onChange={event => setText(event.target.value.slice(0, 2000))}
              rows={4}
              placeholder="分享这一刻的想法…"
              className="mt-5 w-full resize-none rounded-2xl bg-slate-100 p-4 text-sm outline-none ring-teal-300/50 focus:ring-2"
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="relative aspect-square overflow-hidden rounded-xl bg-slate-100"
                >
                  <LocalPreview file={file} />
                  <button
                    onClick={() =>
                      setFiles(current => current.filter((_, i) => i !== index))
                    }
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {files.length < 9 && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="grid aspect-square place-items-center rounded-xl border border-dashed border-slate-300 text-slate-400"
                >
                  <ImagePlus />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={event => addFiles(event.target.files)}
            />
            <label className="mt-4 block text-xs font-medium text-slate-600">
              谁可以看
              <select
                value={visibility}
                onChange={event => {
                  setVisibility(event.target.value as MomentVisibility);
                  setAudience([]);
                }}
                className="mt-2 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm outline-none"
              >
                <option value="Friends">好友可见</option>
                <option value="Private">仅自己可见</option>
                <option value="Selected">部分好友可见</option>
                <option value="Excluded">不给谁看</option>
              </select>
            </label>
            {(visibility === "Selected" || visibility === "Excluded") && (
              <div className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2">
                {contacts.map(contact => (
                  <label
                    key={contact.user.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-xs hover:bg-white"
                  >
                    <input
                      type="checkbox"
                      checked={audience.includes(contact.user.id)}
                      onChange={() =>
                        setAudience(current =>
                          current.includes(contact.user.id)
                            ? current.filter(x => x !== contact.user.id)
                            : [...current, contact.user.id]
                        )
                      }
                      className="accent-teal-500"
                    />
                    {contact.user.displayName}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {text.length}/2000 · {files.length}/9
              </span>
              <button
                onClick={publish}
                disabled={publishing || (!text.trim() && files.length === 0)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {publishing ? "发布中…" : "发布"}
              </button>
            </div>
          </div>
        </div>
      )}
      {reporting && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-[26px] bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">举报动态</h2>
              <button
                onClick={() => setReporting(null)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <select
              value={reportReason}
              onChange={event => setReportReason(event.target.value)}
              className="mt-5 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm"
            >
              <option>垃圾广告</option>
              <option>欺诈信息</option>
              <option>骚扰攻击</option>
              <option>违法违规</option>
              <option>侵犯隐私</option>
            </select>
            <textarea
              value={reportDetail}
              onChange={event =>
                setReportDetail(event.target.value.slice(0, 500))
              }
              rows={4}
              placeholder="补充说明（选填）"
              className="mt-3 w-full resize-none rounded-xl bg-slate-100 p-3 text-sm outline-none"
            />
            <button
              onClick={report}
              className="mt-4 w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white"
            >
              提交举报
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
