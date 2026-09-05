import { webcrypto } from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:2099";
const target = process.argv[3] || "uiqa0905";
const account = `peer${Date.now().toString().slice(-8)}`;
const password = "EChat.Peer.2026!";

async function request(path, init = {}) {
  const response = await fetch(base + path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const auth = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ account, password, inviteCode: "ECHAT2026", displayName: "加密测试好友", agreementAccepted: true, deviceName: "UI Seed" }) });
const pair = await webcrypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
const publicKeyJwk = JSON.stringify(await webcrypto.subtle.exportKey("jwk", pair.publicKey));
const authorization = { Authorization: `Bearer ${auth.accessToken}` };
await request("/api/users/me/public-key", { method: "PUT", headers: authorization, body: JSON.stringify({ publicKeyJwk }) });
await request("/api/contacts/requests", { method: "POST", headers: authorization, body: JSON.stringify({ requestId: `ui-${Date.now()}`, peerAccount: target, note: "一起体验端到端加密聊天吧", source: "account" }) });
console.log(JSON.stringify({ account, password, target }));
