import { App } from "@capacitor/app";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from "@capacitor/push-notifications";
import {
  LocalNotifications,
  type ActionPerformed as LocalNotificationAction,
} from "@capacitor/local-notifications";
import { api, getDeviceId } from "./echat-api";
import { canInitializeNativePush } from "./push-status";

const PENDING_NOTIFICATION_KEY = "echat.pending-notification.v1";

export type NativePushState =
  | "web"
  | "prompt"
  | "registering"
  | "registered"
  | "local"
  | "denied"
  | "unavailable";
export type NativeNotificationTarget = {
  type?: string;
  conversationId?: string;
  requestId?: string;
  callId?: string;
};
export type AlertSoundKind = "message" | "voice-call" | "video-call";

type MediaPermissionsPlugin = {
  getCapabilities(): Promise<{ firebaseConfigured: boolean }>;
  playAlertSound(options: {
    kind: AlertSoundKind;
  }): Promise<{ playing: boolean }>;
  stopAlertSound(options: { kind: "message" | "call" | "all" }): Promise<void>;
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
let localListeners: PluginListenerHandle[] = [];
let appListener: PluginListenerHandle | null = null;
let pushStarted = false;
let localNotificationsStarted = false;
let nativeAppActive = true;
const recentAlerts = new Map<string, number>();

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

function dispatchNotificationTarget(raw: Record<string, unknown>) {
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

function openNotificationTarget(
  action: ActionPerformed | { notification: { data?: Record<string, unknown> } }
) {
  dispatchNotificationTarget(action.notification.data || {});
}

function openLocalNotificationTarget(action: LocalNotificationAction) {
  dispatchNotificationTarget(action.notification.extra || {});
}

function notificationId(eventId: string) {
  let value = 2166136261;
  for (let index = 0; index < eventId.length; index += 1) {
    value ^= eventId.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value & 0x7fffffff || 1;
}

async function ensureNativeAppState() {
  if (!isNativeAndroid() || appListener) return;
  nativeAppActive = (await App.getState().catch(() => ({ isActive: true })))
    .isActive;
  appListener = await App.addListener("appStateChange", ({ isActive }) => {
    nativeAppActive = isActive;
    if (isActive && pushState === "registered")
      PushNotifications.register().catch(() => updatePushState("unavailable"));
  });
}

async function registerLocalNotificationFallback() {
  if (!isNativeAndroid()) return false;
  await ensureNativeAppState();
  if (!localNotificationsStarted) {
    localNotificationsStarted = true;
    localListeners = [
      await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        openLocalNotificationTarget
      ),
    ];
  }
  let permission = await LocalNotifications.checkPermissions();
  if (
    permission.display === "prompt" ||
    permission.display === "prompt-with-rationale"
  )
    permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return false;
  await Promise.all([
    LocalNotifications.createChannel({
      id: "messages-v2",
      name: "聊天消息",
      description: "新消息与好友申请",
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: "echat_message.wav",
    }),
    LocalNotifications.createChannel({
      id: "calls-v2",
      name: "音视频通话",
      description: "E聊语音与视频来电",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: "echat_call.wav",
    }),
  ]);
  return true;
}

function reserveIncomingEvent(kind: AlertSoundKind, eventId?: string) {
  const now = Date.now();
  for (const [key, timestamp] of Array.from(recentAlerts.entries()))
    if (now - timestamp > 10_000) recentAlerts.delete(key);
  const dedupeKey = `${kind}:${eventId || now}`;
  if (eventId && now - (recentAlerts.get(dedupeKey) || 0) < 5_000) return false;
  recentAlerts.set(dedupeKey, now);
  return true;
}

async function playIncomingAlertNow(kind: AlertSoundKind, eventId?: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("echat-alert-sound", {
        detail: { kind, eventId: eventId || "" },
      })
    );
  if (!isNativeAndroid()) return true;
  return MediaPermissions.playAlertSound({ kind })
    .then(result => result.playing)
    .catch(() => false);
}

export async function notifyIncomingEvent(options: {
  kind: AlertSoundKind;
  eventId: string;
  title: string;
  body: string;
  target: NativeNotificationTarget;
}) {
  if (!reserveIncomingEvent(options.kind, options.eventId)) return false;
  if (!isNativeAndroid() || nativeAppActive)
    return playIncomingAlertNow(options.kind, options.eventId);
  if (pushState === "registered") return true;
  if (!(await registerLocalNotificationFallback())) return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationId(`${options.kind}:${options.eventId}`),
        title: options.title,
        body: options.body,
        channelId: options.kind === "message" ? "messages-v2" : "calls-v2",
        smallIcon: "ic_stat_echat",
        iconColor: "#12D6B0",
        group: options.kind === "message" ? "echat-messages" : "echat-calls",
        autoCancel: true,
        extra: options.target,
      },
    ],
  });
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("echat-local-notification", {
        detail: { kind: options.kind, eventId: options.eventId },
      })
    );
  return true;
}

function alertFromPush(notification: PushNotificationSchema) {
  const data = notification.data || {};
  const type = typeof data.type === "string" ? data.type : "";
  if (type === "message")
    return playIncomingAlert(
      "message",
      typeof data.messageId === "string" ? data.messageId : undefined
    );
  if (type === "call")
    return playIncomingAlert(
      data.mode === "video" ? "video-call" : "voice-call",
      typeof data.callId === "string" ? data.callId : undefined
    );
  return Promise.resolve(false);
}

export async function playIncomingAlert(
  kind: AlertSoundKind,
  eventId?: string
) {
  if (!reserveIncomingEvent(kind, eventId)) return false;
  return playIncomingAlertNow(kind, eventId);
}

export async function stopIncomingCallAlert() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("echat-alert-sound-stopped"));
  if (!isNativeAndroid()) return;
  await MediaPermissions.stopAlertSound({ kind: "call" }).catch(
    () => undefined
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
      appVersion: "0.8.5",
    }),
  });
  updatePushState("registered");
}

export async function registerNativePush() {
  if (!isNativeAndroid()) return "web" as const;
  const localNotificationsAvailable =
    await registerLocalNotificationFallback().catch(() => false);
  const serverStatus = await api<{ enabled: boolean }>(
    "/api/push/status"
  ).catch(() => ({ enabled: false }));
  if (!serverStatus.enabled) {
    const nextState = localNotificationsAvailable ? "local" : "denied";
    updatePushState(nextState);
    return nextState;
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
    const nextState = localNotificationsAvailable ? "local" : "unavailable";
    updatePushState(nextState);
    return nextState;
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
      PushNotifications.addListener("pushNotificationReceived", notification =>
        alertFromPush(notification).catch(() => undefined)
      ),
    ]);
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
        id: "messages-v2",
        name: "聊天消息",
        description: "新消息与好友申请",
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: "echat_message.wav",
      }),
      PushNotifications.createChannel({
        id: "calls-v2",
        name: "音视频通话",
        description: "E聊语音与视频来电",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "echat_call.wav",
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
  if (pushStarted) await PushNotifications.unregister().catch(() => undefined);
  for (const listener of listeners) await listener.remove();
  listeners = [];
  for (const listener of localListeners) await listener.remove();
  localListeners = [];
  await appListener?.remove();
  appListener = null;
  pushStarted = false;
  localNotificationsStarted = false;
  nativeAppActive = true;
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
