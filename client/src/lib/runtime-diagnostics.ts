export type DiagnosticEntry = {
  at: string;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  details?: unknown;
};

const MAX_ENTRIES = 1200;
const STORAGE_KEY = "echat.runtime-diagnostics.v2";
const entries: DiagnosticEntry[] = [];
let installed = false;
let persistTimer: number | null = null;
let apiFetchInstalled = false;
let apiRequestSequence = 0;

function persistEntries() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Diagnostics must not affect app behavior when storage is unavailable.
  }
}

function schedulePersist() {
  if (typeof window === "undefined" || persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    persistEntries();
  }, 200);
}

function restoreEntries() {
  if (typeof window === "undefined") return;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    ) as DiagnosticEntry[];
    if (Array.isArray(parsed))
      entries.push(
        ...parsed
          .filter(
            entry =>
              entry &&
              typeof entry.at === "string" &&
              typeof entry.scope === "string"
          )
          .slice(-MAX_ENTRIES)
      );
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function safe(value: unknown) {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

export function log(
  level: DiagnosticEntry["level"],
  scope: string,
  message: string,
  details?: unknown
) {
  entries.push({
    at: new Date().toISOString(),
    level,
    scope,
    message,
    ...(details === undefined ? {} : { details: safe(details) }),
  });
  if (entries.length > MAX_ENTRIES)
    entries.splice(0, entries.length - MAX_ENTRIES);
  schedulePersist();
}

export const info = (scope: string, message: string, details?: unknown) =>
  log("info", scope, message, details);
export const warn = (scope: string, message: string, details?: unknown) =>
  log("warn", scope, message, details);
export const error = (scope: string, message: string, details?: unknown) =>
  log("error", scope, message, details);
export const callLog = (message: string, details?: unknown) =>
  info("call", message, details);
export const rtcLog = (message: string, details?: unknown) =>
  info("webrtc", message, details);
export const audioLog = (message: string, details?: unknown) =>
  info("audio", message, details);
export const recoveryLog = (message: string, details?: unknown) =>
  warn("recovery", message, details);

function sanitizedEndpoint(raw: string) {
  try {
    const url = new URL(raw, window.location.origin);
    const queryKeys = Array.from(url.searchParams.keys());
    return `${url.origin}${url.pathname}${queryKeys.length ? `?${queryKeys.join("&")}` : ""}`;
  } catch {
    return raw.split("?")[0];
  }
}

function installApiFetchCapture() {
  if (apiFetchInstalled || typeof window === "undefined" || !globalThis.fetch)
    return;
  apiFetchInstalled = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    let path = rawUrl;
    try {
      path = new URL(rawUrl, window.location.origin).pathname;
    } catch {
      // Keep the raw URL for the API-path check.
    }
    if (!path.startsWith("/api/") && !path.startsWith("/hubs/"))
      return originalFetch(input, init);
    const requestId = `api-${Date.now()}-${++apiRequestSequence}`;
    const method = (
      init?.method || (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const endpoint = sanitizedEndpoint(rawUrl);
    const startedAt = performance.now();
    info("api", "HTTP request", {
      requestId,
      method,
      endpoint,
      hasBody: !!init?.body,
      online: navigator.onLine,
    });
    try {
      const response = await originalFetch(input, init);
      const details = {
        requestId,
        method,
        endpoint,
        status: response.status,
        ok: response.ok,
        durationMs: Math.round(performance.now() - startedAt),
        responseType: response.headers.get("content-type")?.split(";")[0] || "",
      };
      if (response.ok) info("api", "HTTP response", details);
      else warn("api", "HTTP response error", details);
      return response;
    } catch (cause) {
      error("api", "HTTP transport failure", {
        requestId,
        method,
        endpoint,
        durationMs: Math.round(performance.now() - startedAt),
        cause,
      });
      throw cause;
    }
  };
}

export function installDiagnosticCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  installApiFetchCapture();
  window.addEventListener("error", event =>
    error("window", event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  );
  window.addEventListener("unhandledrejection", event =>
    error("promise", "Unhandled promise rejection", event.reason)
  );
  window.addEventListener("online", () => info("network", "Online"));
  window.addEventListener("offline", () => warn("network", "Offline"));
  window.addEventListener("pagehide", persistEntries);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistEntries();
  });
}

export function snapshot() {
  return entries.slice();
}

