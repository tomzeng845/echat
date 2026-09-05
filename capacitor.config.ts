import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.echat.app",
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
    LocalNotifications: {
      smallIcon: "ic_stat_echat",
      iconColor: "#12D6B0",
      sound: "echat_message.wav",
    },
  },
};

export default config;
