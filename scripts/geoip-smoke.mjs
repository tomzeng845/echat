const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-8);
const account = `geo${suffix}`;
const password = "EChat.GeoIP@99";

async function call(
  path,
  { token, method = "GET", body, ip } = {},
  expected = 200
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(ip ? { "X-Forwarded-For": ip } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (response.status !== expected)
    throw new Error(
      `${path}: expected ${expected}, got ${response.status} ${text}`
    );
  return text ? JSON.parse(text) : null;
}

const admin = await call("/api/auth/login", {
  method: "POST",
  ip: "8.8.8.8",
  body: {
    account: "E_Admin",
    password: "Heibai@99",
    deviceName: "GeoIP smoke",
  },
});
if (!admin.accessToken) throw new Error("admin login failed");
const token = admin.accessToken;
const overview = await call("/api/admin/overview", { token });
if (
  !overview.security.geoIp.enabled ||
  overview.security.geoIp.provider !== "ipwho.is"
)
  throw new Error(
    `GeoIP provider not enabled: ${JSON.stringify(overview.security.geoIp)}`
  );

await call("/api/auth/register", {
  method: "POST",
  ip: "1.1.1.1",
  body: {
    account,
    password,
    inviteCode: "ECHAT2026",
    displayName: "GeoIP 验收用户",
    agreementAccepted: true,
    deviceName: "GeoIP smoke user",
  },
});

const users = await call(`/api/admin/users?search=${account}`, { token });
const user = users.items?.find(item => item.account === account);
if (!user) throw new Error("GeoIP user missing from admin page");
if (
  !user.lastLoginAddress ||
  user.lastLoginAddress.startsWith("公网 IP") ||
  user.lastLoginAddress.includes("未知")
)
  throw new Error(`public IP was not geolocated: ${user.lastLoginAddress}`);

const logs = await call(
  `/api/admin/login-logs/search?account=${account}&page=1&pageSize=20`,
  { token }
);
const login = logs.items?.find(item => item.data?.ip === "1.1.1.1");
if (!login || login.data.address !== user.lastLoginAddress)
  throw new Error(`login address mismatch: ${JSON.stringify(login?.data)}`);

const health = await call("/api/health");
if (health.version !== "0.8.4" || health.geoIp.cachedEntries < 2)
  throw new Error(`GeoIP health invalid: ${JSON.stringify(health.geoIp)}`);

console.log(
  `GEOIP_OK provider=${health.geoIp.provider} user=${account} address=${user.lastLoginAddress} cached=${health.geoIp.cachedEntries}`
);
