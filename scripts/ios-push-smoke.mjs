const base = (process.argv[2] || "http://127.0.0.1:2099").replace(/\/$/, "");

async function request(path, { token, method = "GET", body, expectedStatus } = {}) {
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
  if (expectedStatus !== undefined) {
    if (response.status !== expectedStatus)
      throw new Error(`${method} ${path} -> ${response.status}, expected ${expectedStatus}: ${text}`);
    return data;
  }
  if (!response.ok)
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  return data;
}

const suffix = String(Date.now()).slice(-8);
const auth = await request("/api/auth/register", {
  method: "POST",
  body: {
    account: `ios${suffix}`,
    password: "IosTest@99",
    inviteCode: "ECHAT2026",
    displayName: "iOS 推送测试",
    agreementAccepted: true,
    deviceName: "E聊 iOS 0.9.0",
    deviceId: `ios-auth-${suffix}`,
  },
});

const deviceId = `ios-push-${suffix}`;
const alertToken = "a".repeat(64);
const voipToken = "b".repeat(64);
for (const [platform, token] of [
  ["ios", alertToken],
  ["ios-voip", voipToken],
]) {
  await request("/api/push/devices", {
    token: auth.accessToken,
    method: "POST",
    body: { deviceId, token, platform, appVersion: "0.9.0" },
  });
}

await request("/api/push/devices", {
  token: auth.accessToken,
  method: "POST",
  expectedStatus: 400,
  body: {
    deviceId,
    token: "c".repeat(64),
    platform: "unsupported-ios-platform",
    appVersion: "0.9.0",
  },
});

const registered = await request("/api/push/status", { token: auth.accessToken });
const platforms = registered.devices.map(device => device.platform).sort();
if (
  registered.registeredDevices !== 2 ||
  JSON.stringify(platforms) !== JSON.stringify(["ios", "ios-voip"])
)
  throw new Error(`Unexpected iOS push status: ${JSON.stringify(registered)}`);

await request(`/api/push/devices/${deviceId}`, {
  token: auth.accessToken,
  method: "DELETE",
});
const disabled = await request("/api/push/status", { token: auth.accessToken });
if (disabled.registeredDevices !== 0)
  throw new Error(`iOS push device was not disabled: ${JSON.stringify(disabled)}`);

const health = await request("/api/health");
if (
  health.version !== "0.9.0" ||
  typeof health.push?.androidEnabled !== "boolean" ||
  typeof health.push?.iosEnabled !== "boolean"
)
  throw new Error(`Unexpected health payload: ${JSON.stringify(health)}`);

console.log(
  `IOS_PUSH_API_OK account=${auth.user.account} registered=2 platforms=${platforms.join(",")} disabled=2 ios_enabled=${registered.iosEnabled}`
);
