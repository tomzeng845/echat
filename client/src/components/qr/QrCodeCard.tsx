import { QRCodeSVG } from "qrcode.react";
import { RefreshCw } from "lucide-react";

export default function QrCodeCard({ value, label, expiresAt, onRefresh }: { value: string; label: string; expiresAt?: string; onRefresh?: () => void }) {
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const expiryLabel = expiry ? (expiry.getTime() - Date.now() > 24 * 60 * 60 * 1000 ? expiry.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : expiry.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })) : "";
  return <div className="rounded-3xl bg-white p-5 text-center text-slate-900 shadow-xl">
    <div className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-slate-200"><QRCodeSVG value={value} size={220} level="M" marginSize={1} /></div>
    <p className="mt-4 text-sm font-semibold">{label}</p>
    {expiresAt && <p className="mt-1 text-xs text-slate-400">有效至 {expiryLabel}</p>}
    {onRefresh && <button onClick={onRefresh} className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600"><RefreshCw size={14} />刷新二维码</button>}
  </div>;
}
