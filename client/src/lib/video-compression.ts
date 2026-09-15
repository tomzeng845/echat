import { info as logInfo, warn as logWarn } from "./runtime-diagnostics";

const MAX_WIDTH = 1280;
const TARGET_VIDEO_BITS = 1_500_000;
const TARGET_AUDIO_BITS = 128_000;

function isNativeApp() {
  return typeof window !== "undefined" &&
    Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
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
  if (isNativeApp() || typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return file;
  }
  const mimeType = pickMimeType();
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream) return file;
  if (file.size <= 10 * 1024 * 1024) return file;

  const sourceUrl = URL.createObjectURL(file);
  const source = document.createElement("video");
  source.muted = true;
  source.playsInline = true;
  source.src = sourceUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      source.onloadedmetadata = () => resolve();
      source.onerror = () => reject(new Error("视频元数据读取失败"));
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
    const captureStream = (source as HTMLVideoElement & {
      captureStream?: () => MediaStream;
    }).captureStream;
    const sourceStream = captureStream?.call(source);
    if (sourceStream) {
      for (const track of sourceStream.getAudioTracks()) canvasStream.addTrack(track);
    }
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: TARGET_VIDEO_BITS,
      audioBitsPerSecond: TARGET_AUDIO_BITS,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("浏览器视频压缩失败"));
      recorder.onstop = () => resolve();
    });
    recorder.start(1000);
    logInfo("video-compression", "Web video compression started", {
      originalBytes: file.size,
      sourceWidth: source.videoWidth,
      sourceHeight: source.videoHeight,
      targetWidth: width,
      targetHeight: height,
      mimeType,
    });
    await source.play();
    await new Promise<void>(resolve => {
      const draw = () => {
        if (source.ended || source.paused) return resolve();
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
    if (!compressed.size || compressed.size >= file.size) return file;
    const outputName = file.name.replace(/\.[^.]+$/, "") + ".webm";
    logInfo("video-compression", "Web video compression completed", {
      originalBytes: file.size,
      compressedBytes: compressed.size,
      compressionRatio: Number((compressed.size / file.size).toFixed(3)),
    });
    return new File([compressed], outputName, { type: mimeType, lastModified: Date.now() });
  } catch (error) {
    logWarn("video-compression", "Web video compression failed; using original", {
      message: error instanceof Error ? error.message : String(error),
      originalBytes: file.size,
    });
    return file;
  } finally {
    URL.revokeObjectURL(sourceUrl);
    source.remove();
  }
}
