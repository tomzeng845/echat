import { Capacitor, registerPlugin } from "@capacitor/core";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { info as logInfo, warn as logWarn } from "./runtime-diagnostics";

const MAX_WIDTH = 1280;
const TARGET_VIDEO_BITS = 1_500_000;
const TARGET_AUDIO_BITS = 128_000;

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

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg() {
  if (ffmpeg?.loaded) return ffmpeg;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;
  ffmpegLoadPromise = (async () => {
    const instance = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    logInfo("video-compression", "FFmpeg WASM loading", { base });
    await instance.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    logInfo("video-compression", "FFmpeg WASM loaded");
    ffmpeg = instance;
    return instance;
  })().catch(error => {
    ffmpegLoadPromise = null;
    throw error;
  });
  return ffmpegLoadPromise;
}

export async function compressVideoForWeb(file: File): Promise<File> {
  if (isNativeApp()) {
    logInfo("video-compression", "Web compression skipped for native app", { platform: Capacitor.getPlatform(), originalBytes: file.size });
    return file;
  }
  if (file.size <= 10 * 1024 * 1024) {
    logInfo("video-compression", "Web compression skipped: file below threshold", { platform: "web", originalBytes: file.size, thresholdBytes: 10 * 1024 * 1024 });
    return file;
  }

  const startedAt = performance.now();
  const inputName = `input-${Date.now()}.mp4`;
  const outputName = `output-${Date.now()}.mp4`;
  try {
    const encoder = await getFfmpeg();
    await encoder.writeFile(inputName, await fetchFile(file));
    logInfo("video-compression", "Web FFmpeg compression started", {
      platform: "web", originalBytes: file.size, targetWidth: MAX_WIDTH,
      targetVideoBitsPerSecond: TARGET_VIDEO_BITS,
      targetAudioBitsPerSecond: TARGET_AUDIO_BITS,
    });
    await encoder.exec([
      "-i", inputName,
      "-vf", "scale=w='if(gt(iw,ih),min(iw,1280),-2)':h='if(gt(iw,ih),-2,min(ih,1280))'",
      "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1500k",
      "-maxrate", "1800k", "-bufsize", "3000k",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", outputName,
    ]);
    const output = await encoder.readFile(outputName);
    const bytes = typeof output === "string" ? new TextEncoder().encode(output) : output;
    const compressed = new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
    await encoder.deleteFile(inputName).catch(() => undefined);
    await encoder.deleteFile(outputName).catch(() => undefined);
    if (!compressed.size) {
      logWarn("video-compression", "FFmpeg WASM returned empty output; using original", { platform: "web", originalBytes: file.size });
      return file;
    }
    if (compressed.size >= file.size) {
      logWarn("video-compression", "Web compression output was not smaller; using original", {
        platform: "web",
        originalBytes: file.size,
        compressedBytes: compressed.size,
        compressionRatio: Number((compressed.size / file.size).toFixed(4)),
      });
      return file;
    }
    const outputFileName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    logInfo("video-compression", "Web FFmpeg compression completed", {
      platform: "web",
      originalBytes: file.size,
      compressedBytes: compressed.size,
      compressionRatio: Number((compressed.size / file.size).toFixed(3)),
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return new File([compressed], outputFileName, { type: "video/mp4", lastModified: Date.now() });
  } catch (error) {
    logWarn("video-compression", "Web FFmpeg compression failed; using original", {
      platform: "web",
      reason: error instanceof Error ? error.message : String(error),
      originalBytes: file.size,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return file;
  }
}
