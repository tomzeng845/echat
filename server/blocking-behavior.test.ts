import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("blocked conversation behavior", () => {
  it("keeps the friendship record while blocking direct messages and calls", () => {
    const contacts = readFileSync(
      new URL("../Api/Controllers/ContactsController.cs", import.meta.url),
      "utf8"
    );
    const conversations = readFileSync(
      new URL("../Api/Controllers/ConversationsController.cs", import.meta.url),
      "utf8"
    );
    const hub = readFileSync(
      new URL("../Api/ChatHub.cs", import.meta.url),
      "utf8"
    );
    const home = readFileSync(
      new URL("../client/src/pages/Home.tsx", import.meta.url),
      "utf8"
    );

    expect(contacts).toContain("Status = RelationStatus.Blocked");
    expect(contacts).toContain("Status = RelationStatus.Friend");
    expect(conversations).toContain("该会话已被拉黑，无法发送消息或发起通话");
    expect(hub).toContain("CONVERSATION_BLOCKED");
    expect(home).toContain("该会话已被拉黑");
    expect(home).toContain("解除拉黑");
    expect(home).toContain("无法进行语音通话");
    expect(home).toContain("无法进行视频通话");
    expect(home).not.toContain("disabled={blockedConversation}");
  });
});
