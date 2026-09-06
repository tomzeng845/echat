const base = (process.argv[2] || "http://127.0.0.1:2099").replace(/\/$/, "");

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok)
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  return data;
}

const suffix = String(Date.now()).slice(-8);
const auth = await request("/api/auth/register", {
  method: "POST",
  body: {
    account: `android${suffix}`,
    password: "Android@99",
    inviteCode: "ECHAT2026",
    displayName: "Android 推送测试",
    agreementAccepted: true,
    deviceName: "E聊 Android 0.8.9",
    deviceId: `android-${suffix}`,
  },
});

const deviceId = `android-push-${suffix}`;
const token = `fake-fcm-token-${suffix}-${"x".repeat(48)}`;
await request("/api/push/devices", {
  token: auth.accessToken,
  method: "POST",
  body: { deviceId, token, platform: "android", appVersion: "0.8.9" },
});
const registered = await request("/api/push/status", {
  token: auth.accessToken,
});
if (
  registered.provider !== "Firebase Cloud Messaging" ||
  registered.registeredDevices !== 1
)
  throw new Error(`Unexpected push status: ${JSON.stringify(registered)}`);

await request(`/api/push/devices/${deviceId}`, {
  token: auth.accessToken,
  method: "DELETE",
});
const disabled = await request("/api/push/status", { token: auth.accessToken });
if (disabled.registeredDevices !== 0)
  throw new Error(`Push device was not disabled: ${JSON.stringify(disabled)}`);

const health = await request("/api/health");
if (
  health.version !== "0.8.9" ||
  health.push?.provider !== "Firebase Cloud Messaging"
)
  throw new Error(`Unexpected health payload: ${JSON.stringify(health)}`);

console.log(
  `ANDROID_PUSH_OK account=${auth.user.account} provider=${registered.provider} server_enabled=${registered.enabled} registered=1 disabled=1`
);
