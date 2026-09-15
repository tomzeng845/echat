import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, FileText, Loader2, RotateCcw } from "lucide-react";
import type { Message } from "@/lib/echat-api";
import {
  downloadChatMedia,
  directChatMediaUrl,
  directChatHlsUrl,
  directChatThumbnailUrl,
  effectiveMediaMimeType,
  formatFileSize,
  parseMediaPayload,
} from "@/lib/echat-media";
import { error as logError, info as logInfo } from "@/lib/runtime-diagnostics";

export type RenderableMessage = Message & { plaintext: string };

let activeHtmlVideo: HTMLVideoElement | null = null;

function stopAndReleaseHtmlVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
  if (activeHtmlVideo === video) activeHtmlVideo = null;
}

export default function RichMessageContent({
  message,
}: {
  message: RenderableMessage;
}) {
  const payload = parseMediaPayload(message.plaintext);
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [audioKey, setAudioKey] = useState(0);
  const [loadedMedia, setLoadedMedia] = useState({ type: "", size: 0 });
  const [videoRequested, setVideoRequested] = useState(false);
  const [videoFallbackTried, setVideoFallbackTried] = useState(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const supportsNativeHls =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") && "ontouchend" in document));

  useEffect(() => {
    return () => {
      const video = videoElementRef.current;
      if (video) {
        stopAndReleaseHtmlVideo(video);
        logInfo("video-message", "Video stopped because message view unmounted", {
          assetIdSuffix: payload?.assetId?.slice(-8),
        });
      }
    };
  }, [payload?.assetId]);

  useEffect(() => {
    if (
      !payload ||
      message.kind === "File" ||
      message.state === "Recalled" ||
      (message.kind === "Video" && !videoRequested)
    )
      return;
    let active = true;
    let objectUrl = "";
    setError("");
    setPlaybackError("");
    if (message.kind === "Video" && !payload.fileNonce) {
      const mediaUrl = directChatMediaUrl(payload);
      if (mediaUrl) {
        setLoadedMedia({ type: "video/mp4", size: payload.size });
        setUrl(mediaUrl);
        setLoading(false);
        return () => {
          active = false;
          setUrl(current => (current === mediaUrl ? undefined : current));
          stopAndReleaseHtmlVideo(videoElementRef.current);
        };
      }
    }
    setLoading(true);
    downloadChatMedia(message.conversationId, message.keyVersion || 1, payload)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoadedMedia({ type: blob.type, size: blob.size });
        setUrl(objectUrl);
      })
      .catch(
        cause =>
          active &&
          setError(cause instanceof Error ? cause.message : "媒体加载失败")
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      stopAndReleaseHtmlVideo(videoElementRef.current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    message.conversationId,
    message.keyVersion,
    message.kind,
    message.state,
    payload?.assetId,
    payload?.fileNonce,
    payload?.hlsUrl,
    videoRequested,
    videoFallbackTried,
    supportsNativeHls,
  ]);

  if (message.state === "Recalled") return <span>{message.plaintext}</span>;
  if (
    !payload ||
    message.kind === "Text" ||
    message.kind === "Emoji" ||
    message.kind === "System"
  )
    return (
      <span className="whitespace-pre-wrap break-words">
        {message.plaintext.split(/(@[^\s@]+)/g).map((part, index) =>
          part.startsWith("@") ? (
            <strong
              key={`${part}-${index}`}
              className="font-semibold text-amber-600"
            >
              {part}
            </strong>
          ) : (
            <span key={`${part}-${index}`}>{part}</span>
          )
        )}
      </span>
    );
  if (message.kind === "Video" && !videoRequested && !url)
    return (
      <button
        type="button"
        onClick={() => {
          logInfo("video-message", "Video lazy load requested by user", {
            assetIdSuffix: payload.assetId.slice(-8),
            size: payload.size,
            duration: payload.duration,
            platform: Capacitor.getPlatform(),
          });
          setVideoRequested(true);
        }}
        className="flex min-h-24 min-w-56 items-center gap-3 rounded-xl bg-black/70 px-4 py-3 text-left text-white"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-400 text-xl text-slate-950">
          ▶
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">点击加载视频</span>
          <span className="mt-1 block text-[10px] opacity-70">
            {formatFileSize(payload.size)}
            {payload.duration ? ` · ${Math.round(payload.duration)} 秒` : ""}
          </span>
        </span>
      </button>
    );
  if (loading)
    return (
      <div className="flex min-h-20 min-w-40 items-center justify-center gap-2 text-xs opacity-70">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载媒体
      </div>
    );
  if (error) return <div className="text-xs opacity-75">{error}</div>;

  if (message.kind === "Image" && url)
    return (
      <img
        src={url}
        alt={payload.fileName}
        className="max-h-[360px] max-w-full rounded-xl object-contain"
      />
    );
  if (message.kind === "Voice" && url)
    return (
      <div className="min-w-56">
        <audio
          key={audioKey}
          controls
          playsInline
          preload="metadata"
          className="h-10 w-full"
          onLoadedMetadata={event => {
            setPlaybackError("");
            logInfo("voice-message", "Voice message metadata loaded", {
              assetIdSuffix: payload.assetId.slice(-8),
              declaredMimeType: payload.mimeType,
              effectiveMimeType: effectiveMediaMimeType(payload),
              blobMimeType: loadedMedia.type,
              blobSize: loadedMedia.size,
              duration: event.currentTarget.duration,
            });
          }}
          onError={event => {
            const audio = event.currentTarget;
            const code = audio.error?.code || 0;
            const effectiveMime = effectiveMediaMimeType(payload);
            const unsupported = audio.canPlayType(effectiveMime) === "";
            const messageText = unsupported
              ? "当前 iPhone 不支持这条旧版语音格式，请让对方更新后重发"
              : "语音加载失败，请点击重试";
            setPlaybackError(messageText);
            logError("voice-message", "Voice message playback failed", {
              assetIdSuffix: payload.assetId.slice(-8),
              mediaErrorCode: code,
              mediaErrorMessage: audio.error?.message || "",
              networkState: audio.networkState,
              readyState: audio.readyState,
              declaredMimeType: payload.mimeType,
              effectiveMimeType: effectiveMime,
              blobMimeType: loadedMedia.type,
              blobSize: loadedMedia.size,
              canPlayType: audio.canPlayType(effectiveMime),
              userAgent: navigator.userAgent,
            });
          }}
        >
          <source src={url} type={effectiveMediaMimeType(payload)} />
        </audio>
        {playbackError && (
          <button
            type="button"
            onClick={() => {
              setPlaybackError("");
              setAudioKey(current => current + 1);
            }}
            className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-100 underline underline-offset-2"
          >
            <RotateCcw size={11} />
            {playbackError}
          </button>
        )}
        <p className="mt-1 text-[10px] opacity-60">
          {payload.duration ? `${Math.round(payload.duration)} 秒` : "语音消息"}
        </p>
      </div>
    );
  if (message.kind === "Video" && url)
    return (
      <div>
        <video
          ref={videoElementRef}
          controls
          playsInline
          preload="auto"
          poster={directChatThumbnailUrl(payload) || undefined}
          src={url}
          data-echat-video="true"
          onLoadStart={event => {
            const video = event.currentTarget;
            logInfo("video-message", "Video load started", {
              assetIdSuffix: payload.assetId.slice(-8),
              srcType: url.startsWith("blob:") ? "blob" : "http-range-webview",
              readyState: video.readyState,
              networkState: video.networkState,
              duration: video.duration,
            });
          }}
          onLoadedMetadata={event => {
            const video = event.currentTarget;
            logInfo("video-message", "Video metadata loaded", {
              assetIdSuffix: payload.assetId.slice(-8),
              duration: video.duration,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              currentSrcIsBlob: video.currentSrc.startsWith("blob:"),
            });
          }}
          onPlay={event => {
            const video = event.currentTarget;
            if (activeHtmlVideo && activeHtmlVideo !== video) {
              const previousAssetIdSuffix =
                activeHtmlVideo.dataset.assetIdSuffix || "unknown";
              stopAndReleaseHtmlVideo(activeHtmlVideo);
              logInfo("video-message", "Previous HTML video stopped", {
                previousAssetIdSuffix,
                nextAssetIdSuffix: payload.assetId.slice(-8),
              });
            }
            activeHtmlVideo = video;
            video.dataset.assetIdSuffix = payload.assetId.slice(-8);
            const bufferedEnd =
              video.buffered.length > 0
                ? video.buffered.end(video.buffered.length - 1)
                : 0;
            const bufferedSeconds = Math.max(0, bufferedEnd - video.currentTime);
            logInfo("video-message", "Video play requested", {
              assetIdSuffix: payload.assetId.slice(-8),
              bufferedSeconds,
              readyState: video.readyState,
              networkState: video.networkState,
            });
            // Do not pause here. Android WebView may not emit a timely progress
            // event after a programmatic pause, which makes the user tap play
            // repeatedly. Let the native player manage its own buffer.
          }}
          onPause={event => {
            if (activeHtmlVideo === event.currentTarget) activeHtmlVideo = null;
            logInfo("video-message", "Video paused", {
              assetIdSuffix: payload.assetId.slice(-8),
              currentTime: event.currentTarget.currentTime,
            });
          }}
          onEnded={event => {
            if (activeHtmlVideo === event.currentTarget) activeHtmlVideo = null;
            logInfo("video-message", "Video ended", {
              assetIdSuffix: payload.assetId.slice(-8),
            });
          }}
          onProgress={event => {
            const video = event.currentTarget;
            const bufferedEnd =
              video.buffered.length > 0
                ? video.buffered.end(video.buffered.length - 1)
                : 0;
            const bufferedSeconds = Math.max(0, bufferedEnd - video.currentTime);
            logInfo("video-message", "Video network progress", {
              assetIdSuffix: payload.assetId.slice(-8),
              currentTime: video.currentTime,
              bufferedSeconds,
              readyState: video.readyState,
              networkState: video.networkState,
            });
          }}
          onCanPlay={event => {
            setLoading(false);
            const video = event.currentTarget;
            logInfo("video-message", "Video can play", {
              assetIdSuffix: payload.assetId.slice(-8),
              readyState: video.readyState,
              networkState: video.networkState,
            });
          }}
          onWaiting={event => {
            const video = event.currentTarget;
            const bufferedEnd =
              video.buffered.length > 0
                ? video.buffered.end(video.buffered.length - 1)
                : 0;
            logInfo("video-message", "Video playback waiting for buffer", {
              assetIdSuffix: payload.assetId.slice(-8),
              currentTime: video.currentTime,
              bufferedSeconds: Math.max(0, bufferedEnd - video.currentTime),
              readyState: video.readyState,
              networkState: video.networkState,
            });
          }}
          onStalled={event => {
            const video = event.currentTarget;
            logError("video-message", "Video network stalled", {
              assetIdSuffix: payload.assetId.slice(-8),
              currentTime: video.currentTime,
              readyState: video.readyState,
              networkState: video.networkState,
              bufferedSeconds:
                video.buffered.length > 0
                  ? video.buffered.end(video.buffered.length - 1) -
                    video.currentTime
                  : 0,
            });
          }}
          onLoadedData={() =>
            logInfo("video-message", "Video message first frame loaded", {
              assetIdSuffix: payload.assetId.slice(-8),
              blobSize: loadedMedia.size,
              mimeType: effectiveMediaMimeType(payload, "Video"),
            })
          }
          onError={event => {
            const video = event.currentTarget;
            logError("video-message", "Video message playback failed", {
              assetIdSuffix: payload.assetId.slice(-8),
              mediaErrorCode: video.error?.code || 0,
              mediaErrorMessage: video.error?.message || "",
              readyState: video.readyState,
              blobSize: loadedMedia.size,
              mimeType: effectiveMediaMimeType(payload, "Video"),
            });
            if (!videoFallbackTried) {
              setVideoFallbackTried(true);
              if (supportsNativeHls) {
                const fallbackUrl = directChatHlsUrl(payload);
                if (fallbackUrl) {
                  setLoadedMedia({
                    type: "application/vnd.apple.mpegurl",
                    size: 0,
                  });
                  setUrl(fallbackUrl);
                  setPlaybackError("");
                } else setPlaybackError("视频播放失败，请点击重试");
              } else if (payload.fileNonce) {
                setLoading(true);
                void downloadChatMedia(
                  message.conversationId,
                  message.keyVersion || 1,
                  payload
                )
                  .then(blob => {
                    const fallbackUrl = URL.createObjectURL(blob);
                    setLoadedMedia({ type: blob.type, size: blob.size });
                    setUrl(current => {
                      if (current?.startsWith("blob:"))
                        URL.revokeObjectURL(current);
                      return fallbackUrl;
                    });
                    setPlaybackError("");
                  })
                  .catch(cause => {
                    setPlaybackError(
                      cause instanceof Error
                        ? `视频播放失败：${cause.message}`
                        : "视频播放失败，请点击重试"
                    );
                  })
                  .finally(() => setLoading(false));
              } else {
                setPlaybackError("视频播放失败，请检查网络后重试");
              }
            } else {
              setPlaybackError("视频播放失败，请点击重试");
            }
          }}
          className="max-h-[360px] max-w-full rounded-xl bg-black"
        />
        {playbackError && (
          <button
            type="button"
            onClick={() => {
              setPlaybackError("");
              setUrl(undefined);
              setVideoRequested(false);
              setVideoFallbackTried(false);
            }}
            className="mt-1 text-[10px] font-medium text-rose-100 underline underline-offset-2"
          >
            {playbackError}
          </button>
        )}
      </div>
    );

  async function download() {
    if (!payload) return;
    setLoading(true);
    setError("");
    try {
      const blob = await downloadChatMedia(
        message.conversationId,
        message.keyVersion || 1,
        payload
      );
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = payload.fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件下载失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={download}
      className="flex min-w-56 items-center gap-3 text-left"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">
        <FileText size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {payload.fileName}
        </span>
        <span className="mt-0.5 block text-[10px] opacity-60">
          {formatFileSize(payload.size)}
        </span>
      </span>
      <Download size={17} className="shrink-0 opacity-70" />
    </button>
  );
}
