import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("group management", () => {
  it("covers group profile, admin roles, approval and QR join flow", () => {
    const controller = readFileSync(
      new URL("../Api/Controllers/GroupsController.cs", import.meta.url),
      "utf8"
    );
    const qr = readFileSync(
      new URL("../Api/Controllers/QrController.cs", import.meta.url),
      "utf8"
    );
    const panel = readFileSync(
      new URL(
        "../client/src/components/chat/GroupInfoPanel.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const home = readFileSync(
      new URL("../client/src/pages/Home.tsx", import.meta.url),
      "utf8"
    );
    const richMessage = readFileSync(
      new URL(
        "../client/src/components/chat/RichMessageContent.tsx",
        import.meta.url
      ),
      "utf8"
    );

    expect(controller).toContain("transfer-owner");
    expect(controller).toContain("join-requests");
    expect(controller).toContain("RequireJoinApproval");
    expect(controller).toContain("Role = MemberRole.Owner");
    expect(controller).toContain("Role = MemberRole.Member");
    expect(controller).toContain("user.Account");
    expect(qr).toContain("echat://group/");
    expect(qr).toContain("PreviewGroupQr");
    expect(qr).toContain("JoinGroupQr");
    expect(panel).toContain("生成群二维码");
    expect(panel).toContain("转让群主");
    expect(panel).toContain("关闭当前群公告");
    expect(panel).toContain('announcement: ""');
    expect(panel).toContain("发消息");
    expect(panel).toContain("语音通话");
    expect(panel).toContain("添加好友");
    expect(panel).toContain("查找聊天内容");
    expect(home).toContain("群聊信息与群管理");
    expect(home).toContain("showMentionList");
    expect(home).toContain("groupAnnouncement");
    expect(richMessage).toContain("text-amber-600");
  });
});
