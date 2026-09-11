import { readFileSync, writeFileSync } from "node:fs";

const packagePath = "ios/App/CapApp-SPM/Package.swift";
let source = readFileSync(packagePath, "utf8");

const packageLine =
  '        .package(url: "https://github.com/livekit/webrtc-xcframework.git", exact: "150.7871.02"),';
const productLine =
  '                .product(name: "LiveKitWebRTC", package: "webrtc-xcframework")';

if (!source.includes("github.com/livekit/webrtc-xcframework.git")) {
  source = source.replace(
    '        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1"),',
    `        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1"),\n${packageLine}`
  );
}

if (!source.includes(productLine.trim())) {
  source = source.replace(
    '                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications")',
    `                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),\n${productLine}`
  );
}

writeFileSync(packagePath, source);
console.log("Native iOS WebRTC XCFramework dependency ensured.");
