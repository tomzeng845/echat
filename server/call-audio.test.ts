import { describe, expect, it } from "vitest";
import {
  defaultSpeakerForCallMode,
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
});
