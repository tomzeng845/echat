import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";

export default function VoiceRecorderButton({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (blob: Blob, duration: number) => Promise<void> | void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);

  async function toggle() {
    if (recorderRef.current?.state === "recording") { recorderRef.current.stop(); return; }
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        const duration = Math.max(1, (Date.now() - startedRef.current) / 1000);
        const blob = new Blob(chunks, { type: recorder.mimeType });
        stream.getTracks().forEach(track => track.stop());
        setRecording(false); setSeconds(0);
        if (blob.size > 0) await onRecorded(blob, duration);
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
    } catch (cause) {
      toast.error(cause instanceof Error && cause.name === "NotAllowedError" ? "请允许麦克风权限后重试" : "无法启动语音录制");
    }
  }

  return <button type="button" disabled={disabled} onClick={toggle} title={recording ? "停止并发送" : "录制语音"} className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition ${recording ? "bg-rose-100 text-rose-600" : "text-slate-400 hover:bg-white hover:text-teal-600"}`}>{recording ? <><Square size={14} fill="currentColor" /><span>{seconds}s</span></> : <Mic size={17} />}</button>;
}
