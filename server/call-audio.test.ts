import { describe, expect, it } from "vitest";
import {
  defaultSpeakerForCallMode,
  shouldCloseCallFromNativeClear,
  shouldPlayOutgoingRingback,
  toggledSpeakerState,
} from "../client/src/lib/call-audio";

describe("Android call audio routing", () => {
  it("uses the earpiece for voice and speaker for video by default", () => {
    expect(defaultSpeakerForCallMode("audio")).toBe(false);
    expect(defaultSpeakerForCallMode("video")).toBe(true);
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

  it("plays ringback only while waiting for the peer to answer", () => {
    expect(shouldPlayOutgoingRingback("calling")).toBe(true);
    expect(shouldPlayOutgoingRingback("incoming")).toBe(false);
    expect(shouldPlayOutgoingRingback("answering")).toBe(false);
    expect(shouldPlayOutgoingRingback("connected")).toBe(false);
  });
});
