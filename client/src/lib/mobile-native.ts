import { App } from "@capacitor/app";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type Token,
} from "@capacitor/push-notifications";
import { api, getDeviceId } from "./echat-api";
import { canInitializeNativePush } from "./push-status";

const PENDING_NOTIFICATION_KEY = "echat.pending-notification.v1";

export type NativePushState =
  | "web"
  | "prompt"
  | "registering"
  | "registered"
  | "denied"
  | "unavailable";
export type NativeNotificationTarget = {
  type?: string;
  conversationId?: string;
  requestId?: string;
  callId?: string;
};

type MediaPermissionsPlugin = {
  getCapabilities(): Promise<{ firebaseConfigured: boolean }>;
  setCallAudioRoute(options: {
    speaker: boolean;
  }): Promise<{ speaker: boolean; applied: boolean }>;
  endCallAudioSession(): Promise<void>;
  requestPermissions(options: {
    camera: boolean;
    microphone: boolean;
  }): Promise<{ camera: boolean; microphone: boolean }>;
};

const MediaPermissions =
  registerPlugin<MediaPermissionsPlugin>("MediaPermissions");
let pushState: NativePushState = Capacitor.isNativePlatform()
  ? "prompt"
  : "web";
let listeners: PluginListenerHandle[] = [];
let appListener: PluginListenerHandle | null = null;
let pushStarted = false;

export function isNativeAndroid() {
  return Capacitor.getPlatform() === "android";
}

export function getNativePushState() {
  return pushState;
}

function updatePushState(next: NativePushState) {
  pushState = next;
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("echat-push-status", { detail: next })
    );
}

function openNotificationTarget(
  action: ActionPerformed | { notification: { data?: Record<string, unknown> } }
) {
  const raw = action.notification.data || {};
  const target: NativeNotificationTarget = {
    type: typeof raw.type === "string" ? raw.type : undefined,
    conversationId:
      typeof raw.conversationId === "string" ? raw.conversationId : undefined,
    requestId: typeof raw.requestId === "string" ? raw.requestId : undefined,
    callId: typeof raw.callId === "string" ? raw.callId : undefined,
  };
  localStorage.setItem(PENDING_NOTIFICATION_KEY, JSON.stringify(target));
  window.dispatchEvent(
    new CustomEvent("echat-open-notification", { detail: target })
  );
}

export function consumePendingNotification(): NativeNotificationTarget | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(PENDING_NOTIFICATION_KEY) || "null"
    ) as NativeNotificationTarget | null;
    localStorage.removeItem(PENDING_NOTIFICATION_KEY);
    return value;
  } catch {
    localStorage.removeItem(PENDING_NOTIFICATION_KEY);
    return null;
  }
}

async function savePushToken(token: Token) {
  await api("/api/push/devices", {
    method: "POST",
    body: JSON.stringify({
      deviceId: getDeviceId(),
      token: token.value,
      platform: "android",
      appVersion: "0.8.2",
    }),
  });
  updatePushState("registered");
}

export async function registerNativePush() {
  if (!isNativeAndroid()) return "web" as const;
  const serverStatus = await api<{ enabled: boolean }>(
    "/api/push/status"
  ).catch(() => ({ enabled: false }));
  if (!serverStatus.enabled) {
    updatePushState("unavailable");
    return "unavailable" as const;
  }
  const nativeCapabilities = await MediaPermissions.getCapabilities().catch(
    () => ({ firebaseConfigured: false })
  );
  if (
    !canInitializeNativePush(
      serverStatus.enabled,
      nativeCapabilities.firebaseConfigured
    )
  ) {
    updatePushState("unavailable");
    return "unavailable" as const;
  }
  if (!pushStarted) {
    pushStarted = true;
    listeners = await Promise.all([
      PushNotifications.addListener("registration", token =>
        savePushToken(token).catch(() => updatePushState("unavailable"))
      ),
      PushNotifications.addListener("registrationError", () =>
        updatePushState("unavailable")
      ),
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        openNotificationTarget
      ),
    ]);
    appListener = await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && pushState === "registered")
        PushNotifications.register().catch(() =>
          updatePushState("unavailable")
        );
    });
  }

  updatePushState("registering");
  let permission = await PushNotifications.checkPermissions();
  if (
    permission.receive === "prompt" ||
    permission.receive === "prompt-with-rationale"
  )
    permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    updatePushState("denied");
    return "denied" as const;
  }
  try {
    await Promise.all([
      PushNotifications.createChannel({
        id: "messages",
        name: "聊天消息",
        description: "新消息与好友申请",
        importance: 4,
        visibility: 1,
        vibration: true,
      }),
      PushNotifications.createChannel({
        id: "calls",
        name: "音视频通话",
        description: "E聊语音与视频来电",
        importance: 5,
        visibility: 1,
        vibration: true,
      }),
    ]);
    await PushNotifications.register();
  } catch {
    updatePushState("unavailable");
    return "unavailable" as const;
  }
  return "registering" as const;
}

export async function unregisterNativePush() {
  if (!isNativeAndroid()) return;
  await api(`/api/push/devices/${encodeURIComponent(getDeviceId())}`, {
    method: "DELETE",
  }).catch(() => undefined);
  await PushNotifications.unregister().catch(() => undefined);
  for (const listener of listeners) await listener.remove();
  listeners = [];
  await appListener?.remove();
  appListener = null;
  pushStarted = false;
  updatePushState("prompt");
}

export async function ensureNativeMediaPermissions(options: {
  camera?: boolean;
  microphone?: boolean;
}) {
  if (!isNativeAndroid()) return;
  const result = await MediaPermissions.requestPermissions({
    camera: Boolean(options.camera),
    microphone: Boolean(options.microphone),
  });
  if (options.camera && !result.camera)
    throw new DOMException("Camera permission denied", "NotAllowedError");
  if (options.microphone && !result.microphone)
    throw new DOMException("Microphone permission denied", "NotAllowedError");
}

export async function setNativeCallAudioRoute(speaker: boolean) {
  if (!isNativeAndroid()) return speaker;
  const result = await MediaPermissions.setCallAudioRoute({ speaker });
  if (!result.applied) throw new Error("当前设备无法切换音频输出");
  return result.speaker;
}

export async function endNativeCallAudioSession() {
  if (!isNativeAndroid()) return;
  await MediaPermissions.endCallAudioSession();
}
