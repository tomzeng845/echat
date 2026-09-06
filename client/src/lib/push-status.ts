import type { NativePushState } from "./mobile-native";

export function canInitializeNativePush(
  serverEnabled: boolean,
  firebaseConfigured: boolean
) {
  return serverEnabled && firebaseConfigured;
}

export function pushStatusLabel(
  nativeMobile: boolean,
  state: NativePushState,
  platform: "android" | "ios" = "android"
) {
  if (!nativeMobile) return "仅移动 APP";
  if (state === "registered") return "已开启";
  if (state === "local") return "后台通知已开启";
  if (state === "denied") return "权限已关闭";
  if (state === "unavailable")
    return platform === "ios" ? "待配置 APNs" : "待配置 FCM";
  return "正在连接";
}
