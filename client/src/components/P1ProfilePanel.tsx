import { useEffect, useState } from "react";
import {
  Bell,
  Clock3,
  FileText,
  LogOut,
  MonitorSmartphone,
  Phone,
  QrCode,
  ScanLine,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type CallRecord,
  type DeviceSession,
  type RtcConfig,
  type User,
} from "@/lib/echat-api";
import {
  getNativeCallListenerState,
  getNativePushState,
  isNativeAndroid,
  registerNativePush,
  unregisterNativePush,
  type NativePushState,
} from "@/lib/mobile-native";
import { pushStatusLabel } from "@/lib/push-status";

export default function P1ProfilePanel({
  user,
  onLogout,
  onScan,
  onMyQr,
}: {
  user: User;
  onLogout: () => void;
  onScan: () => void;
  onMyQr: () => void;
}) {
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [rtc, setRtc] = useState<RtcConfig | null>(null);
  const [pushState, setPushState] = useState<NativePushState>(() =>
    getNativePushState()
  );
  const [callListenerRunning, setCallListenerRunning] = useState(() =>
    getNativeCallListenerState()
  );
  const [section, setSection] = useState<"home" | "devices" | "calls">("home");

  async function load() {
    const [nextDevices, nextCalls, nextRtc] = await Promise.all([
      api<DeviceSession[]>("/api/devices"),
      api<CallRecord[]>("/api/calls"),
      api<RtcConfig>("/api/rtc/config"),
    ]);
    setDevices(nextDevices);
    setCalls(nextCalls);
    setRtc(nextRtc);
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

  async function enablePush() {
    if (!isNativeAndroid())
      return toast.info("请在 E聊 Android APP 中使用系统消息推送");
    try {
      const state = await registerNativePush();
      if (state === "denied")
        toast.warning("通知权限已关闭，请在 Android 系统设置中允许通知");
      else if (state === "unavailable")
        toast.warning("Android 客户端尚未配置 Firebase，请联系管理员");
      else toast.success("Android 后台通知与来电服务已开启");
    } catch {
      toast.error("暂时无法启用 Android 消息推送");
    }
  }

  const pushLabel = pushStatusLabel(isNativeAndroid(), pushState);

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

  return (
    <div className="space-y-4 px-1">
      <div className="rounded-3xl bg-[#0a1b2b] p-5 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 font-semibold">
            {Array.from(user.displayName).slice(-2).join("")}
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
          isNativeAndroid()
            ? callListenerRunning
              ? "常驻服务运行中"
              : "点击重新连接"
            : "仅 Android APP"
        }
        onClick={enablePush}
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
