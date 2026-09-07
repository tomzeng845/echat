import { api, authorizedFetch, uploadMedia, type Message } from "./echat-api";
import { decryptBinary, getConversationKey } from "./echat-crypto";
import { createUuid } from "./uuid";

export type ChatMediaKind = "Image" | "Voice" | "Video" | "File";
export type ChatMediaPayload = {
  assetId: string;
  fileName: string;
  mimeType: string;
  size: number;
  fileNonce?: string;
  duration?: number;
};

export async function sendChatMedia(
  conversationId: string,
  file: File | Blob,
  kind: ChatMediaKind,
  options: { fileName?: string; mimeType?: string; duration?: number } = {}
) {
  if (file.size > 25 * 1024 * 1024) throw new Error("文件不能超过 25 MB");
  const fileName =
    options.fileName ||
    (file instanceof File ? file.name : `${kind.toLowerCase()}-${Date.now()}`);
  const mimeType = options.mimeType || file.type || "application/octet-stream";
  const upload =
    file instanceof File
      ? file
      : new File([file], fileName, {
          type: mimeType,
          lastModified: Date.now(),
        });
  const asset = await uploadMedia(upload, fileName, "Chat", conversationId);
  const payload: ChatMediaPayload = {
    assetId: asset.id,
    fileName,
    mimeType,
    size: file.size,
    duration: options.duration,
  };
  return api<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      clientMessageId: createUuid(),
      kind,
      keyVersion: 0,
      algorithm: "PLAINTEXT",
      content: JSON.stringify(payload),
      ciphertext: "",
      nonce: "",
      metadata: { assetId: asset.id },
    }),
  });
}

export function parseMediaPayload(content: string): ChatMediaPayload | null {
  try {
    const value = JSON.parse(content) as ChatMediaPayload;
    return value.assetId ? value : null;
  } catch {
    return null;
  }
}

export async function downloadChatMedia(
  conversationId: string,
  keyVersion: number,
  payload: ChatMediaPayload
) {
  const response = await authorizedFetch(
    `/api/media/${payload.assetId}/content`
  );
  if (!response.ok) throw new Error("媒体下载失败");
  if (!payload.fileNonce) return response.blob();
  const key = await getConversationKey(conversationId, keyVersion);
  if (!key) throw new Error("本设备缺少历史会话密钥");
  const decrypted = await decryptBinary(
    key,
    await response.arrayBuffer(),
    payload.fileNonce
  );
  return new Blob([decrypted], { type: payload.mimeType });
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
