import { useEffect, useState } from "react";
import { Download, FileText, Loader2, RotateCcw } from "lucide-react";
import type { Message } from "@/lib/echat-api";
import {
  downloadChatMedia,
  directChatHlsUrl,
  directChatThumbnailUrl,
  effectiveMediaMimeType,
  formatFileSize,
  parseMediaPayload,
} from "@/lib/echat-media";
import { error as logError, info as logInfo } from "@/lib/runtime-diagnostics";

export type RenderableMessage = Message & { plaintext: string };

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
    if (message.kind === "Video" && payload.hlsUrl && !videoFallbackTried) {
      const hlsUrl = directChatHlsUrl(payload);
      if (hlsUrl) {
        setLoadedMedia({ type: "application/vnd.apple.mpegurl", size: 0 });
        setUrl(hlsUrl);
        setLoading(false);
        return () => {
          active = false;
          setUrl(current => (current === hlsUrl ? undefined : current));
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
        onClick={() => setVideoRequested(true)}
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
          controls
          playsInline
          preload="auto"
          poster={directChatThumbnailUrl(payload) || undefined}
          src={url}
          onLoadStart={event => {
            const video = event.currentTarget;
            logInfo("video-message", "Video load started", {
              assetIdSuffix: payload.assetId.slice(-8),
              srcType: url.startsWith("blob:") ? "blob" : "http-range",
              readyState: video.readyState,
              networkState: video.networkState,
              duration: video.duration,
            });
          }}
          onProgress={event => {
            const video = event.currentTarget;
            const bufferedEnd =
              video.buffered.length > 0
                ? video.buffered.end(video.buffered.length - 1)
                : 0;
            logInfo("video-message", "Video network progress", {
              assetIdSuffix: payload.assetId.slice(-8),
              currentTime: video.currentTime,
              bufferedSeconds: Math.max(0, bufferedEnd - video.currentTime),
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
