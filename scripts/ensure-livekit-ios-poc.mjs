import { readFileSync, writeFileSync } from "node:fs";

const packagePath = "ios/App/CapApp-SPM/Package.swift";
let source = readFileSync(packagePath, "utf8");

if (!source.includes("github.com/livekit/client-sdk-swift.git")) {
  source = source.replace(
    '        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1"),',
    '        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1"),\n        .package(url: "https://github.com/livekit/client-sdk-swift.git", from: "2.0.0"),'
  );
}

if (
  !source.includes('.product(name: "LiveKit", package: "client-sdk-swift")')
) {
  source = source.replace(
    '                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications")',
    '                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),\n                .product(name: "LiveKit", package: "client-sdk-swift")'
  );
}

writeFileSync(packagePath, source);
console.log("LiveKit iOS POC Swift package dependency ensured.");
