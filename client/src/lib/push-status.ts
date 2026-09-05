import type { NativePushState } from "./mobile-native";

export function pushStatusLabel(
  nativeAndroid: boolean,
  state: NativePushState
) {
  if (!nativeAndroid) return "仅 Android APP";
  if (state === "registered") return "已开启";
  if (state === "denied") return "权限已关闭";
  if (state === "unavailable") return "待配置 FCM";
  return "正在连接";
}
