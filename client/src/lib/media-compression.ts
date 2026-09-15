import { compressVideo } from "@mdslabs/wc-media-compressor-sdk";
import { error as logError, info as logInfo, warn as logWarn } from "./runtime-diagnostics";

const IMAGE_MAX_EDGE = 2560;
const IMAGE_COMPRESS_THRESHOLD = 2 * 1024 * 1024;
const VIDEO_COMPRESS_THRESHOLD = 8 * 1024 * 1024;
const WEB_VIDEO_TARGET_BITRATE = 800_000;

function replaceExtension(name: string, extension: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return `${base}.${extension}`;
}

export async function compressChatImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= IMAGE_COMPRESS_THRESHOLD)
    return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size <= IMAGE_COMPRESS_THRESHOLD) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      bitmap.close();
      return file;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const preservePng = file.type === "image/png" && scale === 1;
    const mimeType = preservePng ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, mimeType, preservePng ? undefined : 0.9)
    );
    if (!blob || blob.size >= file.size) return file;
    const compressed = new File(
      [blob],
      preservePng ? file.name : replaceExtension(file.name, "jpg"),
      { type: mimeType, lastModified: Date.now() }
    );
    logInfo("media-compression", "Image compressed before upload", {
      originalBytes: file.size,
      compressedBytes: compressed.size,
      width,
      height,
      mimeType,
    });
    return compressed;
  } catch (cause) {
    logError("media-compression", "Image compression skipped", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return file;
  }
}

export async function compressChatVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/") || file.size <= VIDEO_COMPRESS_THRESHOLD)
    return file;

  const startedAt = performance.now();
  logInfo("media-compression", "WebCodecs SDK compression started", {
    originalBytes: file.size,
    targetBitrate: WEB_VIDEO_TARGET_BITRATE,
    maxWidth: 1280,
    maxFps: 30,
  });
  try {
    const result = await compressVideo(
      file,
      {
        targetBitrate: WEB_VIDEO_TARGET_BITRATE,
        maxWidth: 1280,
        maxFps: 30,
      },
      (phase, percent) => {
        logInfo("media-compression", "WebCodecs SDK compression progress", {
          phase,
          percent: Math.round(percent),
          originalBytes: file.size,
        });
      }
    );
    const compressed = new File(
      [result.blob],
      replaceExtension(file.name, "mp4"),
      { type: "video/mp4", lastModified: Date.now() }
    );
    const ratio = file.size ? Number((compressed.size / file.size).toFixed(4)) : 0;
    logInfo("media-compression", "WebCodecs SDK compression finished", {
      originalBytes: file.size,
      compressedBytes: compressed.size,
      compressionRatio: ratio,
      durationMs: result.durationMs,
      elapsedMs: Math.round(performance.now() - startedAt),
      outputMimeType: compressed.type,
    });
    if (!compressed.size || compressed.size >= file.size) {
      logInfo("media-compression", "WebCodecs output not smaller; using original", {
        originalBytes: file.size,
        compressedBytes: compressed.size,
        compressionRatio: ratio,
      });
      return file;
    }
    return compressed;
  } catch (cause) {
    logWarn("media-compression", "WebCodecs SDK unavailable or failed; using original", {
      originalBytes: file.size,
      elapsedMs: Math.round(performance.now() - startedAt),
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return file;
  }
}

export async function prepareChatMedia(file: File, kind: "Image" | "Video") {
  // Video compression is handled once in sendChatMedia.
  return kind === "Image" ? compressChatImage(file) : file;
}
