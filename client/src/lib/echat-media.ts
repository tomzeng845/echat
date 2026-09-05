import { api, authorizedFetch, uploadMedia, type Message } from "./echat-api";
import { decryptBinary, encryptBinary, encryptMessage, getConversationKey } from "./echat-crypto";

export type ChatMediaKind = "Image" | "Voice" | "Video" | "File";
export type ChatMediaPayload = {
  assetId: string;
  fileName: string;
  mimeType: string;
  size: number;
  fileNonce: string;
  duration?: number;
};

export async function sendEncryptedMedia(conversationId: string, file: File | Blob, kind: ChatMediaKind, options: { fileName?: string; mimeType?: string; duration?: number } = {}) {
  const key = await getConversationKey(conversationId);
  if (!key) throw new Error("本设备缺少会话密钥");
  if (file.size > 25 * 1024 * 1024) throw new Error("文件不能超过 25 MB");
  const fileName = options.fileName || (file instanceof File ? file.name : `${kind.toLowerCase()}-${Date.now()}`);
  const mimeType = options.mimeType || file.type || "application/octet-stream";
  const binary = await encryptBinary(key, await file.arrayBuffer());
  const asset = await uploadMedia(binary.blob, `${crypto.randomUUID()}.e2ee`, "Chat", conversationId);
  const payload: ChatMediaPayload = { assetId: asset.id, fileName, mimeType, size: file.size, fileNonce: binary.nonce, duration: options.duration };
  const encrypted = await encryptMessage(key, JSON.stringify(payload));
  return api<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: crypto.randomUUID(), kind, ...encrypted, metadata: { assetId: asset.id } }),
  });
}

export function parseMediaPayload(plaintext: string): ChatMediaPayload | null {
  try {
    const value = JSON.parse(plaintext) as ChatMediaPayload;
    return value.assetId && value.fileNonce ? value : null;
  } catch { return null; }
}

export async function downloadDecryptedMedia(conversationId: string, payload: ChatMediaPayload) {
  const key = await getConversationKey(conversationId);
  if (!key) throw new Error("本设备缺少会话密钥");
  const response = await authorizedFetch(`/api/media/${payload.assetId}/content`);
  if (!response.ok) throw new Error("媒体下载失败");
  const decrypted = await decryptBinary(key, await response.arrayBuffer(), payload.fileNonce);
  return new Blob([decrypted], { type: payload.mimeType });
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
