import * as signalR from "@microsoft/signalr";
import { apiUrl } from "./runtime-config";
import {
  clearPersistedSession,
  persistSession,
  readLocalSession,
  restorePersistedSession,
} from "./session-storage";
import { createUuid } from "./uuid";
import { error as logError, info as logInfo, recordSignalR } from "./runtime-diagnostics";

export type User = {
  id: string;
  account: string;
  displayName: string;
  avatarUrl: string;
  signature: string;
  region: string;
  role: "User" | "Reviewer" | "Operator" | "Admin";
  status: string;
};
export type AuthResponse = {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAtUtc?: string;
  user?: User;
  requiresTotp?: boolean;
  pendingToken?: string;
  error?: string;
  sessionId?: string;
  deviceId?: string;
};
export type Conversation = {
  id: string;
  type: "Direct" | "Group" | "System";
  name: string;
  avatarUrl: string;
  lastSequence: number;
  lastMessagePreview: string;
  lastMessageAtUtc?: string;
  memberCount: number;
  readSequence: number;
  muted: boolean;
  pinned: boolean;
  keyVersion: number;
  keyEnvelope?: string;
  peerId?: string;
};
export type ConversationKeyEnvelope = {
  conversationId: string;
  keyVersion: number;
  keyEnvelope: string;
};
export type Message = {
  id: string;
  clientMessageId: string;
  conversationId: string;
  sequence: number;
  senderId: string;
  kind: "Text" | "Emoji" | "Image" | "Voice" | "Video" | "File" | "System";
  ciphertext: string;
  nonce: string;
  algorithm: string;
  content: string;
  keyVersion: number;
  replyToMessageId?: string;
  metadata: Record<string, string>;
  state: "Accepted" | "Recalled";
  sentAtUtc: string;
  recalledAtUtc?: string;
};
export type Contact = { status: string; remark: string; user: User };
export type FriendRequest = {
  id: string;
  senderId: string;
  receiverId: string;
  note: string;
  source: string;
  status: string;
  createdAtUtc: string;
  sender?: User;
  receiver?: User;
};
export type ContactRealtimeEvent = {
  status?: string;
  peer?: User;
  peerId?: string;
  requestId?: string;
  sender?: User;
};
export type ReceiptUpdated = {
  conversationId: string;
  userId: string;
  readSequence: number;
};
export type TypingUpdated = {
  conversationId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
};
export type ConversationMember = {
  userId: string;
  account: string;
  displayName: string;
  avatarUrl: string;
  role: "Owner" | "Admin" | "Member";
  muted: boolean;
  encryptionDevices: Array<{ deviceId: string; publicKeyJwk: string }>;
};
export type PublicKeyBundle = {
  id: string;
  account: string;
  displayName: string;
  publicKeyJwk: string;
  encryptionDevices: Array<{ deviceId: string; publicKeyJwk: string }>;
};
export type MediaAsset = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  purpose: "Chat" | "Moment" | "Feedback";
  contentUrl: string;
  thumbnailUrl?: string | null;
  hlsUrl?: string | null;
  durationSeconds?: number | null;
  isTranscoded?: boolean;
};
export type MomentLike = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  createdAtUtc: string;
};
export type MomentComment = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  createdAtUtc: string;
};
export type MomentVisibility = "Friends" | "Private" | "Selected" | "Excluded";
export type Moment = {
  id: string;
  author: User;
  text: string;
  media: MediaAsset[];
  likes: MomentLike[];
  comments: MomentComment[];
  likedByMe: boolean;
  createdAtUtc: string;
  visibility: MomentVisibility;
};
export type CallInvite = {
  conversationId: string;
  callId: string;
  mode: "audio" | "video";
  callerId: string;
  callerName: string;
  callerAvatarUrl: string;
};
export type CallParticipant = {
  conversationId: string;
  callId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
};
export type CallSignal = {
  conversationId: string;
  callId: string;
  fromUserId: string;
  signalType: "offer" | "answer" | "ice";
  payload: string;
};
export type CallEnded = {
  conversationId: string;
  callId: string;
  userId: string;
  reason?: string;
};
export type QrLoginStart = {
  challengeId: string;
  pollToken: string;
  qrPayload: string;
  expiresAtUtc: string;
};
export type QrLoginState = {
  status:
    | "Pending"
    | "Scanned"
    | "Approved"
    | "Denied"
    | "Consumed"
    | "Expired";
  expiresAtUtc: string;
  approvedDisplayName?: string;
};
export type QrLoginScan = {
  challengeId: string;
  requestDeviceName: string;
  expiresAtUtc: string;
  verificationCode: string;
};
export type ContactQr = { qrPayload: string; expiresAtUtc: string };
export type ContactQrPreview = { user: User; expiresAtUtc: string };
export type DeviceSession = {
  id: string;
  deviceId: string;
  deviceName: string;
  createdAtUtc: string;
  lastSeenAtUtc: string;
  current: boolean;
};
export type CallRecord = {
  id: string;
  conversationId: string;
  conversationName: string;
  callerId: string;
  mode: "audio" | "video";
  status: "Ringing" | "Active" | "Rejected" | "Ended" | "Missed" | "Failed";
  startedAtUtc: string;
  answeredAtUtc?: string;
  endedAtUtc?: string;
  endReason: string;
};
export type RtcConfig = {
  iceServers: RTCIceServer[];
  mode: string;
  turnConfigured: boolean;
  sfuConfigured: boolean;
  maxP2pParticipants: number;
};
export type OpenImSession = {
  userId: string;
  token: string;
  expireTimeSeconds: number;
  apiAddress: string;
  webSocketAddress: string;
  liveKitAddress: string;
};

