import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { authorizedFetch } from "@/lib/echat-api";

export default function AuthenticatedMedia({ src, type, alt = "" }: { src: string; type: "image" | "video" | "audio"; alt?: string }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    authorizedFetch(src).then(response => {
      if (!response.ok) throw new Error("媒体加载失败");
      return response.blob();
    }).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => active && setFailed(true));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  if (failed) return <div className="grid min-h-32 place-items-center rounded-xl bg-slate-100 text-xs text-slate-400">媒体暂时无法加载</div>;
  if (!url) return <div className="grid min-h-32 place-items-center rounded-xl bg-slate-100"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  if (type === "video") return <video controls playsInline preload="metadata" src={url} className="h-full w-full rounded-xl bg-black object-cover" />;
  if (type === "audio") return <audio controls preload="metadata" src={url} className="w-full" />;
  return <img src={url} alt={alt} loading="lazy" className="h-full w-full rounded-xl object-cover" />;
}
