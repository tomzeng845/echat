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
  },
};

export default config;
