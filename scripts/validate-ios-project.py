#!/usr/bin/env python3
from __future__ import annotations

import json
import plistlib
import struct
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "ios" / "App" / "App"
PROJECT = ROOT / "ios" / "App" / "App.xcodeproj" / "project.pbxproj"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_plist(name: str) -> dict:
    with (APP / name).open("rb") as stream:
        return plistlib.load(stream)


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"{path.name} is not a PNG")
    return struct.unpack(">II", data[16:24])


def main() -> int:
    info = load_plist("Info.plist")
    entitlements = load_plist("App.entitlements")
    privacy = load_plist("PrivacyInfo.xcprivacy")
    project = PROJECT.read_text(encoding="utf-8")
    capacitor_config_path = APP / "capacitor.config.json"
    app_delegate = (APP / "AppDelegate.swift").read_text(encoding="utf-8")
    scene_delegate = (APP / "SceneDelegate.swift").read_text(encoding="utf-8")
    storyboard = (APP / "Base.lproj" / "Main.storyboard").read_text(encoding="utf-8")

    require(info["CFBundleDisplayName"] == "E聊", "Unexpected iOS display name")
    require(info["CFBundleIdentifier"] == "$(PRODUCT_BUNDLE_IDENTIFIER)", "Bundle ID must come from Xcode settings")
    require(info["CFBundleShortVersionString"] == "$(MARKETING_VERSION)", "Marketing version is not connected")
    require(info["CFBundleVersion"] == "$(CURRENT_PROJECT_VERSION)", "Build number is not connected")
    require(info.get("NSCameraUsageDescription"), "Camera usage text is missing")
    require(info.get("NSMicrophoneUsageDescription"), "Microphone usage text is missing")
    require(info.get("NSPhotoLibraryUsageDescription"), "Photo library usage text is missing")
    require({"audio", "remote-notification", "voip"}.issubset(set(info.get("UIBackgroundModes", []))), "Required background modes are missing")
    require("ITSAppUsesNonExemptEncryption" not in info, "Export compliance must remain unset until the account holder completes Apple review")
    require(entitlements.get("aps-environment") == "$(APS_ENVIRONMENT)", "APNs entitlement is missing")

    accessed = privacy.get("NSPrivacyAccessedAPITypes", [])
    user_defaults = next((item for item in accessed if item.get("NSPrivacyAccessedAPIType") == "NSPrivacyAccessedAPICategoryUserDefaults"), None)
    require(user_defaults is not None, "UserDefaults privacy declaration is missing")
    require("CA92.1" in user_defaults.get("NSPrivacyAccessedAPITypeReasons", []), "UserDefaults required reason is missing")
    collected = privacy.get("NSPrivacyCollectedDataTypes", [])
    collected_types = {item.get("NSPrivacyCollectedDataType") for item in collected}
    required_collected_types = {
        "NSPrivacyCollectedDataTypeName",
        "NSPrivacyCollectedDataTypePhoneNumber",
        "NSPrivacyCollectedDataTypeCoarseLocation",
        "NSPrivacyCollectedDataTypeContacts",
        "NSPrivacyCollectedDataTypeEmailsOrTextMessages",
        "NSPrivacyCollectedDataTypePhotosorVideos",
        "NSPrivacyCollectedDataTypeAudioData",
        "NSPrivacyCollectedDataTypeOtherUserContent",
        "NSPrivacyCollectedDataTypeCustomerSupport",
        "NSPrivacyCollectedDataTypeUserID",
        "NSPrivacyCollectedDataTypeDeviceID",
        "NSPrivacyCollectedDataTypeOtherUsageData",
        "NSPrivacyCollectedDataTypeOtherDiagnosticData",
    }
    require(required_collected_types.issubset(collected_types), "Privacy collection declarations are incomplete")
    for item in collected:
        require(item.get("NSPrivacyCollectedDataTypeLinked") is True, "EChat collection must be declared as linked to the account")
        require(item.get("NSPrivacyCollectedDataTypeTracking") is False, "EChat does not use collected data for tracking")
        require("NSPrivacyCollectedDataTypePurposeAppFunctionality" in item.get("NSPrivacyCollectedDataTypePurposes", []), "Collected data purpose must include app functionality")

    for value in (
        "App/App.entitlements",
        "PrivacyInfo.xcprivacy in Resources",
        "echat_message.wav in Resources",
        "echat_call.wav in Resources",
        "echat_ringback.wav in Resources",
        "PRODUCT_BUNDLE_IDENTIFIER = com.tomzeng845.echat;",
        "MARKETING_VERSION = 0.9.0;",
        "CURRENT_PROJECT_VERSION = 18;",
        "IPHONEOS_DEPLOYMENT_TARGET = 15.0;",
        "APS_ENVIRONMENT = development;",
        "APS_ENVIRONMENT = production;",
    ):
        require(value in project, f"Xcode project setting/reference missing: {value}")

    if capacitor_config_path.exists():
        capacitor_config = json.loads(capacitor_config_path.read_text(encoding="utf-8"))
        require(capacitor_config.get("appId") == "com.tomzeng845.echat", "Synced Capacitor iOS appId is incorrect")

    require("bridge?.registerPluginInstance(MediaPermissionsPlugin())" in app_delegate, "Custom Capacitor plugin is not registered")
    require("PKPushRegistryDelegate" in app_delegate, "PushKit delegate is missing")
    require("CXProviderDelegate" in app_delegate, "CallKit provider delegate is missing")
    require("capacitorDidRegisterForRemoteNotifications" in app_delegate, "APNs registration bridge is missing")
    require("MyViewController()" in scene_delegate, "SceneDelegate does not instantiate the custom bridge controller")
    require('customClass="MyViewController"' in storyboard, "Storyboard does not reference the custom bridge controller")

    icon_metadata = json.loads((APP / "Assets.xcassets" / "AppIcon.appiconset" / "Contents.json").read_text(encoding="utf-8"))
    icon_name = icon_metadata["images"][0]["filename"]
    require(png_size(APP / "Assets.xcassets" / "AppIcon.appiconset" / icon_name) == (1024, 1024), "App Store icon must be 1024x1024")
    splash_root = APP / "Assets.xcassets" / "Splash.imageset"
    splash_metadata = json.loads((splash_root / "Contents.json").read_text(encoding="utf-8"))
    for image in splash_metadata["images"]:
        splash = splash_root / image["filename"]
        require(splash.is_file(), f"Splash asset is missing: {splash.name}")
        require(splash.stat().st_size < 1_000_000, f"Splash asset exceeds checkpoint limit: {splash.name}")

    for name in ("echat_message.wav", "echat_call.wav", "echat_ringback.wav"):
        path = APP / name
        with wave.open(str(path), "rb") as audio:
            require(audio.getnchannels() in (1, 2), f"{name} has an unsupported channel count")
            require(audio.getsampwidth() == 2, f"{name} must be 16-bit PCM")
            require(audio.getframerate() == 44100, f"{name} must use 44.1 kHz")

    signing_material = [
        path
        for suffix in ("*.p8", "*.p12", "*.mobileprovision", "*.cer", "*.ipa")
        for path in ROOT.rglob(suffix)
        if "node_modules" not in path.parts
    ]
    require(not signing_material, "Apple signing material or IPA must not be stored in the project")
    require((ROOT / "scripts" / "ios-testflight.sh").stat().st_mode & 0o111 != 0, "TestFlight script is not executable")
    require((ROOT / "scripts" / "validate-apple-profile.py").stat().st_mode & 0o111 != 0, "Apple profile validator is not executable")

    print("IOS_STATIC_OK bundle=com.tomzeng845.echat version=0.9.0 build=18 ios_min=15 apns=ready pushkit=ready callkit=ready")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, KeyError, OSError, plistlib.InvalidFileException, json.JSONDecodeError) as error:
        print(f"IOS_STATIC_FAILED: {error}", file=sys.stderr)
        raise SystemExit(1)
