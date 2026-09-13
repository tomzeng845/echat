import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversation menu", () => {
  it("does not render the removed conversation settings action", () => {
    const home = readFileSync(
      new URL("../client/src/pages/Home.tsx", import.meta.url),
      "utf8"
    );
    expect(home).not.toContain("会话设置");
    expect(home).not.toContain("会话设置即将开放");
    expect(home).toContain("清空聊天记录");
    expect(home).toContain("好友资料");
  });
});
