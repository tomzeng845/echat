import * as signalR from "@microsoft/signalr";
import { apiUrl } from "./runtime-config";

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
export type ConversationMember = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  role: "Owner" | "Admin" | "Member";
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

const SESSION_KEY = "echat.session.v1";
const DEVICE_KEY = "echat.device.v1";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export const getSession = (): AuthResponse | null => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
};
export const setSession = (session: AuthResponse | null) =>
  session
    ? localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    : localStorage.removeItem(SESSION_KEY);
export const getDeviceId = () => {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID().replaceAll("-", "");
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
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (response.status === 401 && retry && session?.refreshToken) {
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
      setSession(await refreshed.json());
      return authorizedFetch(path, init, false);
    }
    setSession(null);
    window.dispatchEvent(new Event("echat-session-expired"));
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
    const problem = await response
      .json()
      .catch(() => ({ error: `请求失败 (${response.status})` }));
    throw new ApiError(
      problem.error || problem.title || `请求失败 (${response.status})`,
      response.status
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
  const form = new FormData();
  form.append("file", file, fileName);
  form.append("purpose", purpose);
  if (conversationId) form.append("conversationId", conversationId);
  return api<MediaAsset>("/api/media", { method: "POST", body: form });
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

export function connectRealtime(handlers: RealtimeHandlers) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(apiUrl("/hubs/chat"), {
      accessTokenFactory: () => getSession()?.accessToken || "",
    })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
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
