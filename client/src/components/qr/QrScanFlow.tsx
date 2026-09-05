import { useState } from "react";
import { Check, ShieldCheck, UserPlus, X } from "lucide-react";
import { api, type ContactQrPreview, type QrLoginScan } from "@/lib/echat-api";
import QrCodeScanner from "./QrCodeScanner";

export default function QrScanFlow({ onClose, onFriendRequested }: { onClose: () => void; onFriendRequested: () => void }) {
  const [scanning, setScanning] = useState(true);
  const [login, setLogin] = useState<{ challengeId: string; token: string; info: QrLoginScan } | null>(null);
  const [contact, setContact] = useState<{ token: string; info: ContactQrPreview } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function detected(value: string) {
    setScanning(false); setError(""); setBusy(true);
    try {
      const loginMatch = /^echat:\/\/login\/([a-f0-9]{32})\/([A-Za-z0-9_-]{40,})$/i.exec(value);
      if (loginMatch) {
        const info = await api<QrLoginScan>("/api/qr/login/scan", { method: "POST", body: JSON.stringify({ challengeId: loginMatch[1], token: loginMatch[2] }) });
        setLogin({ challengeId: loginMatch[1], token: loginMatch[2], info }); return;
      }
      const contactMatch = /^echat:\/\/contact\/([A-Za-z0-9_-]{40,})$/i.exec(value);
      if (contactMatch) {
        const info = await api<ContactQrPreview>("/api/qr/contact/preview", { method: "POST", body: JSON.stringify({ token: contactMatch[1] }) });
        setContact({ token: contactMatch[1], info }); return;
      }
      throw new Error("这不是有效的 E聊二维码");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "二维码处理失败"); }
    finally { setBusy(false); }
  }

  async function decideLogin(approve: boolean) {
    if (!login) return; setBusy(true);
    try { await api<void>("/api/qr/login/approve", { method: "POST", body: JSON.stringify({ challengeId: login.challengeId, scanToken: login.token, approve }) }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "确认失败"); }
    finally { setBusy(false); }
  }

  async function addContact() {
    if (!contact) return; setBusy(true);
    try { await api("/api/qr/contact/redeem", { method: "POST", body: JSON.stringify({ token: contact.token }) }); onFriendRequested(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "好友申请发送失败"); }
    finally { setBusy(false); }
  }

  if (scanning) return <QrCodeScanner onDetected={detected} onClose={onClose} />;
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs tracking-[.16em] text-teal-600">SCAN RESULT</p><h2 className="mt-1 text-xl font-semibold">{login ? "确认登录" : contact ? "添加好友" : "无法识别"}</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X size={18} /></button></div>{busy && !login && !contact ? <div className="py-16 text-center text-sm text-slate-400">正在安全解析…</div> : login ? <div className="mt-6"><div className="rounded-2xl bg-[#0a1b2b] p-5 text-white"><ShieldCheck className="text-teal-300" /><p className="mt-4 text-sm font-semibold">请求设备</p><p className="mt-1 break-words text-xs leading-5 text-slate-400">{login.info.requestDeviceName}</p><p className="mt-4 text-xs text-teal-300">校验码 {login.info.verificationCode}</p></div><p className="mt-4 text-xs leading-5 text-slate-500">只有确认后，新设备才能登录。若不是你本人操作，请选择拒绝。</p><div className="mt-5 grid grid-cols-2 gap-2"><button disabled={busy} onClick={() => decideLogin(false)} className="rounded-xl bg-slate-100 py-3 text-sm">拒绝</button><button disabled={busy} onClick={() => decideLogin(true)} className="flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-sm font-semibold text-white"><Check size={16} />确认登录</button></div></div> : contact ? <div className="mt-6"><div className="rounded-2xl bg-slate-100 p-5 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 text-lg font-semibold text-white">{Array.from(contact.info.user.displayName).slice(-2).join("")}</div><p className="mt-3 font-semibold">{contact.info.user.displayName}</p><p className="mt-1 text-xs text-slate-400">E聊号：{contact.info.user.account}</p></div><button disabled={busy} onClick={addContact} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white"><UserPlus size={16} />发送好友申请</button></div> : null}{error && <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}{error && <button onClick={() => { setScanning(true); setError(""); }} className="mt-3 w-full rounded-xl bg-slate-100 py-3 text-sm">重新扫描</button>}</div></div>;
}
