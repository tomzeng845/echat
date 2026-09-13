import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("built-in avatars", () => {
  it("provides twenty local avatars and uses the first one as fallback", () => {
    const catalog = readFileSync(
      new URL("../client/src/lib/builtin-avatars.ts", import.meta.url),
      "utf8"
    );
    const home = readFileSync(
      new URL("../client/src/pages/Home.tsx", import.meta.url),
      "utf8"
    );
    const profile = readFileSync(
      new URL("../client/src/components/P1ProfilePanel.tsx", import.meta.url),
      "utf8"
    );
    const domain = readFileSync(
      new URL("../Api/Controllers/UsersController.cs", import.meta.url),
      "utf8"
    );

    expect((catalog.match(/id: `builtin-/g) || []).length).toBe(1);
    expect(catalog).toContain("BUILTIN_AVATARS");
    expect(catalog).toContain("DEFAULT_BUILTIN_AVATAR");
    expect(home).toContain("resolveBuiltinAvatar(src)");
    expect(home).toContain("avatarName");
    expect(profile).toContain("选择内置头像");
    expect(profile).toContain("BUILTIN_AVATARS.map");
    expect(domain).toContain("BuiltinAvatarId");
    expect(domain).toContain("builtin-(0[1-9]|1[0-9]|20)");
  });
});
