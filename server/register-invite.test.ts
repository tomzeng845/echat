import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("registration invite code", () => {
  const home = readFileSync(
    new URL("../client/src/pages/Home.tsx", import.meta.url),
    "utf8"
  );

  it("starts empty and does not expose a built-in invitation code", () => {
    expect(home).toContain('const [inviteCode, setInviteCode] = useState("")');
    expect(home).toContain('placeholder="输入邀请码"');
    expect(home).toContain('autoComplete="off"');
    expect(home).not.toContain('useState("ECHAT2026")');
    expect(home).not.toContain("本地预览邀请码");
  });
});
