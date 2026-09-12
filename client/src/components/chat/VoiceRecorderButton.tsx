import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import {
  cancelNativeVoiceRecording,
  ensureNativeMediaPermissions,
  isNativeIos,
  startNativeVoiceRecording,
  stopNativeVoiceRecording,
} from "@/lib/mobile-native";
import { error as logError, info as logInfo } from "@/lib/runtime-diagnostics";

function supportedRecordingMimeType() {
  const candidates = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("aac")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

function voiceFile(blob: Blob, mimeType: string, extension: string) {
  return new File([blob], `voice-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export default function VoiceRecorderButton({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (blob: Blob, duration: number) => Promise<void> | void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeRecordingRef = useRef(false);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)),
      250
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (nativeRecordingRef.current)
        void cancelNativeVoiceRecording().catch(() => undefined);
    },
    []
  );

  async function deliverRecording(
    blob: Blob,
    duration: number,
    mimeType: string,
    extension: string
  ) {
    if (!blob.size) throw new Error("录音文件为空");
    logInfo("voice-message", "Voice recording completed", {
      duration,
      size: blob.size,
      mimeType,
      extension,
      nativeIos: isNativeIos(),
    });
    await onRecorded(voiceFile(blob, mimeType, extension), duration);
  }

  async function stopNativeRecording() {
    try {
      const result = await stopNativeVoiceRecording();
      nativeRecordingRef.current = false;
      setRecording(false);
      setSeconds(0);
      await deliverRecording(
        result.blob,
        result.duration,
        result.mimeType,
        result.fileExtension
      );
    } catch (cause) {
      nativeRecordingRef.current = false;
      setRecording(false);
      setSeconds(0);
      logError(
        "voice-message",
        "Native iOS voice recording stop failed",
        cause
      );
      toast.error(cause instanceof Error ? cause.message : "语音录音保存失败");
    }
  }

  async function toggle() {
    if (nativeRecordingRef.current) {
      await stopNativeRecording();
      return;
    }
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    if (disabled) return;
    try {
      await ensureNativeMediaPermissions({ microphone: true });
      startedRef.current = Date.now();
      if (isNativeIos()) {
        const started = await startNativeVoiceRecording();
        if (!started) throw new Error("iOS 原生录音未能启动");
        nativeRecordingRef.current = true;
        setRecording(true);
        logInfo("voice-message", "Native iOS AAC recording started", {
          mimeType: "audio/mp4",
        });
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("当前设备不支持麦克风录音");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const requestedMimeType = supportedRecordingMimeType();
      const recorder = requestedMimeType
        ? new MediaRecorder(stream, { mimeType: requestedMimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = event => {
        logError("voice-message", "MediaRecorder error", {
          error: event.error,
          mimeType: recorder.mimeType,
        });
      };
      recorder.onstop = async () => {
        const duration = Math.max(1, (Date.now() - startedRef.current) / 1000);
        const mimeType = recorder.mimeType || requestedMimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setSeconds(0);
        try {
          await deliverRecording(
            blob,
            duration,
            mimeType,
            extensionForMimeType(mimeType)
          );
        } catch (cause) {
          logError("voice-message", "Voice recording upload failed", cause);
          toast.error(
            cause instanceof Error ? cause.message : "语音消息发送失败"
          );
        }
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      logInfo("voice-message", "Web voice recording started", {
        requestedMimeType,
        actualMimeType: recorder.mimeType,
      });
    } catch (cause) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      nativeRecordingRef.current = false;
      setRecording(false);
      setSeconds(0);
      logError("voice-message", "Voice recording start failed", cause);
      toast.error(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "请允许麦克风权限后重试"
          : cause instanceof Error
            ? cause.message
            : "无法启动语音录音"
      );
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      title={recording ? "停止并发送" : "录制语音"}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition ${recording ? "bg-rose-100 text-rose-600" : "text-slate-400 hover:bg-white hover:text-teal-600"}`}
    >
      {recording ? (
        <>
          <Square size={14} fill="currentColor" />
          <span>{seconds}s</span>
        </>
      ) : (
        <Mic size={17} />
      )}
    </button>
  );
}
