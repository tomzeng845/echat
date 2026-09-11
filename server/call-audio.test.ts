import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adaptiveBitrate,
  classifyNetworkQuality,
  defaultSpeakerForCallMode,
  preferredAudioConstraints,
  shouldCloseCallFromNativeClear,
  shouldPlayOutgoingRingback,
  toggledSpeakerState,
} from "../client/src/lib/call-audio";

describe("Android call audio routing", () => {
  it("uses the earpiece for voice and video by default", () => {
    expect(defaultSpeakerForCallMode("audio")).toBe(false);
    expect(defaultSpeakerForCallMode("video")).toBe(false);
  });

  it("toggles the visible speaker control state", () => {
    expect(toggledSpeakerState(false)).toBe(true);
    expect(toggledSpeakerState(true)).toBe(false);
  });

  it("does not hang up a call when native code only clears its incoming notification", () => {
    expect(shouldCloseCallFromNativeClear("incoming")).toBe(true);
    expect(shouldCloseCallFromNativeClear("answering")).toBe(false);
    expect(shouldCloseCallFromNativeClear("connected")).toBe(false);
    expect(shouldCloseCallFromNativeClear("calling")).toBe(false);
  });

  it("ends the local call when native cleanup represents a remote hangup", () => {
    expect(shouldCloseCallFromNativeClear("calling", "ended")).toBe(true);
    expect(shouldCloseCallFromNativeClear("connected", "rejected")).toBe(true);
    expect(shouldCloseCallFromNativeClear("calling", "accepted")).toBe(false);
    expect(shouldCloseCallFromNativeClear("calling", "answering")).toBe(false);
  });

  it("plays ringback only while waiting for the peer to answer", () => {
    expect(shouldPlayOutgoingRingback("calling")).toBe(true);
    expect(shouldPlayOutgoingRingback("incoming")).toBe(false);
    expect(shouldPlayOutgoingRingback("answering")).toBe(false);
    expect(shouldPlayOutgoingRingback("connected")).toBe(false);
  });

  it("requests browser hardware echo cancellation, noise suppression and AGC", () => {
    const constraints = preferredAudioConstraints();
    expect(constraints.echoCancellation).toEqual({ ideal: true });
    expect(constraints.noiseSuppression).toEqual({ ideal: true });
    expect(constraints.autoGainControl).toEqual({ ideal: true });
  });

  it("lowers bitrate when loss, jitter or RTT become severe", () => {
    expect(classifyNetworkQuality(1, 999, 0.01, 0.05)).toBe("excellent");
    expect(classifyNetworkQuality(80, 920, 0.09, 0.5)).toBe("degraded");
    expect(classifyNetworkQuality(150, 850, 0.3, 1.1)).toBe("poor");
    expect(adaptiveBitrate("poor", true).maxBitrate).toBeLessThan(
      adaptiveBitrate("good", true).maxBitrate
    );
    expect(adaptiveBitrate("poor", false).maxBitrate).toBe(16_000);
  });

  it("does not feed remote playback events back into native route changes", () => {
    const source = readFileSync(
      new URL("../client/src/components/chat/CallManager.tsx", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain("echat-remote-audio-playback");
    expect(source).not.toContain("audioRouteTimers");
    expect(source).not.toContain("refreshAudioSession");
    expect(source).toContain("element.paused ||");
  });

  it("restores the native call session after stopping a ringtone", () => {
    const source = readFileSync(
      new URL("../ios/App/App/AppDelegate.swift", import.meta.url),
      "utf8"
    );
    expect(source).toContain('reassertAudioSession(reason: "alert-stopped")');
    expect(source).toContain("var callAudioSessionRequested = false");
    expect(source).toContain("callAudioSessionRequested = true");
  });

  it("routes iOS calls through one native WebRTC audio owner", () => {
    const callManager = readFileSync(
      new URL("../client/src/components/chat/CallManager.tsx", import.meta.url),
      "utf8"
    );
    const nativePlugin = readFileSync(
      new URL("../ios/App/App/NativeWebRTCPlugin.swift", import.meta.url),
      "utf8"
    );
    expect(callManager).toContain("shouldUseNativeIosWebRTC()");
    expect(callManager).toContain("startNativeIosWebRTC");
    expect(callManager).toContain("setNativeRtcRemoteDescription");
    expect(nativePlugin).toContain("rtcAudioSession.useManualAudio = true");
    expect(nativePlugin).toContain("rtcAudioSession.isAudioEnabled = false");
    expect(nativePlugin).toContain("audioSessionDidActivate");
    expect(nativePlugin).toContain("LKRTCPeerConnectionFactory");
    expect(nativePlugin).toContain("rtcSession.lockForConfiguration()");
    expect(nativePlugin).toContain(
      "try rtcSession.setConfiguration(configuration, active: true)"
    );
    expect(nativePlugin).toContain("try rtcAudioSession.setActive(false)");
    expect(nativePlugin).toContain("native-webrtc-remote-audio-track");
    expect(nativePlugin).toContain("native-webrtc-audio-stats");
    expect(nativePlugin).not.toContain(
      "try AVAudioSession.sharedInstance().setActive("
    );
  });

  it("waits for native WebRTC teardown and avoids a second audio-session deactivation", () => {
    const callManager = readFileSync(
      new URL("../client/src/components/chat/CallManager.tsx", import.meta.url),
      "utf8"
    );
    const nativePlugin = readFileSync(
      new URL("../ios/App/App/NativeWebRTCPlugin.swift", import.meta.url),
      "utf8"
    );
    expect(callManager).toContain(
      "const finishedNativeRtc = nativeRtcActive.current"
    );
    expect(callManager).toContain("if (!finishedNativeRtc)");
    expect(nativePlugin).toContain("self.closeLocked(deactivateSession: true)");
    expect(nativePlugin).toContain("completion?()");
  });

  it("uses the pure WebRTC binary without the LiveKit Room or Rust runtime", () => {
    const packageManifest = readFileSync(
      new URL("../ios/App/CapApp-SPM/Package.swift", import.meta.url),
      "utf8"
    );
    expect(packageManifest).toContain("livekit/webrtc-xcframework.git");
    expect(packageManifest).toContain('product(name: "LiveKitWebRTC"');
    expect(packageManifest).not.toContain("client-sdk-swift");
    expect(packageManifest).not.toContain("RustLiveKitUniFFI");
  });
});
