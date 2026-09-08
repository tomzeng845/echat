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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "账号不存在" }),
      })
    );

    await expect(api("/api/users/me/public-key", {}, false)).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        message: "账号不存在",
        status: 404,
      })
    );
  });

  it("handles successful empty responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204 })
    );
    await expect(api<void>("/api/ping")).resolves.toBeUndefined();
  });

  it("shares one refresh request across concurrent expired API calls", async () => {
    const initial = {
      success: true,
      accessToken: "expired-access",
      refreshToken: "refresh-before",
      user: { id: "u1" },
    };
    const rotated = {
      ...initial,
      accessToken: "fresh-access",
      refreshToken: "refresh-after",
    };
    setSession(initial);

    let resolveRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>(resolve => {
      resolveRefresh = resolve;
    });
    let refreshCalls = 0;
    let protectedCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/refresh")) {
          refreshCalls += 1;
          return refreshResponse;
        }
        protectedCalls += 1;
        if (protectedCalls <= 2) {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const first = api<{ ok: boolean }>("/api/first");
    const second = api<{ ok: boolean }>("/api/second");
    await Promise.resolve();
    resolveRefresh(
      new Response(JSON.stringify(rotated), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(refreshCalls).toBe(1);
    expect(getStoredRefreshToken()).toBe("refresh-after");
  });
});

function getStoredRefreshToken() {
  const raw = values.get("echat.session.v1");
  return raw ? JSON.parse(raw).refreshToken : undefined;
}
