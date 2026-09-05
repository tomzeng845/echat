import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api, type ContactQr, type User } from "@/lib/echat-api";
import QrCodeCard from "./QrCodeCard";

export default function MyContactQrDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [value, setValue] = useState<ContactQr | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); try { setValue(await api<ContactQr>("/api/qr/contact/create", { method: "POST" })); } catch (cause) { setError(cause instanceof Error ? cause.message : "名片生成失败"); } }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[30px] bg-[#0b1b2b] p-6 text-white shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs tracking-[.16em] text-teal-300">MY ECHAT QR</p><h2 className="mt-1 text-xl font-semibold">{user.displayName} 的名片</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><X size={18} /></button></div><div className="mt-5">{value ? <QrCodeCard value={value.qrPayload} label={`E聊号：${user.account}`} expiresAt={value.expiresAtUtc} onRefresh={load} /> : <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-teal-300" /></div>}</div><p className="mt-4 text-center text-xs leading-5 text-slate-400">对方扫描后会先看到你的公开名片，再决定是否发送好友申请。</p>{error && <p className="mt-3 text-xs text-rose-300">{error}</p>}</div></div>;
}
