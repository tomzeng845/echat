import { useEffect, useState } from "react";
import {
  Ban,
  Bell,
  Camera,
  Clock3,
  FileText,
  LogOut,
  MonitorSmartphone,
  Phone,
  Pencil,
  QrCode,
  ScanLine,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  uploadMedia,
  type CallRecord,
  type DeviceSession,
  type RtcConfig,
  type User,
} from "@/lib/echat-api";
import {
  getNativeBackgroundCallSupport,
  getNativeCallListenerState,
  getNativePushState,
  isNativeAndroid,
  isNativeIos,
  isNativeMobile,
  openNativeBackgroundCallSettings,
  registerNativePush,
  requestNativeBackgroundCallExemption,
  type NativeBackgroundCallSupport,
  unregisterNativePush,
  type NativePushState,
} from "@/lib/mobile-native";
import { pushStatusLabel } from "@/lib/push-status";
import { useAuthenticatedImage } from "@/hooks/useAuthenticatedImage";
import { exportDiagnosticLog, info as logInfo } from "@/lib/runtime-diagnostics";

export default function P1ProfilePanel({
  user,
  onLogout,
  onScan,
  onMyQr,
  onProfileUpdated,
}: {
  user: User;
  onLogout: () => void;
  onScan: () => void;
  onMyQr: () => void;
  onProfileUpdated: (user: User) => void;
}) {
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [blocked, setBlocked] = useState<User[]>([]);
  const [rtc, setRtc] = useState<RtcConfig | null>(null);
  const [pushState, setPushState] = useState<NativePushState>(() =>
    getNativePushState()
  );
  const [callListenerRunning, setCallListenerRunning] = useState(() =>
    getNativeCallListenerState()
  );
  const [backgroundSupport, setBackgroundSupport] =
    useState<NativeBackgroundCallSupport | null>(null);
  const [section, setSection] = useState<
    "home" | "devices" | "calls" | "edit-profile" | "blocked"
  >("home");
  const [displayName, setDisplayName] = useState(user.displayName);
  const [signature, setSignature] = useState(user.signature || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl);
  const [profileBusy, setProfileBusy] = useState(false);
  const avatarImageUrl = useAuthenticatedImage(avatarPreview);

  async function load() {
    const [nextDevices, nextCalls, nextRtc, nextBlocked] = await Promise.all([
      api<DeviceSession[]>("/api/devices"),
      api<CallRecord[]>("/api/calls"),
      api<RtcConfig>("/api/rtc/config"),
      api<Array<{ user: User }>>("/api/contacts/blocked"),
    ]);
    setDevices(nextDevices);
    setCalls(nextCalls);
    setRtc(nextRtc);
    setBlocked(nextBlocked.map(item => item.user));
  }
  useEffect(() => {
    load().catch(() => undefined);
  }, []);
  useEffect(() => {
    const update = (event: Event) =>
      setPushState((event as CustomEvent<NativePushState>).detail);
    window.addEventListener("echat-push-status", update);
    return () => window.removeEventListener("echat-push-status", update);
  }, []);
  useEffect(() => {
    const update = (event: Event) =>
      setCallListenerRunning((event as CustomEvent<boolean>).detail);
    window.addEventListener("echat-call-listener-status", update);
    return () =>
      window.removeEventListener("echat-call-listener-status", update);
  }, []);
  useEffect(() => {
    const refresh = () =>
      getNativeBackgroundCallSupport().then(setBackgroundSupport);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(user.avatarUrl);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile, user.avatarUrl]);

  async function revoke(id: string) {
    try {
      await api<void>(`/api/devices/${id}`, { method: "DELETE" });
      await load();
      toast.success("设备已退出");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
    }
  }
  async function revokeOthers() {
    try {
      await api<void>("/api/devices/revoke-others", { method: "POST" });
      await load();
      toast.success("其他设备已全部退出");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
    }
  }
  async function logout() {
    try {
      await unregisterNativePush();
      await api<void>("/api/auth/logout", { method: "POST" });
    } finally {
      onLogout();
    }
  }

  async function unblock(peerId: string) {
    try {
      await api<void>(`/api/contacts/${peerId}/block`, { method: "DELETE" });
      setBlocked(current => current.filter(item => item.id !== peerId));
      toast.success("已解除拉黑");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "解除拉黑失败");
    }
  }

  async function saveProfile() {
    if (!displayName.trim()) return toast.warning("请输入昵称");
    setProfileBusy(true);
    try {
      let avatarAssetId: string | undefined;
      if (avatarFile) {
        if (
          !avatarFile.type.startsWith("image/") ||
          avatarFile.size > 5 * 1024 * 1024
        )
          throw new Error("头像必须是 5 MB 以内的图片");
        avatarAssetId = (
          await uploadMedia(avatarFile, avatarFile.name, "Avatar")
        ).id;
      }
      const updated = await api<User>("/api/users/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName: displayName.trim(),
          signature: signature.trim(),
          avatarAssetId,
        }),
      });
      onProfileUpdated(updated);
      setAvatarFile(null);
      setAvatarPreview(updated.avatarUrl);
      setSection("home");
      toast.success("个人资料已更新");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "资料更新失败");
    } finally {
      setProfileBusy(false);
    }
  }

  async function enablePush() {
    if (!isNativeMobile())
      return toast.info("请在 E聊 Android 或 iOS APP 中使用系统消息推送");
    try {
      const state = await registerNativePush();
      if (state === "denied")
        toast.warning("通知权限已关闭，请在系统设置中允许 E聊通知");
      else if (state === "unavailable")
        toast.warning(
          isNativeIos()
            ? "APNs 尚未配置，请联系管理员"
            : "Android 客户端尚未配置 Firebase，请联系管理员"
        );
      else toast.success("系统消息推送与后台来电已开启");
    } catch {
      toast.error("暂时无法启用系统消息推送");
    }
  }

  async function configureBackgroundCalls() {
    if (!isNativeMobile())
      return toast.info(
        "请在 E聊 Android、鸿蒙兼容版或 iOS APP 中使用后台来电"
      );
    try {
      await registerNativePush();
      const support = await getNativeBackgroundCallSupport();
      setBackgroundSupport(support);
      if (isNativeIos()) {
        toast.success("iOS PushKit 与 CallKit 后台来电已开启");
        return;
      }
      if (!support?.batteryOptimizationIgnored) {
        await requestNativeBackgroundCallExemption(true);
        toast.info("请允许 E聊忽略电池优化，以持续接收后台来电");
        return;
      }
      if (support.harmonyCompatible) {
        await openNativeBackgroundCallSettings();
        toast.info("请将 E聊设为手动管理，并允许自启动和后台运行");
        return;
      }
      toast.success("后台来电常驻服务已运行");
    } catch {
      toast.error("暂时无法配置后台来电");
    }
  }

  async function exportRuntimeLogs() {
    try {
      logInfo("settings", "User requested runtime log export");
      await exportDiagnosticLog();
      toast.success("运行日志已导出，请将文件发送给技术支持");
    } catch (cause) {
      logInfo("settings", "Runtime log export failed", cause);
      toast.error("运行日志导出失败，请稍后重试");
    }
  }

  const pushLabel = pushStatusLabel(
    isNativeMobile(),
    pushState,
    isNativeIos() ? "ios" : "android"
  );

  if (section === "edit-profile")
    return (
      <div className="space-y-4 px-1">
        <PanelHeader
          title="修改个人资料"
          onBack={() => {
            setDisplayName(user.displayName);
            setSignature(user.signature || "");
            setAvatarFile(null);
            setSection("home");
          }}
        />
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
          <label className="group mx-auto block w-fit cursor-pointer text-center">
            <span className="relative block h-24 w-24 overflow-hidden rounded-[28px] bg-gradient-to-br from-teal-400 to-emerald-600 text-white shadow-lg">
              {avatarImageUrl ? (
                <img
                  src={avatarImageUrl}
                  alt="头像预览"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-xl font-semibold">
                  {Array.from(displayName || user.displayName)
                    .slice(-2)
                    .join("")}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-slate-950/55 py-1.5 text-[10px]">
                <Camera size={12} /> 更换头像
              </span>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              hidden
              onChange={event => setAvatarFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="mt-6 block text-xs font-medium text-slate-500">
            昵称
            <input
              value={displayName}
              maxLength={30}
              onChange={event => setDisplayName(event.target.value)}
              className="mt-2 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm text-slate-800 outline-none ring-teal-400/40 focus:ring-2"
            />
          </label>
          <label className="mt-4 block text-xs font-medium text-slate-500">
            个性签名
            <textarea
              value={signature}
              maxLength={120}
              rows={3}
              onChange={event => setSignature(event.target.value)}
              placeholder="写一句话介绍自己"
              className="mt-2 w-full resize-none rounded-xl bg-slate-100 px-3 py-3 text-sm text-slate-800 outline-none ring-teal-400/40 focus:ring-2"
            />
            <span className="mt-1 block text-right text-[10px] text-slate-400">
              {signature.length}/120
            </span>
          </label>
          <button
            type="button"
            disabled={profileBusy || !displayName.trim()}
            onClick={saveProfile}
            className="mt-5 w-full rounded-xl bg-teal-500 py-3 text-sm font-semibold text-white transition active:scale-[.98] disabled:opacity-50"
          >
            {profileBusy ? "正在保存…" : "保存修改"}
          </button>
        </div>
      </div>
    );

  if (section === "devices")
    return (
      <div className="space-y-3 px-1">
        <PanelHeader title="登录设备" onBack={() => setSection("home")} />
        <button
          onClick={revokeOthers}
          className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white"
        >
          退出所有其他设备
        </button>
        {devices.map(device => (
          <div
            key={device.id}
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"
          >
            <div className="flex items-center gap-3">
              <MonitorSmartphone className="text-teal-600" size={19} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {device.deviceName}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {device.current
                    ? "当前设备"
                    : `最近活跃 ${new Date(device.lastSeenAtUtc).toLocaleString("zh-CN")}`}
                </p>
              </div>
              {!device.current && (
                <button
                  onClick={() => revoke(device.id)}
                  title="退出设备"
                  className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-500"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  if (section === "calls")
    return (
      <div className="space-y-3 px-1">
        <PanelHeader title="通话记录" onBack={() => setSection("home")} />
        {calls.length ? (
          calls.map(call => (
            <div
              key={call.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"
            >
              <div
                className={`grid h-10 w-10 place-items-center rounded-xl ${call.mode === "video" ? "bg-indigo-50 text-indigo-600" : "bg-teal-50 text-teal-600"}`}
              >
                {call.mode === "video" ? (
                  <Video size={18} />
                ) : (
                  <Phone size={18} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {call.conversationName}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {call.status} ·{" "}
                  {new Date(call.startedAtUtc).toLocaleString("zh-CN")}
                </p>
              </div>
              <Clock3 size={15} className="text-slate-300" />
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-white py-10 text-center text-xs text-slate-400">
            暂无通话记录
          </p>
        )}
      </div>
    );

  if (section === "blocked")
    return (
      <div className="space-y-3 px-1">
        <PanelHeader title="黑名单管理" onBack={() => setSection("home")} />
        {blocked.length ? (
          blocked.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"
            >
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-slate-100 text-sm font-semibold text-slate-500">
                {item.avatarUrl ? (
                  <img
                    src={item.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  item.displayName.slice(-2)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {item.displayName}
                </p>
                <p className="mt-1 truncate text-xs text-slate-400">
                  @{item.account}
                </p>
              </div>
              <button
                onClick={() => unblock(item.id)}
                className="rounded-xl bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700"
              >
                解除拉黑
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-white py-10 text-center text-xs text-slate-400">
            黑名单为空
          </p>
        )}
      </div>
    );

  return (
    <div className="space-y-4 px-1">
      <div className="rounded-3xl bg-[#0a1b2b] p-5 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 font-semibold">
            {avatarImageUrl ? (
              <img
                src={avatarImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              Array.from(user.displayName).slice(-2).join("")
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.displayName}</p>
            <p className="mt-1 text-xs text-slate-400">E聊号：{user.account}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[.06] px-3 py-2 text-xs text-teal-200">
          <ShieldCheck size={14} />
          P1 安全能力已启用
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Action icon={QrCode} title="我的二维码" onClick={onMyQr} />
        <Action icon={ScanLine} title="扫一扫" onClick={onScan} />
      </div>
      <Action
        icon={Pencil}
        title="修改个人资料"
        value="头像、昵称、签名"
        onClick={() => setSection("edit-profile")}
      />
      <Action
        icon={Ban}
        title="黑名单管理"
        value={`${blocked.length} 人`}
        onClick={() => setSection("blocked")}
      />
      <Action
        icon={MonitorSmartphone}
        title="登录设备"
        value={`${devices.length || "—"} 台`}
        onClick={() => setSection("devices")}
      />
      <Action
        icon={Phone}
        title="通话记录"
        value={`${calls.length} 条`}
        onClick={() => setSection("calls")}
      />
      <Action
        icon={Bell}
        title="消息推送"
        value={pushLabel}
        onClick={enablePush}
      />
      <Action
        icon={Phone}
        title="后台来电"
        value={
          isNativeIos()
            ? callListenerRunning
              ? "PushKit / CallKit 已开启"
              : "点击重新连接"
            : isNativeAndroid()
              ? !backgroundSupport?.batteryOptimizationIgnored
                ? "待允许后台运行"
                : callListenerRunning
                  ? "常驻服务运行中"
                  : "点击重新连接"
              : "仅移动 APP"
        }
        onClick={configureBackgroundCalls}
      />
      <Action
        icon={Phone}
        title="实时能力"
        value={rtc?.turnConfigured ? "TURN 已配置" : "P2P 模式"}
        onClick={() =>
          toast.info(
            rtc?.turnConfigured
              ? "已启用 TURN 临时凭据"
              : "当前使用 P2P；配置 TURN/SFU 后自动升级"
          )
        }
      />
      <Action
        icon={FileText}
        title="导出运行日志"
        value="排查无声音、断连问题"
        onClick={exportRuntimeLogs}
      />
      <Action
        icon={FileText}
        title="服务协议"
        value="2026-09"
        onClick={() => toast.info("服务协议版本 2026-09")}
      />
      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-medium text-rose-600"
      >
        <LogOut size={16} />
        退出当前账号
      </button>
    </div>
  );
}

function Action({
  icon: Icon,
  title,
  value,
  onClick,
}: {
  icon: typeof Bell;
  title: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/50"
    >
      <Icon size={18} className="text-slate-400" />
      <span className="flex-1 text-sm font-medium">{title}</span>
      {value && <span className="text-xs text-slate-400">{value}</span>}
    </button>
  );
}
function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2">
      <button onClick={onBack} className="text-xs text-teal-600">
        返回
      </button>
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="w-7" />
    </div>
  );
}
