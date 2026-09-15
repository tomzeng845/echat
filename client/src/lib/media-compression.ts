import { error as logError, info as logInfo } from "./runtime-diagnostics";

const IMAGE_MAX_EDGE = 2560;
const IMAGE_COMPRESS_THRESHOLD = 2 * 1024 * 1024;
const VIDEO_COMPRESS_THRESHOLD = 8 * 1024 * 1024;
type CapturableVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
};

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

function chooseVideoMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

export async function compressChatVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/") || file.size <= VIDEO_COMPRESS_THRESHOLD)
    return file;
  if (typeof MediaRecorder === "undefined") return file;

  const mimeType = chooseVideoMimeType();
  if (!mimeType) return file;

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video") as CapturableVideoElement;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("video metadata timeout")),
        15000
      );
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("video metadata unavailable"));
      };
    });
    if (!video.videoWidth || !video.videoHeight || !video.captureStream)
      return file;

    const scale = Math.min(
      1,
      1280 / Math.max(video.videoWidth, video.videoHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;

    const videoStream = video.captureStream();
    const outputStream = canvas.captureStream(30);
    for (const track of videoStream.getAudioTracks())
      outputStream.addTrack(track);
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: 1_800_000,
      audioBitsPerSecond: 96_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    const recording = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("video compression failed"));
      recorder.onstop = () => {
        // The final dataavailable event may arrive after stop. Defer Blob
        // construction to include the last encoded chunk.
        window.setTimeout(
          () => resolve(new Blob(chunks, { type: mimeType })),
          0
        );
      };
    });

    const draw = () => {
      if (!video.ended && recorder.state === "recording") {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      }
    };
    recorder.start(1000);
    video.onended = () => recorder.stop();
    await video.play();
    draw();
    const blob = await Promise.race([
      recording,
      new Promise<Blob>((_, reject) =>
        window.setTimeout(
          () => {
            if (recorder.state === "recording") recorder.stop();
            reject(new Error("video compression timeout"));
          },
          Math.max(30000, (video.duration || 60) * 1500)
        )
      ),
    ]);
    if (blob.size >= file.size) return file;

    const compressed = new File([blob], replaceExtension(file.name, "webm"), {
      type: mimeType,
      lastModified: Date.now(),
    });
    logInfo("media-compression", "Video compressed before upload", {
      originalBytes: file.size,
      compressedBytes: compressed.size,
      width: canvas.width,
      height: canvas.height,
      duration: video.duration,
      mimeType,
    });
    return compressed;
  } catch (cause) {
    logError("media-compression", "Video compression skipped", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return file;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function prepareChatMedia(file: File, kind: "Image" | "Video") {
  // Video compression is handled once in sendChatMedia. Keeping the picker
  // stage as a pass-through prevents two MediaRecorder pipelines from racing
  // in browsers that expose captureStream only partially.
  return kind === "Image" ? compressChatImage(file) : file;
}
