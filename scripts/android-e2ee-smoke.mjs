import { webcrypto } from "node:crypto";
import puppeteer from "puppeteer-core";

const base = (process.argv[2] || "http://127.0.0.1:2099").replace(/\/$/, "");
const subtle = webcrypto.subtle;
const suffix = String(Date.now()).slice(-8);
const password = "Android.E2EE@99";

const toBase64 = value => Buffer.from(value).toString("base64");
const fromBase64 = value => Buffer.from(value, "base64");

async function request(
  path,
  { token, deviceId, method = "GET", body, expected = 200 } = {}
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceId ? { "X-EChat-Device-Id": deviceId } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (response.status !== expected)
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function register(account, displayName, deviceId) {
  return request("/api/auth/register", {
    method: "POST",
    expected: 200,
    body: {
      account,
      password,
      inviteCode: "ECHAT2026",
      displayName,
      agreementAccepted: true,
      deviceName: "Android E2EE smoke",
      deviceId,
    },
  });
}

async function identity() {
  const pair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["encrypt", "decrypt"]
  );
  return {
    pair,
    publicKeyJwk: JSON.stringify(await subtle.exportKey("jwk", pair.publicKey)),
  };
}

async function aesKey() {
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(key, publicKeyJwk) {
  const publicKey = await subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  return toBase64(
    await subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      await subtle.exportKey("raw", key)
    )
  );
}

async function open(envelope, privateKey) {
  const raw = await subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    fromBase64(envelope)
  );
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(key, plaintext) {
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { ciphertext: toBase64(ciphertext), nonce: toBase64(nonce) };
}

