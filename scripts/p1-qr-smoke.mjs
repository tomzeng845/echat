const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = String(Date.now()).slice(-9);

async function request(path, init = {}, token, expected = 200) {
  const headers = { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status} ${text}`);
  return body;
}
async function register(name) {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify({ account: `${name}${suffix}`, password: "EChatTest2026x", inviteCode: "ECHAT2026", displayName: name, agreementAccepted: true, deviceName: `${name} device`, deviceId: `${name}device0000000001` }) });
}

const alice = await register("qralice");
const bob = await register("qrbob");
const challenge = await request("/api/qr/login/start", { method: "POST", body: JSON.stringify({ deviceName: "QR desktop", deviceId: "desktopqr0000000001" }) });
const loginMatch = /^echat:\/\/login\/([a-f0-9]{32})\/([A-Za-z0-9_-]+)$/i.exec(challenge.qrPayload);
if (!loginMatch) throw new Error("invalid login QR payload");
const scan = await request("/api/qr/login/scan", { method: "POST", body: JSON.stringify({ challengeId: loginMatch[1], token: loginMatch[2] }) }, alice.accessToken);
if (!scan.verificationCode) throw new Error("missing verification code");
await request("/api/qr/login/approve", { method: "POST", body: JSON.stringify({ challengeId: loginMatch[1], scanToken: loginMatch[2], approve: true }) }, alice.accessToken, 204);
const status = await request("/api/qr/login/status", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, token: challenge.pollToken }) });
if (status.status !== "Approved") throw new Error(`unexpected QR status ${status.status}`);
const qrSession = await request("/api/qr/login/exchange", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, token: challenge.pollToken }) });
await request("/api/qr/login/exchange", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, token: challenge.pollToken }) }, undefined, 409);

const card = await request("/api/qr/contact/create", { method: "POST" }, alice.accessToken);
const contactMatch = /^echat:\/\/contact\/([A-Za-z0-9_-]+)$/i.exec(card.qrPayload);
if (!contactMatch) throw new Error("invalid contact QR payload");
const preview = await request("/api/qr/contact/preview", { method: "POST", body: JSON.stringify({ token: contactMatch[1] }) }, bob.accessToken);
if (preview.user.account !== `qralice${suffix}`) throw new Error("contact preview mismatch");
await request("/api/qr/contact/redeem", { method: "POST", body: JSON.stringify({ token: contactMatch[1] }) }, bob.accessToken);

const devicesBefore = await request("/api/devices", {}, qrSession.accessToken);
if (devicesBefore.length < 2) throw new Error("expected multiple sessions");
await request("/api/devices/revoke-others", { method: "POST" }, qrSession.accessToken, 204);
const devicesAfter = await request("/api/devices", {}, qrSession.accessToken);
if (devicesAfter.length !== 1 || !devicesAfter[0].current) throw new Error("device revoke failed");

console.log(`P1_QR_OK challenge=${challenge.challengeId} devices=${devicesBefore.length}->${devicesAfter.length} friend=${preview.user.account}`);
