import { describe, expect, it } from "vitest";

const healthUrl = process.env.ECHAT_HEALTH_URL;

describe.skipIf(!healthUrl)("deployed APNs production secret", () => {
  it("loads a valid production APNs key into the EChat API", async () => {
    expect(process.env.APNS_BUNDLE_ID).toBe("com.tomzeng845.echat");
    const response = await fetch(healthUrl!, {
      headers: { accept: "application/json" },
    });

    expect(response.ok).toBe(true);
    const health = (await response.json()) as {
      version?: string;
      status?: string;
      push?: {
        enabled?: boolean;
        provider?: string;
        iosEnabled?: boolean;
      };
    };

    expect(health.version).toBe("0.9.0");
    expect(health.status).toBe("healthy");
    expect(health.push?.enabled).toBe(true);
    expect(health.push?.iosEnabled).toBe(true);
    expect(health.push?.provider).toContain("Apple Push Notification service");
  });
});