const DEVICE_KEY = "echat.device.v1";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds = 0
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export const getSession = (): AuthResponse | null => {
  try {
    return JSON.parse(readLocalSession() || "null");
  } catch {
    return null;
  }
};
export const setSession = (session: AuthResponse | null) =>
  session ? persistSession(JSON.stringify(session)) : clearPersistedSession();

export const restoreSession = async () => {
  const raw = await restorePersistedSession();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    return null;
  }
};

let refreshInFlight: Promise<AuthResponse | null> | null = null;

export async function getRealtimeAccessToken(): Promise<string> {
  const session = getSession();
  if (!session?.accessToken) return "";
  const expiresAt = session.expiresAtUtc ? Date.parse(session.expiresAtUtc) : 0;
  const needsRefresh = !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30_000;
  if (needsRefresh && session.refreshToken) {
    const refreshed = await refreshSession(session);
    if (refreshed?.accessToken) return refreshed.accessToken;
  }
  return getSession()?.accessToken || session.accessToken;
}

async function refreshSession(
  session: AuthResponse
): Promise<AuthResponse | null> {
  if (refreshInFlight) return refreshInFlight;
  const current = getSession();
  if (current?.refreshToken && current.refreshToken !== session.refreshToken) {
    return current;
  }
  refreshInFlight = (async () => {
    try {
      const refreshed = await fetch(apiUrl("/api/auth/refresh"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-EChat-Device-Id": getDeviceId(),
        },
        body: JSON.stringify({
          refreshToken: session.refreshToken,
          deviceName: navigator.userAgent,
          deviceId: getDeviceId(),
        }),
      });
      if (refreshed.ok) {
        const next = (await refreshed.json()) as AuthResponse;
        setSession(next);
        return next;
      }
      if (refreshed.status === 401) {
        setSession(null);
        window.dispatchEvent(new Event("echat-session-expired"));
      }
    } catch {
      // A temporary mobile-network failure must not destroy a valid local session.
    } finally {
      refreshInFlight = null;
    }
    return null;
  })();
  return refreshInFlight;
}

export const getDeviceId = () => {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = createUuid().replaceAll("-", "");
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
};