async function decrypt(key, message) {
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(message.nonce) },
    key,
    fromBase64(message.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

const oldDevice = `browser-old-${suffix}`;
const appDevice = `android-app-${suffix}`;
const peerDevice = `browser-peer-${suffix}`;
const accountA = `keya${suffix}`;
const accountB = `keyb${suffix}`;
const [oldIdentity, appIdentity, peerIdentity] = await Promise.all([
  identity(),
  identity(),
  identity(),
]);
const [authA, authB] = await Promise.all([
  register(accountA, "多设备用户", oldDevice),
  register(accountB, "会话好友", peerDevice),
]);

for (const [auth, deviceId, value] of [
  [authA, oldDevice, oldIdentity.publicKeyJwk],
  [authA, appDevice, appIdentity.publicKeyJwk],
  [authB, peerDevice, peerIdentity.publicKeyJwk],
])
  await request("/api/users/me/public-key", {
    token: auth.accessToken,
    deviceId,
    method: "PUT",
    expected: 204,
    body: { publicKeyJwk: value, deviceId },
  });

await request("/api/contacts/requests", {
  token: authA.accessToken,
  deviceId: oldDevice,
  method: "POST",
  expected: 200,
  body: {
    requestId: `key-${suffix}`,
    peerAccount: accountB,
    note: "多设备密钥测试",
    source: "account",
  },
});
const requests = await request("/api/contacts/requests", {
  token: authB.accessToken,
  deviceId: peerDevice,
});
await request(`/api/contacts/requests/${requests[0].id}/accept`, {
  token: authB.accessToken,
  deviceId: peerDevice,
  method: "POST",
  expected: 204,
});

const keyV1 = await aesKey();
const conversation = await request("/api/conversations/direct", {
  token: authA.accessToken,
  deviceId: oldDevice,
  method: "POST",
  body: {
    peerAccount: accountB,
    keyEnvelopes: {
      [`${authA.user.id}:${oldDevice}`]: await seal(
        keyV1,
        oldIdentity.publicKeyJwk
      ),
      [`${authB.user.id}:${peerDevice}`]: await seal(
        keyV1,
        peerIdentity.publicKeyJwk
      ),
    },
  },
});
const legacyText = "轮换前历史消息";
await request(`/api/conversations/${conversation.id}/messages`, {
  token: authA.accessToken,
  deviceId: oldDevice,
  method: "POST",
  body: {
    clientMessageId: `legacy-${suffix}`,
    kind: "Text",
    keyVersion: 1,
    ...(await encrypt(keyV1, legacyText)),
  },
});

const appBefore = await request("/api/conversations", {
  token: authA.accessToken,
  deviceId: appDevice,
});
if (appBefore[0].keyEnvelope)
  throw new Error("New Android device unexpectedly received the old envelope");
const members = await request(`/api/conversations/${conversation.id}/members`, {
  token: authA.accessToken,
  deviceId: appDevice,
});
const keyV2 = await aesKey();
const envelopesV2 = {};
const privateKeys = new Map([
  [oldDevice, oldIdentity.pair.privateKey],
  [appDevice, appIdentity.pair.privateKey],
  [peerDevice, peerIdentity.pair.privateKey],
]);
for (const member of members)
  for (const device of member.encryptionDevices)
    envelopesV2[`${member.userId}:${device.deviceId}`] = await seal(
      keyV2,
      device.publicKeyJwk
    );
await request(`/api/conversations/${conversation.id}/key`, {
  token: authA.accessToken,
  deviceId: appDevice,
  method: "PUT",
  expected: 204,
  body: { keyVersion: 2, keyEnvelopes: envelopesV2 },
});

for (const [auth, userId, deviceId] of [
  [authA, authA.user.id, oldDevice],
  [authA, authA.user.id, appDevice],
  [authB, authB.user.id, peerDevice],
]) {
  const list = await request("/api/conversations", {
    token: auth.accessToken,
    deviceId,
  });
  if (list[0].keyVersion !== 2 || !list[0].keyEnvelope)
    throw new Error(`Missing v2 envelope for ${deviceId}`);
  await open(list[0].keyEnvelope, privateKeys.get(deviceId));
  if (!envelopesV2[`${userId}:${deviceId}`])
    throw new Error(`Rotation omitted ${deviceId}`);
}

const appText = "Android 新设备消息可解密";
await request(`/api/conversations/${conversation.id}/messages`, {
  token: authA.accessToken,
  deviceId: appDevice,
  method: "POST",
  body: {
    clientMessageId: `app-${suffix}`,
    kind: "Text",
    keyVersion: 2,
    ...(await encrypt(keyV2, appText)),
  },
});
const messages = await request(
  `/api/conversations/${conversation.id}/messages?after=0&limit=10`,
  { token: authB.accessToken, deviceId: peerDevice }
);
if ((await decrypt(keyV1, messages[0])) !== legacyText)
  throw new Error("Legacy message no longer decrypts with v1 key");
if ((await decrypt(keyV2, messages[1])) !== appText)
  throw new Error("Android v2 message failed to decrypt");
await request(`/api/conversations/${conversation.id}/messages`, {
  token: authA.accessToken,
  deviceId: appDevice,
  method: "POST",
  expected: 409,
  body: {
    clientMessageId: `stale-${suffix}`,
    kind: "Text",
    keyVersion: 1,
    ...(await encrypt(keyV1, "stale")),
  },
});

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(
    ({ session, deviceId }) => {
      localStorage.setItem("echat.session.v1", JSON.stringify(session));
      localStorage.setItem("echat.device.v1", deviceId);
    },
    { session: authA, deviceId: appDevice }
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(
    async ({ token, deviceId, conversationId }) => {
      const response = await fetch("/api/conversations", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EChat-Device-Id": deviceId,
        },
      });
      if (!response.ok) return false;
      const items = await response.json();
      return items.some(
        item => item.id === conversationId && item.keyVersion >= 3
      );
    },
    { timeout: 20000 },
    {
      token: authA.accessToken,
      deviceId: appDevice,
      conversationId: conversation.id,
    }
  );
  await page.waitForSelector('textarea[placeholder="输入消息"]', {
    visible: true,
    timeout: 10000,
  });
  const appUiText = "Android APP 发送后可解密";
  await page.type('textarea[placeholder="输入消息"]', appUiText);
  await page.click('button[aria-label="发送消息"]');
  await page.waitForFunction(
    text => document.body.innerText.includes(text),
    { timeout: 10000 },
    appUiText
  );
  const visibleText = await page.evaluate(() => document.body.innerText);
  if (visibleText.includes("消息解密失败"))
    throw new Error("The UI still shows the generic decryption error");

  const peerList = await request("/api/conversations", {
    token: authB.accessToken,
    deviceId: peerDevice,
  });
  if (peerList[0].keyVersion !== 3 || !peerList[0].keyEnvelope)
    throw new Error("Peer did not receive the UI-rotated v3 envelope");
  const peerKeyV3 = await open(
    peerList[0].keyEnvelope,
    peerIdentity.pair.privateKey
  );
  const latest = await request(
    `/api/conversations/${conversation.id}/messages?after=0&limit=10`,
    { token: authB.accessToken, deviceId: peerDevice }
  );
  if ((await decrypt(peerKeyV3, latest.at(-1))) !== appUiText)
    throw new Error("Peer failed to decrypt the Android UI message");

  await page.evaluate(
    async ({ conversationId, keyVersion }) => {
      window.__echatAlertEvents = [];
      window.addEventListener("echat-alert-sound", event =>
        window.__echatAlertEvents.push(event.detail)
      );
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("echat-secure-vault", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        tx.objectStore("keys").delete(
          `conversation:${conversationId}:v${keyVersion}`
        );
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    },
    { conversationId: conversation.id, keyVersion: 3 }
  );
  const incomingText = "新消息即时恢复密钥且提示一次";
  await request(`/api/conversations/${conversation.id}/messages`, {
    token: authB.accessToken,
    deviceId: peerDevice,
    method: "POST",
    body: {
      clientMessageId: `incoming-${suffix}`,
      kind: "Text",
      keyVersion: 3,
      ...(await encrypt(peerKeyV3, incomingText)),
    },
  });
  await page.waitForFunction(() => window.__echatAlertEvents?.length === 1, {
    timeout: 10000,
  });
  try {
    await page.waitForFunction(
      text => document.body.innerText.includes(text),
      { timeout: 10000 },
      incomingText
    );
  } catch (error) {
    const state = await page.evaluate(
      async ({ token, deviceId, conversationId, account }) => {
        const response = await fetch(
          `/api/conversations/${conversationId}/keys/3`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-EChat-Device-Id": deviceId,
            },
          }
        );
        const keyRecord = JSON.parse(await response.text());
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("echat-secure-vault", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const pair = await new Promise((resolve, reject) => {
          const request = db
            .transaction("keys", "readonly")
            .objectStore("keys")
            .get(`identity:${account}`);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        let envelopeDecrypt = "missing-identity";
        if (pair?.privateKey) {
          try {
            const bytes = Uint8Array.from(atob(keyRecord.keyEnvelope), char =>
              char.charCodeAt(0)
            );
            await crypto.subtle.decrypt(
              { name: "RSA-OAEP" },
              pair.privateKey,
              bytes
            );
            envelopeDecrypt = "ok";
          } catch (cause) {
            envelopeDecrypt = cause instanceof Error ? cause.name : "failed";
          }
        }
        return {
          text: document.body.innerText.slice(-1200),
          alerts: window.__echatAlertEvents,
          keyEndpoint: {
            status: response.status,
            body: keyRecord,
            envelopeDecrypt,
          },
        };
      },
      {
        token: authA.accessToken,
        deviceId: appDevice,
        conversationId: conversation.id,
        account: authA.user.account,
      }
    );
    throw new Error(
      `Realtime message arrived but decryption failed: ${JSON.stringify(state)}`,
      { cause: error }
    );
  }
  const recovery = await page.evaluate(
    async ({ conversationId }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("echat-secure-vault", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const keyRestored = await new Promise((resolve, reject) => {
        const request = db
          .transaction("keys", "readonly")
          .objectStore("keys")
          .get(`conversation:${conversationId}:v3`);
        request.onsuccess = () => resolve(Boolean(request.result));
        request.onerror = () => reject(request.error);
      });
      return {
        keyRestored,
        alerts: window.__echatAlertEvents,
      };
    },
    { conversationId: conversation.id }
  );
  if (
    !recovery.keyRestored ||
    recovery.alerts.filter(event => event.eventId).length !== 1
  )
    throw new Error(
      `Realtime key recovery failed: ${JSON.stringify(recovery)}`
    );
} finally {
  await browser.close();
}

console.log(
  `ANDROID_E2EE_OK conversation=${conversation.id} versions=1,2,3 devices=3 legacy=decryptable app=decryptable peer=decryptable stale=409 ui=ok realtime_recovery=ok message_sound=once`
);
