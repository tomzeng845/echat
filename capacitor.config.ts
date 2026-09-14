import type { CapacitorConfig } from "@capacitor/cli";

const appId = process.env.ECHAT_CAPACITOR_APP_ID?.trim() || "com.echat.app";

const config: CapacitorConfig = {
  appId,
  appName: "E聊",
  webDir: "Api/wwwroot",
  android: {
    backgroundColor: "#071424",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
      hidden: false,
    },
    PushNotifications: {
      presentationOptions: ["alert"],
    },
    JPush: {
      appKey: "b386ba240194e6cf267651a8",
      channel: "default",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_echat",
      iconColor: "#12D6B0",
      sound: "echat_message.wav",
    },
  },
};

export default config;
