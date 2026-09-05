import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, ImagePlus, Keyboard, Loader2, X } from "lucide-react";
import { ensureNativeMediaPermissions } from "@/lib/mobile-native";

export default function QrCodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function startCamera() {
    setError("");
    setCameraActive(true);
    try {
      await ensureNativeMediaPermissions({ camera: true });
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        result => {
          if (result) {
            controlsRef.current?.stop();
            onDetected(result.getText());
          }
        }
      );
    } catch (cause) {
      setCameraActive(false);
      setError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "未获得摄像头权限，请上传二维码图片。"
          : "此设备无法启动摄像头，请使用图片或手工输入。"
      );
    }
  }

  async function decodeFile(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      onDetected(result.getText());
    } catch {
      setError("没有识别到有效二维码，请换一张清晰图片。");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.16em] text-teal-600">
              ECHAT SCANNER
            </p>
            <h2 className="mt-1 text-xl font-semibold">扫一扫</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="relative mt-5 aspect-square overflow-hidden rounded-3xl bg-[#071424]">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          {!cameraActive && (
            <div className="absolute inset-0 grid place-items-center text-center text-white">
              <div>
                <Camera className="mx-auto text-teal-300" size={34} />
                <p className="mt-3 text-sm">
                  二维码仅在本机识别，不上传相机画面
                </p>
                <button
                  onClick={startCamera}
                  className="mt-4 rounded-xl bg-teal-400 px-5 py-2.5 text-sm font-semibold text-[#06211e]"
                >
                  打开摄像头
                </button>
              </div>
            </div>
          )}
          {cameraActive && (
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-teal-300 shadow-[0_0_0_999px_rgba(0,0,0,.25)]" />
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm"
          >
            <ImagePlus size={16} />
            上传图片
          </button>
          <button
            onClick={() => manual.trim() && onDetected(manual.trim())}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm"
          >
            <Keyboard size={16} />
            识别输入
          </button>
        </div>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/*"
          onChange={event => {
            decodeFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <textarea
          value={manual}
          onChange={event => setManual(event.target.value)}
          rows={2}
          placeholder="也可以粘贴 E聊二维码内容"
          className="mt-2 w-full resize-none rounded-xl bg-slate-100 px-3 py-2 text-xs outline-none ring-teal-300/50 focus:ring-2"
        />
      </div>
    </div>
  );
}
