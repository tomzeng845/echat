import { useEffect, useState } from "react";
import { Download, FileText, Loader2, ShieldCheck } from "lucide-react";
import type { Message } from "@/lib/echat-api";
import { downloadDecryptedMedia, formatFileSize, parseMediaPayload } from "@/lib/echat-media";

export type RenderableMessage = Message & { plaintext: string };

export default function RichMessageContent({ message }: { message: RenderableMessage }) {
  const payload = parseMediaPayload(message.plaintext);
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!payload || message.kind === "File" || message.state === "Recalled") return;
    let active = true;
    let objectUrl = "";
    setLoading(true);
    downloadDecryptedMedia(message.conversationId, payload)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(cause => active && setError(cause instanceof Error ? cause.message : "媒体解密失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [message.conversationId, message.kind, message.state, payload?.assetId]);

  if (message.state === "Recalled") return <span>{message.plaintext}</span>;
  if (!payload || message.kind === "Text" || message.kind === "Emoji" || message.kind === "System") return <span className="whitespace-pre-wrap break-words">{message.plaintext}</span>;
  if (loading) return <div className="flex min-h-20 min-w-40 items-center justify-center gap-2 text-xs opacity-70"><Loader2 className="h-4 w-4 animate-spin" />正在解密媒体</div>;
  if (error) return <div className="flex items-center gap-2 text-xs opacity-75"><ShieldCheck size={15} />{error}</div>;

  if (message.kind === "Image" && url) return <img src={url} alt={payload.fileName} className="max-h-[360px] max-w-full rounded-xl object-contain" />;
  if (message.kind === "Voice" && url) return <div className="min-w-56"><audio controls preload="metadata" src={url} className="h-10 w-full" /><p className="mt-1 text-[10px] opacity-60">{payload.duration ? `${Math.round(payload.duration)} 秒 · ` : ""}端到端加密语音</p></div>;
  if (message.kind === "Video" && url) return <video controls playsInline preload="metadata" src={url} className="max-h-[360px] max-w-full rounded-xl bg-black" />;

  async function download() {
    if (!payload) return;
    setLoading(true); setError("");
    try {
      const blob = await downloadDecryptedMedia(message.conversationId, payload);
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = payload.fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "文件下载失败"); }
    finally { setLoading(false); }
  }

  return <button onClick={download} className="flex min-w-56 items-center gap-3 text-left"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20"><FileText size={21} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{payload.fileName}</span><span className="mt-0.5 block text-[10px] opacity-60">{formatFileSize(payload.size)} · 已加密</span></span><Download size={17} className="shrink-0 opacity-70" /></button>;
}
