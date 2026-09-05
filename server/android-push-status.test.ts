import { describe, expect, it } from "vitest";
import {
  canInitializeNativePush,
  pushStatusLabel,
} from "../client/src/lib/push-status";

describe("Android push status label", () => {
  it("shows an explicit FCM configuration state in the native profile", () => {
    expect(pushStatusLabel(true, "unavailable")).toBe("待配置 FCM");
    expect(pushStatusLabel(true, "registered")).toBe("已开启");
    expect(pushStatusLabel(true, "denied")).toBe("权限已关闭");
    expect(pushStatusLabel(false, "unavailable")).toBe("仅 Android APP");
  });

  it("does not initialize Firebase unless both client and server are configured", () => {
    expect(canInitializeNativePush(false, false)).toBe(false);
    expect(canInitializeNativePush(false, true)).toBe(false);
    expect(canInitializeNativePush(true, false)).toBe(false);
    expect(canInitializeNativePush(true, true)).toBe(true);
  });
});