export function exportDiagnosticLog(extraEntries: DiagnosticEntry[] = []) {
  persistEntries();
  const mergedEntries = [...snapshot(), ...extraEntries]
    .sort((left, right) => left.at.localeCompare(right.at))
    .slice(-2000);
  const payload = {
    app: "EChat",
    exportedAt: new Date().toISOString(),
    userAgent:
      typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    sources: {
      webRuntime: entries.length,
      nativeRuntime: extraEntries.length,
    },
    entries: mergedEntries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const filename = `echat-runtime-log-${new Date().toISOString().replaceAll(":", "-")}.json`;
  const file = new File([blob], filename, { type: blob.type });
  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  )
    return navigator.share({ title: "E聊运行日志", files: [file] });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve();
}

export function clearDiagnosticLog() {
  entries.length = 0;
  persistEntries();
  info("diagnostics", "Runtime diagnostics cleared");
}

restoreEntries();
installDiagnosticCapture();
info("diagnostics", "Runtime diagnostics initialized");

export const recordCallState = (details: unknown) =>
  callLog("Call state", details);
export const recordRtcState = (details: unknown) =>
  rtcLog("RTC state", details);
export const recordAudioState = (details: unknown) =>
  audioLog("Audio state", details);
export const recordRecovery = (details: unknown) =>
  recoveryLog("Automatic recovery", details);
export const recordQuality = (details: unknown) =>
  info("quality", "Call quality", details);
export const recordRoute = (details: unknown) =>
  info("audio-route", "Output route", details);
export const recordNetwork = (details: unknown) =>
  info("network", "Network state", details);
export const recordNoAudio = (details: unknown) =>
  recoveryLog("No audio data detected", details);
export const recordIceRestart = (details: unknown) =>
  recoveryLog("ICE restart", details);
export const recordExport = () => {
  info("diagnostics", "Log export requested");
  return exportDiagnosticLog();
};
export const diagnosticCount = () => entries.length;
export const diagnosticVersion = () => "runtime-log-v1";

export function captureError(scope: string, value: unknown) {
  error(scope, "Captured error", value);
}
export function captureInfo(scope: string, message: string, details?: unknown) {
  info(scope, message, details);
}
export function captureWarning(
  scope: string,
  message: string,
  details?: unknown
) {
  warn(scope, message, details);
}

export const logCall = callLog;
export const logRtc = rtcLog;
export const logAudio = audioLog;
export const logRecovery = recoveryLog;
export const exportLogs = exportDiagnosticLog;
export const clearLogs = clearDiagnosticLog;
export const getLogs = snapshot;
export const getLogCount = diagnosticCount;
export const getLogVersion = diagnosticVersion;

export type { DiagnosticEntry as RuntimeLogEntry };

