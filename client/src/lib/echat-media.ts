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

export function effectiveMediaMimeType(
  payload: ChatMediaPayload,
  kind?: "Voice" | "Video"
) {
  const declared = payload.mimeType?.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared;
  const fileName = payload.fileName.toLowerCase();
  if (kind === "Video" && fileName.endsWith(".mp4")) return "video/mp4";
  if (kind === "Video" && fileName.endsWith(".webm")) return "video/webm";
  if (fileName.endsWith(".mov")) return "video/quicktime";
  if (fileName.endsWith(".m4a")) return "audio/mp4";
  if (fileName.endsWith(".webm")) return "audio/webm;codecs=opus";
  if (fileName.endsWith(".ogg") || fileName.endsWith(".opus"))
    return "audio/ogg;codecs=opus";
  if (fileName.endsWith(".wav")) return "audio/wav";
  return declared || "application/octet-stream";
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
  const mimeType = effectiveMediaMimeType(payload);
  if (!payload.fileNonce) {
    const blob = await response.blob();
    return blob.type.toLowerCase() === mimeType
      ? blob
      : blob.slice(0, blob.size, mimeType);
  }
  const key = await getConversationKey(conversationId, keyVersion);
  if (!key) throw new Error("本设备缺少历史会话密钥");
  const decrypted = await decryptBinary(
    key,
    await response.arrayBuffer(),
    payload.fileNonce
  );
  return new Blob([decrypted], { type: mimeType });
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
