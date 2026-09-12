import { describe, expect, it } from "vitest";
import {
  effectiveMediaMimeType,
  type ChatMediaPayload,
} from "../client/src/lib/echat-media";

function payload(fileName: string, mimeType: string): ChatMediaPayload {
  return {
    assetId: "asset-voice",
    fileName,
    mimeType,
    size: 128,
  };
}

describe("voice message media compatibility", () => {
  it("keeps explicit iOS AAC/MP4 MIME", () => {
    expect(effectiveMediaMimeType(payload("voice.m4a", "audio/mp4"))).toBe(
      "audio/mp4"
    );
  });

  it("repairs missing MIME for legacy WebM/Opus voice messages", () => {
    expect(
      effectiveMediaMimeType(payload("voice.webm", "application/octet-stream"))
    ).toBe("audio/webm;codecs=opus");
  });

  it("repairs missing MIME for M4A and Ogg voice messages", () => {
    expect(effectiveMediaMimeType(payload("voice.m4a", ""))).toBe("audio/mp4");
    expect(effectiveMediaMimeType(payload("voice.ogg", ""))).toBe(
      "audio/ogg;codecs=opus"
    );
  });
});
