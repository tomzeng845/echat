import { describe, expect, it } from "vitest";
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
});
