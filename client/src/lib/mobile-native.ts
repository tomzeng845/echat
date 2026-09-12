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
import { apiUrl } from "./runtime-config";
import type { DiagnosticEntry } from "./runtime-diagnostics";

const PENDING_NOTIFICATION_KEY = "echat.pending-notification.v1";
const PENDING_NATIVE_CALL_KEY = "echat.pending-native-call.v1";

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
export type AlertSoundKind =
  | "message"
  | "voice-call"
  | "video-call"
  | "outgoing-call";
export type NativeBackgroundCallSupport = {
  manufacturer: string;
  harmonyCompatible: boolean;
  batteryOptimizationIgnored: boolean;
};
export type NativeCallInvite = {
  conversationId: string;
  callId: string;
  mode: "audio" | "video";
  callerId: string;
  callerName: string;
  callerAvatarUrl: string;
  answerRequested?: boolean;
};

type MediaPermissionsPlugin = {
  getCapabilities(): Promise<{
    firebaseConfigured: boolean;
    apnsAvailable?: boolean;
    voipAvailable?: boolean;
  }>;
  getBackgroundCallSupport(): Promise<NativeBackgroundCallSupport>;
  requestBackgroundCallExemption(options?: {
    force?: boolean;
  }): Promise<NativeBackgroundCallSupport>;
  openBackgroundCallSettings(): Promise<{ opened: boolean }>;
  playAlertSound(options: {
    kind: AlertSoundKind;
  }): Promise<{ playing: boolean }>;
  stopAlertSound(options: { kind: "message" | "call" | "all" }): Promise<void>;
  setCallAudioRoute(options: {
    speaker: boolean;
  }): Promise<{ speaker: boolean; applied: boolean }>;
  endCallAudioSession(): Promise<void>;
  startCallListener(options: {
    hubUrl: string;
    token: string;
    userId: string;
  }): Promise<{ running: boolean }>;
  stopCallListener(): Promise<void>;
  clearCallListenerAlert(options: { callId: string }): Promise<void>;
  getPendingCall(): Promise<Partial<NativeCallInvite> & { available: boolean }>;
  getRuntimeLogs(): Promise<{ entriesJson: string }>;
  getVoipToken(): Promise<{ token: string; available: boolean }>;
  addListener(
    eventName: "callListenerIncoming",
    listener: (invite: NativeCallInvite) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "callListenerCleared",
    listener: (event: {
      callId: string;
      conversationId?: string;
      callerId?: string;
      reason?: string;
    }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "voipToken",
    listener: (event: { token: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "audioSessionRecovered",
    listener: (event: { reason?: string; [key: string]: unknown }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "audioSessionState",
    listener: (event: { reason?: string; [key: string]: unknown }) => void
  ): Promise<PluginListenerHandle>;
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
let callListenerHandles: PluginListenerHandle[] = [];
let pushStarted = false;
let localNotificationsStarted = false;
let callListenerStarted = false;
let callListenerRefreshedAt = 0;
let nativeAppActive = true;
let nativeServerPushEnabled = false;
const recentAlerts = new Map<string, number>();

export function isNativeAndroid() {
  return Capacitor.getPlatform() === "android";
}

export function isNativeIos() {
  return Capacitor.getPlatform() === "ios";
}

export function isNativeMobile() {
  return isNativeAndroid() || isNativeIos();
}

export function getNativePushState() {
  return pushState;
}

export function getNativeCallListenerState() {
  return callListenerStarted;
}

export async function getNativeRuntimeLogs(): Promise<DiagnosticEntry[]> {
  if (!isNativeAndroid()) return [];
  try {
    const result = await MediaPermissions.getRuntimeLogs();
    const parsed = JSON.parse(result.entriesJson || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DiagnosticEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as DiagnosticEntry).at === "string" &&
        ["info", "warn", "error"].includes((entry as DiagnosticEntry).level) &&
        typeof (entry as DiagnosticEntry).scope === "string" &&
        typeof (entry as DiagnosticEntry).message === "string"
    );
  } catch {
    return [];
  }
}

function updateCallListenerState(running: boolean) {
  callListenerStarted = running;
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("echat-call-listener-status", { detail: running })
    );
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

function dispatchNativeCall(invite: NativeCallInvite) {
  if (!invite.callId || !invite.conversationId) return;
  localStorage.setItem(PENDING_NATIVE_CALL_KEY, JSON.stringify(invite));
  dispatchNotificationTarget({
    type: "call",
    conversationId: invite.conversationId,
    callId: invite.callId,
  });
  window.dispatchEvent(
    new CustomEvent("echat-native-call", { detail: invite })
  );
}

export function consumePendingNativeCall(): NativeCallInvite | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(PENDING_NATIVE_CALL_KEY) || "null"
    ) as NativeCallInvite | null;
    localStorage.removeItem(PENDING_NATIVE_CALL_KEY);
    return value;
  } catch {
    localStorage.removeItem(PENDING_NATIVE_CALL_KEY);
    return null;
  }
}

function clearPendingNativeCall(callId: string) {
  try {
    const value = JSON.parse(
      localStorage.getItem(PENDING_NATIVE_CALL_KEY) || "null"
    ) as NativeCallInvite | null;
    if (!value || value.callId === callId)
      localStorage.removeItem(PENDING_NATIVE_CALL_KEY);
  } catch {
    localStorage.removeItem(PENDING_NATIVE_CALL_KEY);
  }
}

async function ensureCallListenerEvents() {
  if (callListenerHandles.length) return;
  callListenerHandles = [
    await MediaPermissions.addListener("callListenerIncoming", invite =>
      dispatchNativeCall(invite)
    ),
    await MediaPermissions.addListener("callListenerCleared", event => {
      clearPendingNativeCall(event.callId);
      window.dispatchEvent(
        new CustomEvent("echat-native-call-cleared", { detail: event })
      );
    }),
    await MediaPermissions.addListener("voipToken", event => {
      savePushTokenValue(event.token, "ios-voip").catch(() => undefined);
    }),
    await MediaPermissions.addListener("audioSessionRecovered", event => {
      window.dispatchEvent(
        new CustomEvent("echat-audio-session-recovered", { detail: event })
      );
    }),
    await MediaPermissions.addListener("audioSessionState", event => {
      window.dispatchEvent(
        new CustomEvent("echat-audio-session-state", { detail: event })
      );
    }),
  ];
}

export async function startNativeCallListener(force = false) {
  if (!isNativeMobile()) return false;
  await ensureNativeAppState();
  if (
    !force &&
    callListenerStarted &&
    Date.now() - callListenerRefreshedAt < 6 * 60 * 60 * 1000
  )
    return true;
  await ensureCallListenerEvents();
  if (isNativeIos()) {
    const result = await MediaPermissions.startCallListener({
      hubUrl: "",
      token: "",
      userId: "",
    });
    updateCallListenerState(result.running);
    callListenerRefreshedAt = Date.now();
    const voip = await MediaPermissions.getVoipToken().catch(() => null);
    if (voip?.available && voip.token)
      await savePushTokenValue(voip.token, "ios-voip").catch(() => undefined);
    const pending = await MediaPermissions.getPendingCall().catch(() => null);
    if (
      pending?.available &&
      pending.callId &&
      pending.conversationId &&
      pending.mode &&
      pending.callerId &&
      pending.callerName !== undefined
    )
      dispatchNativeCall(pending as NativeCallInvite);
    return callListenerStarted;
  }
  const listener = await api<{
    token: string;
    expiresAtUtc: string;
    userId: string;
  }>("/api/calls/listener-token", { method: "POST" });
  const result = await MediaPermissions.startCallListener({
    hubUrl: apiUrl("/hubs/chat"),
    token: listener.token,
    userId: listener.userId,
  });
  updateCallListenerState(result.running);
  callListenerRefreshedAt = Date.now();
  const pending = await MediaPermissions.getPendingCall().catch(() => null);
  if (
    pending?.available &&
    pending.callId &&
    pending.conversationId &&
    pending.mode &&
    pending.callerId &&
    pending.callerName !== undefined
  )
    dispatchNativeCall(pending as NativeCallInvite);
  return callListenerStarted;
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
  if (!isNativeMobile() || appListener) return;
  nativeAppActive = (await App.getState().catch(() => ({ isActive: true })))
    .isActive;
  appListener = await App.addListener("appStateChange", ({ isActive }) => {
    nativeAppActive = isActive;
    if (isActive && callListenerStarted)
      startNativeCallListener().catch(() => undefined);
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
  if (!isNativeMobile()) return true;
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
  if (!isNativeMobile() || nativeAppActive)
    return playIncomingAlertNow(options.kind, options.eventId);
  if (isNativeIos()) return true;
  if (options.kind !== "message" && callListenerStarted) return true;
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

export async function playOutgoingCallAlert(eventId: string) {
  if (!reserveIncomingEvent("outgoing-call", eventId)) return false;
  return playIncomingAlertNow("outgoing-call", eventId);
}

export async function stopIncomingCallAlert() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("echat-alert-sound-stopped"));
  if (!isNativeMobile()) return;
  await MediaPermissions.stopAlertSound({ kind: "call" }).catch(
    () => undefined
  );
}

export async function clearNativeCallListenerAlert(callId: string) {
  if (!isNativeMobile() || !callId) return;
  clearPendingNativeCall(callId);
  await MediaPermissions.clearCallListenerAlert({ callId }).catch(
    () => undefined
  );
}

export async function getNativeBackgroundCallSupport() {
  if (!isNativeMobile()) return null;
  return MediaPermissions.getBackgroundCallSupport().catch(() => null);
}

export async function requestNativeBackgroundCallExemption(force = false) {
  if (!isNativeMobile()) return null;
  return MediaPermissions.requestBackgroundCallExemption({ force }).catch(
    () => null
  );
}

export async function openNativeBackgroundCallSettings() {
  if (!isNativeMobile()) return false;
  return MediaPermissions.openBackgroundCallSettings()
    .then(result => result.opened)
    .catch(() => false);
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

async function savePushTokenValue(
  token: string,
  platform: "android" | "ios" | "ios-voip"
) {
  await api("/api/push/devices", {
    method: "POST",
    body: JSON.stringify({
      deviceId: getDeviceId(),
      token,
      platform,
      appVersion: "0.9.0",
    }),
  });
  if (platform !== "ios-voip")
    updatePushState(nativeServerPushEnabled ? "registered" : "unavailable");
}

async function savePushToken(token: Token) {
  await savePushTokenValue(token.value, isNativeIos() ? "ios" : "android");
}

export async function registerNativePush() {
  if (!isNativeMobile()) return "web" as const;
  await startNativeCallListener().catch(() => undefined);
  await requestNativeBackgroundCallExemption().catch(() => undefined);
  const localNotificationsAvailable = isNativeAndroid()
    ? await registerLocalNotificationFallback().catch(() => false)
    : false;
  const serverStatus = await api<{
    enabled: boolean;
    androidEnabled?: boolean;
    iosEnabled?: boolean;
  }>("/api/push/status").catch(
    (): {
      enabled: boolean;
      androidEnabled?: boolean;
      iosEnabled?: boolean;
    } => ({ enabled: false })
  );
  nativeServerPushEnabled = isNativeIos()
    ? Boolean(serverStatus.iosEnabled)
    : Boolean(serverStatus.androidEnabled ?? serverStatus.enabled);
  if (isNativeAndroid() && !nativeServerPushEnabled) {
    const nextState = localNotificationsAvailable ? "local" : "denied";
    updatePushState(nextState);
    return nextState;
  }
  const nativeCapabilities = await MediaPermissions.getCapabilities().catch(
    () =>
      isNativeIos()
        ? { firebaseConfigured: true, apnsAvailable: true, voipAvailable: true }
        : { firebaseConfigured: false }
  );
  if (
    isNativeAndroid() &&
    !canInitializeNativePush(
      nativeServerPushEnabled,
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
    if (isNativeAndroid())
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
  if (!isNativeMobile()) return;
  await MediaPermissions.stopCallListener().catch(() => undefined);
  await api(`/api/push/devices/${encodeURIComponent(getDeviceId())}`, {
    method: "DELETE",
  }).catch(() => undefined);
  if (pushStarted) await PushNotifications.unregister().catch(() => undefined);
  for (const listener of listeners) await listener.remove();
  listeners = [];
  for (const listener of localListeners) await listener.remove();
  localListeners = [];
  for (const listener of callListenerHandles) await listener.remove();
  callListenerHandles = [];
  await appListener?.remove();
  appListener = null;
  pushStarted = false;
  localNotificationsStarted = false;
  updateCallListenerState(false);
  callListenerRefreshedAt = 0;
  nativeAppActive = true;
  nativeServerPushEnabled = false;
  updatePushState("prompt");
}

export async function ensureNativeMediaPermissions(options: {
  camera?: boolean;
  microphone?: boolean;
}) {
  if (!isNativeMobile()) return;
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
  if (!isNativeMobile()) return speaker;
  const result = await MediaPermissions.setCallAudioRoute({ speaker });
  if (!result.applied) throw new Error("当前设备无法切换音频输出");
  return result.speaker;
}

export async function endNativeCallAudioSession() {
  if (!isNativeMobile()) return;
  await MediaPermissions.endCallAudioSession();
}
