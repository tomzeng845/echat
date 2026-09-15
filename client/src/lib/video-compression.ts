import { Capacitor, registerPlugin } from "@capacitor/core";
import { info as logInfo, warn as logWarn } from "./runtime-diagnostics";
import { compressChatVideo } from "./media-compression";

type NativeVideoCompressor = {
  pickAndCompressVideo(): Promise<{
    path: string;
    fileName: string;
    mimeType: string;
    size: number;
    durationMs: number;
  }>;
};

const nativeVideoCompressor = registerPlugin<NativeVideoCompressor>("NativeVideoCompressor");

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

function isChromeOrEdgeBrowser() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  const userAgent = navigator.userAgent;
  const isEdge = /Edg\//i.test(userAgent);
  const isChrome = /Chrome\//i.test(userAgent) && !/OPR\//i.test(userAgent);
  return isEdge || isChrome;
}

export async function pickAndCompressVideoForPlatform(): Promise<File | null> {
  const platform = Capacitor.getPlatform();
  const native = isNativeApp();
  logInfo("video-compression", "Native video compression requested", {
    platform,
    nativePlatform: native,
    pluginName: "NativeVideoCompressor",
  });
  if (!native || (platform !== "android" && platform !== "ios")) {
    logInfo("video-compression", "Native compression not applicable; using web picker", { platform, nativePlatform: native });
    return null;
  }
  const startedAt = performance.now();
  try {
    const result = await nativeVideoCompressor.pickAndCompressVideo();
    logInfo("video-compression", "Native video bridge returned", {
      platform,
      fileName: result.fileName,
      nativeOutputBytes: result.size,
      nativeDurationMs: result.durationMs,
    });
    const response = await fetch(Capacitor.convertFileSrc(result.path));
    if (!response.ok) throw new Error(`原生压缩文件读取失败 (${response.status})`);
    const blob = await response.blob();
    const file = new File([blob], result.fileName, {
      type: result.mimeType,
      lastModified: Date.now(),
    });
    logInfo("video-compression", "Native video compression completed", {
      platform,
      elapsedMs: Math.round(performance.now() - startedAt),
      sourceBytes: result.size,
      outputBytes: file.size,
      nativeDurationMs: result.durationMs,
    });
    return file;
  } catch (error) {
    logWarn("video-compression", "Native video compression failed; caller may use picker fallback", {
      platform,
      elapsedMs: Math.round(performance.now() - startedAt),
      reason: error instanceof Error ? error.message : String(error),
      errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : "",
    });
    return null;
  }
}

export async function compressVideoForWeb(file: File): Promise<File> {
  const platform = Capacitor.getPlatform();
  if (isNativeApp()) {
    logInfo("video-compression", "Web compression skipped for native app", {
      platform,
      strategy: "native-compressor",
      originalBytes: file.size,
    });
    return file;
  }
  if (!isChromeOrEdgeBrowser()) {
    logInfo("video-compression", "Web compression skipped: browser uses direct upload", {
      platform: "web",
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      originalBytes: file.size,
      strategy: "direct-upload",
    });
    return file;
  }
  if (file.size <= 8 * 1024 * 1024) {
    logInfo("video-compression", "Web compression skipped: file below threshold", {
      platform: "web",
      strategy: "media-recorder",
      originalBytes: file.size,
      thresholdBytes: 8 * 1024 * 1024,
    });
    return file;
  }

  const startedAt = performance.now();
  logInfo("video-compression", "MediaRecorder compression started", {
    platform: "web",
    browser: /Edg\//i.test(navigator.userAgent) ? "edge" : "chrome",
    originalBytes: file.size,
    targetWidth: 1280,
    targetVideoBitsPerSecond: 1_800_000,
    targetAudioBitsPerSecond: 96_000,
  });
  try {
    const compressed = await compressChatVideo(file);
    logInfo("video-compression", "MediaRecorder compression finished", {
      platform: "web",
      originalBytes: file.size,
      compressedBytes: compressed.size,
      compressionRatio: file.size ? Number((compressed.size / file.size).toFixed(4)) : 0,
      usedOriginal: compressed === file,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return compressed;
  } catch (error) {
    logWarn("video-compression", "MediaRecorder compression failed; using original", {
      platform: "web",
      originalBytes: file.size,
      elapsedMs: Math.round(performance.now() - startedAt),
      reason: error instanceof Error ? error.message : String(error),
    });
    return file;
  }
}

export function getVideoCompressionStrategy() {
  if (isNativeApp()) return "native-compressor" as const;
  return isChromeOrEdgeBrowser() ? "media-recorder" as const : "direct-upload" as const;
}
