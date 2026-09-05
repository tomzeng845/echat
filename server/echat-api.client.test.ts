import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setSession } from "../client/src/lib/echat-api";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  },
  configurable: true,
});

afterEach(() => {
  values.clear();
  vi.restoreAllMocks();
});

describe("E聊 API client", () => {
  it("preserves HTTP status on API errors", async () => {
    setSession({ success: true, accessToken: "test-token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "账号不存在" }),
    }));

    await expect(api("/api/users/me/public-key", {}, false)).rejects.toEqual(
      expect.objectContaining<ApiError>({ name: "ApiError", message: "账号不存在", status: 404 }),
    );
  });

  it("handles successful empty responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    await expect(api<void>("/api/ping")).resolves.toBeUndefined();
  });
});
