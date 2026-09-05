import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import QrCodeCard from "./QrCodeCard";
import { api, getDeviceId, setSession, type AuthResponse, type QrLoginStart, type QrLoginState } from "@/lib/echat-api";

export default function QrLoginPanel({ onAuthenticated, onClose }: { onAuthenticated: (session: AuthResponse) => void; onClose: () => void }) {
  const [challenge, setChallenge] = useState<QrLoginStart | null>(null);
  const [state, setState] = useState<QrLoginState["status"]>("Pending");
  const [error, setError] = useState("");

  const create = useCallback(async () => {
    setError(""); setState("Pending");
    try { setChallenge(await api<QrLoginStart>("/api/qr/login/start", { method: "POST", body: JSON.stringify({ deviceName: navigator.userAgent, deviceId: getDeviceId() }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "二维码生成失败"); }
  }, []);

  useEffect(() => { create(); }, [create]);
  useEffect(() => {
    if (!challenge || ["Consumed", "Denied", "Expired"].includes(state)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (document.hidden || cancelled) return;
      try {
        const next = await api<QrLoginState>("/api/qr/login/status", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, token: challenge.pollToken }) });
        if (cancelled) return;
        setState(next.status);
        if (next.status === "Approved") {
          const session = await api<AuthResponse>("/api/qr/login/exchange", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, token: challenge.pollToken }) });
          if (session.accessToken && session.user) { setSession(session); onAuthenticated(session); }
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "状态查询失败"); }
    }, 1800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [challenge, state, onAuthenticated]);

  const labels: Record<string, string> = { Pending: "请使用已登录的 E聊设备扫描", Scanned: "已扫描，请在手机上确认登录", Approved: "确认成功，正在登录", Denied: "本次登录已拒绝", Expired: "二维码已过期", Consumed: "登录成功" };
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[30px] border border-white/10 bg-[#0b1b2b] p-6 text-white shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs tracking-[.16em] text-teal-300">QR SECURE LOGIN</p><h2 className="mt-2 text-xl font-semibold">扫码登录 E聊</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><X size={18} /></button></div><div className="mt-5">{challenge ? <QrCodeCard value={challenge.qrPayload} label="E聊登录二维码" expiresAt={challenge.expiresAtUtc} onRefresh={create} /> : <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-teal-300" /></div>}</div><div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[.06] px-3 py-3 text-xs leading-5 text-slate-300"><ShieldCheck className="mt-0.5 shrink-0 text-teal-300" size={15} /><span>{labels[state]}。二维码不包含密码或登录令牌，且只能使用一次。</span></div>{error && <p className="mt-3 text-xs text-rose-300">{error}</p>}</div></div>;
}