export async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<Response> {
  const session = getSession();
  const headers = new Headers(init.headers);
  if (
    !(init.body instanceof FormData) &&
    init.body &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  if (session?.accessToken)
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("X-EChat-Device-Id", getDeviceId());
  const selectedTenant = localStorage.getItem("echat.admin.tenant");
  if (session?.user?.role === "Admin" && selectedTenant)
    headers.set("X-EChat-Tenant", selectedTenant);
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (response.status === 401 && retry && session?.refreshToken) {
    // Another request may have already rotated this refresh token. Reuse the
    // newer session instead of submitting the revoked token a second time.
    const current = getSession();
    if (
      current?.refreshToken &&
      current.refreshToken !== session.refreshToken
    ) {
      return authorizedFetch(path, init, false);
    }
    if (await refreshSession(session))
      return authorizedFetch(path, init, false);
  }
  return response;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<T> {
  const response = await authorizedFetch(path, init, retry);
  if (!response.ok) {
    if (response.status === 403) {
      logError("api-forbidden", "API request was rejected with 403", {
        path,
        selectedTenant: localStorage.getItem("echat.admin.tenant") || "",
        method: init.method || "GET",
      });
    }
    const contentType = response.headers.get("content-type") || "";
    const problem = contentType.includes("json")
      ? await response
          .json()
          .catch(() => ({ error: `请求失败 (${response.status})` }))
      : {
          error:
            response.status === 401
              ? "登录状态已失效，请重新登录"
              : response.status === 403
                ? "没有权限执行此操作"
                : response.status === 404
                  ? "API 接口不存在，请确认前后端版本一致"
                  : response.status === 502 || response.status === 503
                    ? "API 服务暂时不可用，请检查后端服务状态"
                    : response.status >= 200 && response.status < 300
                      ? "API 地址配置错误：服务器返回了网页而不是 JSON"
                      : `API 请求失败（HTTP ${response.status}）`,
        };
    throw new ApiError(
      problem.error || problem.title || `请求失败 (${response.status})`,
      response.status,
      Number(response.headers.get("Retry-After") || 0)
    );
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json"))
    throw new ApiError(
      "API 地址配置错误：服务器返回了网页而不是 JSON",
      response.status
    );
  return response.json() as Promise<T>;
}

export function getOpenImSession(platform: "ios" | "android" = "ios") {
  return api<OpenImSession>(`/api/openim/session?platform=${platform}`);
}

export async function fetchAuthenticatedBlob(path: string) {
  const response = await authorizedFetch(path);
  if (!response.ok) throw new Error(`图片加载失败 (${response.status})`);
  return response.blob();
}

export async function uploadMedia(
  file: Blob,
  fileName: string,
  purpose: "Chat" | "Moment" | "Avatar",
  conversationId?: string
) {
  if (file.size > 16 * 1024 * 1024 && purpose !== "Avatar")
    return uploadMediaResumable(file, fileName, purpose, conversationId);
  const form = new FormData();
  form.append("file", file, fileName);
  form.append("purpose", purpose);
  if (conversationId) form.append("conversationId", conversationId);
  const controller = new AbortController();
  const startedAt = performance.now();
  const uploadTimeoutMs = 30 * 60 * 1000;
  const timer = window.setTimeout(() => {
    logError("media-upload", "Media API upload timeout; aborting request", {
      fileName,
      bytes: file.size,
      timeoutMs: uploadTimeoutMs,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    controller.abort();
  }, uploadTimeoutMs);
  try {
    logInfo("media-upload", "uploadMedia request dispatched", {
      fileName,
      bytes: file.size,
      purpose,
      conversationIdSuffix: conversationId?.slice(-8) || "",
    });
    const result = await api<MediaAsset>("/api/media", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    logInfo("media-upload", "uploadMedia request succeeded", {
      fileName,
      bytes: file.size,
      assetIdSuffix: result.id.slice(-8),
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    logError("media-upload", "uploadMedia request failed", {
      fileName,
      bytes: file.size,
      elapsedMs: Math.round(performance.now() - startedAt),
      aborted: controller.signal.aborted,
      reason: error instanceof Error ? error.message : String(error),
    });
    if (controller.signal.aborted)
      throw new Error("文件上传或视频处理超过 30 分钟，服务器未完成，请检查网络后重试");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function uploadMediaResumable(
  file: Blob,
  fileName: string,
  purpose: "Chat" | "Moment",
  conversationId?: string
) {
  const chunkSize = 16 * 1024 * 1024;
  const requestTimeoutMs = 15 * 60 * 1000;
  const resumableFetch = async (path: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await authorizedFetch(path, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error("分块上传请求超时，请检查网络后重试；已上传部分可继续续传");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  };
  const resumeKey = `echat-resumable:${purpose}:${conversationId || ""}:${fileName}:${file.size}`;
  let uploadId = localStorage.getItem(resumeKey) || "";
  try {
    if (uploadId) {
      const status = await resumableFetch(`/api/media/resumable/${uploadId}`);
      if (!status.ok) uploadId = "";
    }
    if (!uploadId) {
      const init = await resumableFetch("/api/media/resumable/init", {
        method: "POST",
        body: JSON.stringify({ fileName, size: file.size, contentType: file.type || "application/octet-stream", purpose, conversationId }),
      });
      if (!init.ok) throw new Error(`分块上传初始化失败 (${init.status})`);
      uploadId = (await init.json()).uploadId;
      localStorage.setItem(resumeKey, uploadId);
    }
    const status = await resumableFetch(`/api/media/resumable/${uploadId}`);
    if (!status.ok) throw new Error("无法查询断点上传进度");
    let offset = Number((await status.json()).offset || 0);
    logInfo("media-upload", "resumable upload started", { fileName, bytes: file.size, uploadIdSuffix: uploadId.slice(-8), offset });
    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      const response = await resumableFetch(`/api/media/resumable/${uploadId}`, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end),
      });
      if (!response.ok) throw new Error(`分块上传失败 (${response.status})，已上传 ${offset} 字节`);
      offset = Number((await response.json()).offset);
      logInfo("media-upload", "resumable chunk uploaded", { fileName, bytes: file.size, offset });
    }
    const complete = await resumableFetch(`/api/media/resumable/${uploadId}/complete`, { method: "POST" });
    if (!complete.ok) throw new Error(`分块上传完成失败 (${complete.status})`);
    const result = (await complete.json()) as MediaAsset;
    localStorage.removeItem(resumeKey);
    logInfo("media-upload", "resumable upload completed", { fileName, bytes: file.size, assetIdSuffix: result.id.slice(-8) });
    return result;
  } catch (error) {
    logError("media-upload", "resumable upload interrupted; can resume", { fileName, bytes: file.size, uploadIdSuffix: uploadId.slice(-8), reason: error instanceof Error ? error.message : String(error) });
    if (uploadId) localStorage.setItem(resumeKey, uploadId);
    throw error;
  }
}

export type RealtimeHandlers = {
  onMessage?: (message: Message) => void;
  onMessageAvailable?: (message: Message) => void;
  onMessageUpdate?: (message: Message) => void;
  onConversation?: (event: {
    conversationId: string;
    action: string;
    keyVersion?: number;
  }) => void;
  onContactRequest?: (event: FriendRequest) => void;
  onContactUpdate?: (event: ContactRealtimeEvent) => void;
  onProfileUpdate?: (user: User) => void;
  onReceipt?: (event: ReceiptUpdated) => void;
  onTyping?: (event: TypingUpdated) => void;
  onMoment?: () => void;
  onAdminNotice?: (notice: {
    id: string;
    content: string;
    sentAtUtc: string;
  }) => void;
  onCallInvite?: (invite: CallInvite) => void;
  onCallAccepted?: (participant: CallParticipant) => void;
  onCallRejected?: (event: CallEnded) => void;
  onCallSignal?: (signal: CallSignal) => void;
  onCallEnded?: (event: CallEnded) => void;
};

function instrumentRealtimeConnection(connection: signalR.HubConnection) {
  const endpoint = apiUrl("/hubs/chat").split("?")[0];
  const originalStart = connection.start.bind(connection);
  connection.start = async () => {
    const startedAt = performance.now();
    recordSignalR({ direction: "connect", phase: "started", endpoint });
    try {
      await originalStart();
      recordSignalR({
        direction: "connect",
        phase: "succeeded",
        endpoint,
        connectionId: connection.connectionId,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (cause) {
      recordSignalR({
        direction: "connect",
        phase: "failed",
        endpoint,
        durationMs: Math.round(performance.now() - startedAt),
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  };
  const originalInvoke = connection.invoke.bind(connection);
  connection.invoke = (async <T>(methodName: string, ...args: unknown[]) => {
    const startedAt = performance.now();
    recordSignalR({
      direction: "outbound",
      transport: "invoke",
      method: methodName,
      argCount: args.length,
      state: connection.state,
    });
    try {
      const result = await originalInvoke<T>(methodName, ...args);
      recordSignalR({
        direction: "outbound",
        transport: "invoke",
        method: methodName,
        phase: "succeeded",
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (cause) {
      recordSignalR({
        direction: "outbound",
        transport: "invoke",
        method: methodName,
        phase: "failed",
        durationMs: Math.round(performance.now() - startedAt),
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }) as typeof connection.invoke;
  const originalSend = connection.send.bind(connection);
  connection.send = (async (methodName: string, ...args: unknown[]) => {
    const startedAt = performance.now();
    recordSignalR({
      direction: "outbound",
      transport: "send",
      method: methodName,
      argCount: args.length,
      state: connection.state,
    });
    try {
      await originalSend(methodName, ...args);
      recordSignalR({
        direction: "outbound",
        transport: "send",
        method: methodName,
        phase: "succeeded",
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (cause) {
      recordSignalR({
        direction: "outbound",
        transport: "send",
        method: methodName,
        phase: "failed",
        durationMs: Math.round(performance.now() - startedAt),
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }) as typeof connection.send;
  connection.onreconnecting(cause =>
    recordSignalR({
      direction: "connect",
      phase: "reconnecting",
      error: cause?.message || "",
    })
  );
  connection.onreconnected(connectionId =>
    recordSignalR({
      direction: "connect",
      phase: "reconnected",
      connectionId,
    })
  );
  connection.onclose(cause =>
    recordSignalR({
      direction: "connect",
      phase: "closed",
      error: cause?.message || "",
    })
  );
}

export function connectRealtime(handlers: RealtimeHandlers) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(apiUrl("/hubs/chat"), {
      accessTokenFactory: getRealtimeAccessToken,
    })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
  instrumentRealtimeConnection(connection);
  [
    "message.created",
    "message.available",
    "message.updated",
    "conversation.updated",
    "contact.requested",
    "contact.updated",
    "profile.updated",
    "receipt.updated",
    "typing.updated",
    "moment.updated",
    "admin.notice",
    "call.invited",
    "call.accepted",
    "call.rejected",
    "call.signal",
    "call.ended",
    "call.listener.cleared",
  ].forEach(method => {
    connection.on(method, (...args: unknown[]) =>
      recordSignalR({
        direction: "inbound",
        method,
        argCount: args.length,
        state: connection.state,
      })
    );
  });
  if (handlers.onMessage) connection.on("message.created", handlers.onMessage);
  if (handlers.onMessageAvailable)
    connection.on("message.available", handlers.onMessageAvailable);
  if (handlers.onMessageUpdate)
    connection.on("message.updated", handlers.onMessageUpdate);
  if (handlers.onConversation)
    connection.on("conversation.updated", handlers.onConversation);
  if (handlers.onContactRequest)
    connection.on("contact.requested", handlers.onContactRequest);
  if (handlers.onContactUpdate)
    connection.on("contact.updated", handlers.onContactUpdate);
  if (handlers.onProfileUpdate)
    connection.on("profile.updated", handlers.onProfileUpdate);
  if (handlers.onReceipt) connection.on("receipt.updated", handlers.onReceipt);
  if (handlers.onTyping) connection.on("typing.updated", handlers.onTyping);
  if (handlers.onMoment) connection.on("moment.updated", handlers.onMoment);
  if (handlers.onAdminNotice)
    connection.on("admin.notice", handlers.onAdminNotice);
  if (handlers.onCallInvite)
    connection.on("call.invited", handlers.onCallInvite);
  if (handlers.onCallAccepted)
    connection.on("call.accepted", handlers.onCallAccepted);
  if (handlers.onCallRejected)
    connection.on("call.rejected", handlers.onCallRejected);
  if (handlers.onCallSignal)
    connection.on("call.signal", handlers.onCallSignal);
  if (handlers.onCallEnded) connection.on("call.ended", handlers.onCallEnded);
  return connection;
}