export function recordEvent(scope: string, message: string, details?: unknown) {
  info(scope, message, details);
}
export function recordError(scope: string, value: unknown) {
  error(scope, "Error", value);
}
export function recordWarning(
  scope: string,
  message: string,
  details?: unknown
) {
  warn(scope, message, details);
}
export function recordInfo(scope: string, message: string, details?: unknown) {
  info(scope, message, details);
}
export function recordStats(details: unknown) {
  info("stats", "RTC stats", details);
}
export function recordLatency(details: unknown) {
  info("network", "Latency", details);
}
export function recordPacketLoss(details: unknown) {
  info("network", "Packet loss", details);
}
export function recordJitter(details: unknown) {
  info("network", "Jitter", details);
}
export function recordOutputDevice(details: unknown) {
  info("audio-route", "Output device", details);
}
export function recordAudioPlayback(details: unknown) {
  audioLog("Audio playback", details);
}
export function recordAudioTrack(details: unknown) {
  audioLog("Audio track", details);
}
export function recordConnectionState(details: unknown) {
  rtcLog("Connection state", details);
}
export function recordPeerState(details: unknown) {
  rtcLog("Peer state", details);
}
export function recordStreamState(details: unknown) {
  rtcLog("Stream state", details);
}
export function recordTrackState(details: unknown) {
  audioLog("Track state", details);
}
export function recordAppState(details: unknown) {
  info("lifecycle", "App state", details);
}
export function recordUserAction(message: string, details?: unknown) {
  info("user", message, details);
}
export function recordSettingsAction(message: string, details?: unknown) {
  info("settings", message, details);
}
export function recordPermission(details: unknown) {
  info("permission", "Permission", details);
}
export function recordPush(details: unknown) {
  info("push", "Push", details);
}
export function recordSignalR(details: unknown) {
  info("signalr", "SignalR", details);
}
export function recordMedia(details: unknown) {
  audioLog("Media", details);
}
export function recordLifecycle(details: unknown) {
  info("lifecycle", "Lifecycle", details);
}
export function recordApiError(details: unknown) {
  error("api", "API error", details);
}
export function recordDevice(details: unknown) {
  info("device", "Device", details);
}
export function recordPlatform(details: unknown) {
  info("device", "Platform", details);
}
export function recordVersion(details: unknown) {
  info("app", "Version", details);
}
export function recordTimer(details: unknown) {
  info("timer", "Timer", details);
}
export function recordNotification(details: unknown) {
  info("notification", "Notification", details);
}
export function recordCallInvite(details: unknown) {
  callLog("Call invite", details);
}
export function recordCallAccept(details: unknown) {
  callLog("Call accept", details);
}
export function recordCallEnd(details: unknown) {
  callLog("Call end", details);
}
export function recordCallSignal(details: unknown) {
  callLog("Call signal", details);
}
export function recordCallTrack(details: unknown) {
  callLog("Call track", details);
}
export function recordCallTimer(details: unknown) {
  callLog("Call timer", details);
}
export function recordAudioOutput(details: unknown) {
  audioLog("Audio output", details);
}
export function recordAudioData(details: unknown) {
  audioLog("Audio data", details);
}
export function recordAutoReconnect(details: unknown) {
  recoveryLog("Auto reconnect", details);
}
export function recordConnectionRecovery(details: unknown) {
  recoveryLog("Connection recovery", details);
}
export function recordQualitySample(details: unknown) {
  info("quality", "Quality sample", details);
}
export function recordLatencySample(details: unknown) {
  info("network", "Latency sample", details);
}
export function recordPacketLossSample(details: unknown) {
  info("network", "Packet loss sample", details);
}
export function recordJitterSample(details: unknown) {
  info("network", "Jitter sample", details);
}
export function recordRouteChange(details: unknown) {
  info("audio-route", "Route change", details);
}
export function recordCallQuality(details: unknown) {
  info("quality", "Call quality", details);
}
export function recordDiagnostics(message: string, details?: unknown) {
  info("diagnostics", message, details);
}
export function recordSupport(message: string, details?: unknown) {
  info("support", message, details);
}
export function recordBug(message: string, details?: unknown) {
  warn("bug", message, details);
}
export function recordFix(message: string, details?: unknown) {
  info("fix", message, details);
}
export function recordTest(message: string, details?: unknown) {
  info("test", message, details);
}
export function recordBuild(message: string, details?: unknown) {
  info("build", message, details);
}
export function recordRelease(message: string, details?: unknown) {
  info("release", message, details);
}
export function recordDeployment(message: string, details?: unknown) {
  info("deployment", message, details);
}
export function recordCheckpoint(message: string, details?: unknown) {
  info("checkpoint", message, details);
}
export function recordPrivacy(message: string, details?: unknown) {
  info("privacy", message, details);
}
export function recordSecurity(message: string, details?: unknown) {
  info("security", message, details);
}
export function recordPerformance(message: string, details?: unknown) {
  info("performance", message, details);
}
export function recordMemory(message: string, details?: unknown) {
  info("memory", message, details);
}
export function recordBattery(message: string, details?: unknown) {
  info("battery", message, details);
}
export function recordOnline() {
  info("network", "Online");
}
export function recordOffline() {
  warn("network", "Offline");
}
export function recordConnected(details?: unknown) {
  info("connection", "Connected", details);
}
export function recordDisconnected(details?: unknown) {
  warn("connection", "Disconnected", details);
}
export function recordStarted(scope: string, details?: unknown) {
  info(scope, "Started", details);
}
export function recordStopped(scope: string, details?: unknown) {
  info(scope, "Stopped", details);
}
export function recordUpdated(scope: string, details?: unknown) {
  info(scope, "Updated", details);
}
export function recordCleared(scope: string, details?: unknown) {
  info(scope, "Cleared", details);
}
export function recordRestored(scope: string, details?: unknown) {
  info(scope, "Restored", details);
}
export function recordFailed(scope: string, details?: unknown) {
  error(scope, "Failed", details);
}
export function recordSucceeded(scope: string, details?: unknown) {
  info(scope, "Succeeded", details);
}
export function recordRetry(scope: string, details?: unknown) {
  warn(scope, "Retry", details);
}
export function recordTimeout(scope: string, details?: unknown) {
  warn(scope, "Timeout", details);
}
export function recordContext(scope: string, details?: unknown) {
  info(scope, "Context", details);
}
export function recordState(scope: string, details?: unknown) {
  info(scope, "State", details);
}
export function recordMetric(scope: string, details?: unknown) {
  info(scope, "Metric", details);
}
export function recordResult(scope: string, details?: unknown) {
  info(scope, "Result", details);
}
export function recordRequest(scope: string, details?: unknown) {
  info(scope, "Request", details);
}
export function recordResponse(scope: string, details?: unknown) {
  info(scope, "Response", details);
}
export function recordStorage(scope: string, details?: unknown) {
  info(scope, "Storage", details);
}
export function recordAuth(scope: string, details?: unknown) {
  info(scope, "Auth", details);
}
export function recordSession(scope: string, details?: unknown) {
  info(scope, "Session", details);
}
export function recordToken(scope: string, details?: unknown) {
  info(scope, "Token", details);
}
export function recordLogin(scope: string, details?: unknown) {
  info(scope, "Login", details);
}
export function recordLogout(scope: string, details?: unknown) {
  info(scope, "Logout", details);
}
export function recordBackground(scope: string, details?: unknown) {
  info(scope, "Background", details);
}
export function recordForeground(scope: string, details?: unknown) {
  info(scope, "Foreground", details);
}
export function recordLock(scope: string, details?: unknown) {
  info(scope, "Lock", details);
}
export function recordUnlock(scope: string, details?: unknown) {
  info(scope, "Unlock", details);
}
export function recordCallKit(scope: string, details?: unknown) {
  info(scope, "CallKit", details);
}
export function recordPushKit(scope: string, details?: unknown) {
  info(scope, "PushKit", details);
}
export function recordVoip(scope: string, details?: unknown) {
  info(scope, "VoIP", details);
}
export function recordHarmony(scope: string, details?: unknown) {
  info(scope, "Harmony", details);
}
export function recordAndroid(scope: string, details?: unknown) {
  info(scope, "Android", details);
}
export function recordIos(scope: string, details?: unknown) {
  info(scope, "iOS", details);
}
export function recordWindows(scope: string, details?: unknown) {
  info(scope, "Windows", details);
}
export function recordWebView(scope: string, details?: unknown) {
  info(scope, "WebView", details);
}
export function recordBrowser(scope: string, details?: unknown) {
  info(scope, "Browser", details);
}
export function recordUserReport(message: string, details?: unknown) {
  info("user-report", message, details);
}
export function recordFeature(message: string, details?: unknown) {
  info("feature", message, details);
}
export function recordPreference(message: string, details?: unknown) {
  info("preference", message, details);
}
export function recordNavigation(message: string, details?: unknown) {
  info("navigation", message, details);
}
export function recordInteraction(message: string, details?: unknown) {
  info("interaction", message, details);
}
export function recordRequestEvent(message: string, details?: unknown) {
  info("request", message, details);
}
export function recordResponseEvent(message: string, details?: unknown) {
  info("response", message, details);
}
export function recordException(scope: string, details: unknown) {
  error(scope, "Exception", details);
}
export function recordDebug(scope: string, message: string, details?: unknown) {
  info(scope, `[debug] ${message}`, details);
}
export function recordTrace(scope: string, message: string, details?: unknown) {
  info(scope, `[trace] ${message}`, details);
}
export function record(scope: string, message: string, details?: unknown) {
  info(scope, message, details);
}
export function report(scope: string, message: string, details?: unknown) {
  info(scope, message, details);
}
export function reportError(scope: string, message: string, details?: unknown) {
  error(scope, message, details);
}
export function reportWarning(
  scope: string,
  message: string,
  details?: unknown
) {
  warn(scope, message, details);
}
export function reportInfo(scope: string, message: string, details?: unknown) {
  info(scope, message, details);
}

export type { DiagnosticEntry as RuntimeDiagnosticEntry };
