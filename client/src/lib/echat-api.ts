import * as signalR from "@microsoft/signalr";

export type User = { id: string; account: string; displayName: string; avatarUrl: string; signature: string; region: string; role: "User" | "Reviewer" | "Operator" | "Admin"; status: string };
export type AuthResponse = { success: boolean; accessToken?: string; refreshToken?: string; expiresAtUtc?: string; user?: User; requiresTotp?: boolean; pendingToken?: string; error?: string };
export type Conversation = { id: string; type: "Direct" | "Group" | "System"; name: string; avatarUrl: string; lastSequence: number; lastMessagePreview: string; lastMessageAtUtc?: string; memberCount: number; readSequence: number; muted: boolean; pinned: boolean; keyEnvelope?: string };
export type Message = { id: string; clientMessageId: string; conversationId: string; sequence: number; senderId: string; kind: string; ciphertext: string; nonce: string; algorithm: string; replyToMessageId?: string; metadata: Record<string, string>; state: "Accepted" | "Recalled"; sentAtUtc: string; recalledAtUtc?: string };
export type Contact = { status: string; remark: string; user: User };
export type FriendRequest = { id: string; senderId: string; receiverId: string; note: string; source: string; status: string; createdAtUtc: string };

const SESSION_KEY = "echat.session.v1";
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "ApiError"; }
}
export const getSession = (): AuthResponse | null => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
export const setSession = (session: AuthResponse | null) => session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY);

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && retry && session?.refreshToken) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken, deviceName: navigator.userAgent }) });
    if (refreshed.ok) { setSession(await refreshed.json()); return api<T>(path, init, false); }
    setSession(null);
    window.dispatchEvent(new Event("echat-session-expired"));
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ error: `请求失败 (${response.status})` }));
    throw new ApiError(problem.error || problem.title || `请求失败 (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function connectRealtime(onMessage: (message: Message) => void, onUpdate: (message: Message) => void, onConversation: () => void) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/chat", { accessTokenFactory: () => getSession()?.accessToken || "" })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
  connection.on("message.created", onMessage);
  connection.on("message.updated", onUpdate);
  connection.on("conversation.updated", onConversation);
  return connection;
}
