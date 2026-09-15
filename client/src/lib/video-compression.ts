import { Capacitor, registerPlugin } from "@capacitor/core";
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

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ].find(type => MediaRecorder.isTypeSupported(type)) || "";
}

export async function compressVideoForWeb(file: File): Promise<File> {
  if (isNativeApp()) {
    logInfo("video-compression", "Web compression skipped for native app", { platform: Capacitor.getPlatform(), originalBytes: file.size });
    return file;
  }
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    logWarn("video-compression", "Web compression skipped: MediaRecorder unavailable", { platform: "web", originalBytes: file.size });
    return file;
  }
  const mimeType = pickMimeType();
  if (!mimeType) {
    logWarn("video-compression", "Web compression skipped: no supported MediaRecorder MIME type", { platform: "web", originalBytes: file.size });
    return file;
  }
  if (!HTMLCanvasElement.prototype.captureStream) {
    logWarn("video-compression", "Web compression skipped: canvas.captureStream unavailable", { platform: "web", originalBytes: file.size });
    return file;
  }
  if (file.size <= 10 * 1024 * 1024) {
    logInfo("video-compression", "Web compression skipped: file below threshold", { platform: "web", originalBytes: file.size, thresholdBytes: 10 * 1024 * 1024 });
    return file;
  }

  const sourceUrl = URL.createObjectURL(file);
  const source = document.createElement("video");
  let activeRecorder: MediaRecorder | null = null;
  source.muted = true;
  source.playsInline = true;
  source.preload = "metadata";
  source.src = sourceUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("视频元数据读取超时")), 15_000);
      source.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      source.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("视频元数据读取失败"));
      };
    });
    const scale = Math.min(1, MAX_WIDTH / Math.max(source.videoWidth, 1));
    const width = Math.max(2, Math.round(source.videoWidth * scale / 2) * 2);
    const height = Math.max(2, Math.round(source.videoHeight * scale / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    const canvasStream = canvas.captureStream(30);
    const captureStream = (source as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    const sourceStream = captureStream?.call(source);
    sourceStream?.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: TARGET_VIDEO_BITS,
      audioBitsPerSecond: TARGET_AUDIO_BITS,
    });
    activeRecorder = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("浏览器视频压缩失败"));
      recorder.onstop = () => resolve();
    });
    recorder.start(1000);
    logInfo("video-compression", "Web video compression started", {
      platform: "web",
      originalBytes: file.size,
      sourceWidth: source.videoWidth,
      sourceHeight: source.videoHeight,
      targetWidth: width,
      targetHeight: height,
      mimeType,
    });
    await source.play();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("视频压缩超时，已回退原文件")), Math.max(30_000, (source.duration || 60) * 1_500));
      const finish = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      source.onended = finish;
      const draw = () => {
        if (source.ended) return finish();
        if (source.paused) return reject(new Error("视频播放未正常推进，已回退原文件"));
        context.drawImage(source, 0, 0, width, height);
        requestAnimationFrame(draw);
      };
      draw();
    });
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    canvasStream.getTracks().forEach(track => track.stop());
    sourceStream?.getTracks().forEach(track => track.stop());
    const compressed = new Blob(chunks, { type: mimeType });
    if (!compressed.size) {
      logWarn("video-compression", "Web compression returned empty output; using original", { platform: "web", originalBytes: file.size });
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
    const outputName = file.name.replace(/\.[^.]+$/, "") + ".webm";
    logInfo("video-compression", "Web video compression completed", {
      platform: "web",
      originalBytes: file.size,
      compressedBytes: compressed.size,
      compressionRatio: Number((compressed.size / file.size).toFixed(3)),
    });
    return new File([compressed], outputName, { type: mimeType, lastModified: Date.now() });
  } catch (error) {
    logWarn("video-compression", "Web video compression failed; using original", {
      platform: "web",
      reason: error instanceof Error ? error.message : String(error),
      originalBytes: file.size,
    });
    return file;
  } finally {
    if (activeRecorder && activeRecorder.state !== "inactive") activeRecorder.stop();
    URL.revokeObjectURL(sourceUrl);
    source.remove();
  }
}
