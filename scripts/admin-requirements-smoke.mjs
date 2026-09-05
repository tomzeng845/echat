import crypto from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-8);
const password = "EChat.Test.2026!";

async function call(path, token, init = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expected)
    throw new Error(
      `${path}: expected ${expected}, got ${response.status} ${text}`
    );
  return body;
}
const admin = await call("/api/auth/login", null, {
  method: "POST",
  body: JSON.stringify({
    account: "E_Admin",
    password: "Heibai@99",
    deviceName: "0.6 admin requirements smoke",
  }),
});
const token = admin.accessToken;
if (!token) throw new Error("admin login failed");
const userAccount = `req${suffix}`;
const user = await call("/api/auth/register", null, {
  method: "POST",
  body: JSON.stringify({
    account: userAccount,
    password,
    inviteCode: "ECHAT2026",
    displayName: "需求验收用户",
    agreementAccepted: true,
    deviceName: "requirements smoke",
  }),
});
const peerAccount = `peer${suffix}`;
const peer = await call("/api/auth/register", null, {
  method: "POST",
  body: JSON.stringify({
    account: peerAccount,
    password,
    inviteCode: "ECHAT2026",
    displayName: "建群验收成员",
    agreementAccepted: true,
    deviceName: "requirements peer",
  }),
});
async function publishPublicKey(session) {
  const pair = await crypto.webcrypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  const publicKeyJwk = await crypto.webcrypto.subtle.exportKey(
    "jwk",
    pair.publicKey
  );
  await call(
    "/api/users/me/public-key",
    session.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ publicKeyJwk: JSON.stringify(publicKeyJwk) }),
    },
    204
  );
}
await publishPublicKey(user);
await publishPublicKey(peer);

const verification = await call(
  `/api/admin/users/${userAccount}/verifications`,
  token,
  {
    method: "POST",
    body: JSON.stringify({
      type: "RealName",
      realName: "测试用户",
      idNumber: "110101199001011234",
      note: "自动化审核",
    }),
  }
);
await call(`/api/admin/verifications/${verification.id}/decision`, token, {
  method: "POST",
  body: JSON.stringify({ status: "Approved", reason: "资料一致" }),
});
const verifiedUsers = await call(
  `/api/admin/users?search=${userAccount}`,
  token
);
if (!verifiedUsers.items[0]?.realNameVerified)
  throw new Error("verification decision not reflected on user");

const generated = await call("/api/admin/invites/generate", token, {
  method: "POST",
});
if (!/^[A-Z0-9]{8}$/.test(generated.code))
  throw new Error("generated invite is not 8 characters");
await call("/api/admin/invites", token, {
  method: "POST",
  body: JSON.stringify({ code: generated.code, maxUses: 8, isActive: true }),
});
await call(`/api/admin/users/${userAccount}/invite-code`, token, {
  method: "PUT",
  body: JSON.stringify({ code: generated.code }),
});
const invitedUserPage = await call(
  `/api/admin/users?search=${userAccount}`,
  token
);
if (invitedUserPage.items[0]?.inviteSource !== generated.code)
  throw new Error("user invite selection not persisted");

await call(
  "/api/auth/login",
  null,
  {
    method: "POST",
    body: JSON.stringify({
      account: userAccount,
      password: "Wrong.Password",
      deviceName: "failure smoke",
    }),
  },
  401
);
const loginSearch = await call(
  `/api/admin/login-logs/search?account=${userAccount}`,
  token
);
if (!loginSearch.items.length) throw new Error("paged login logs missing");
const failureIps = await call("/api/admin/login-failure-ips", token);
if (!failureIps.items.length) throw new Error("failure IP aggregation missing");
await call(
  `/api/admin/login-failure-ips/${encodeURIComponent(failureIps.items[0].ip)}/decision`,
  token,
  {
    method: "POST",
    body: JSON.stringify({ status: "Observed", note: "自动化观察" }),
  }
);

const subjectCode = `AUTO_${suffix}`;
const subject = await call("/api/admin/fund/subjects", token, {
  method: "POST",
  body: JSON.stringify({
    code: subjectCode,
    name: "自动化额度",
    direction: "Increase",
    minAmount: 1,
    maxAmount: 5000,
    enabled: true,
    remark: "0.7.1",
  }),
});
const adjustment = await call("/api/admin/fund/adjustments", token, {
  method: "POST",
  body: JSON.stringify({
    account: userAccount,
    subjectCode,
    direction: "Increase",
    amount: 12.34,
    note: "需求验收",
    idempotencyKey: `req-${suffix}`,
  }),
});
if (adjustment.data.balanceAfter !== "12.34")
  throw new Error("fund adjustment failed");
if (
  !(await call(`/api/admin/fund/adjustments?account=${userAccount}`, token))
    .items.length
)
  throw new Error("fund adjustment query missing");
if (
  !(await call(`/api/admin/fund/transactions?search=${userAccount}`, token))
    .items.length
)
  throw new Error("transaction details query missing");

const operatorAccount = `admin${suffix}`;
await call("/api/admin/operators", token, {
  method: "POST",
  body: JSON.stringify({
    account: operatorAccount,
    displayName: "认证管理员",
    password,
    role: "Admin",
  }),
});
const enroll = await call(
  `/api/admin/operators/${operatorAccount}/totp/enroll`,
  token,
  { method: "POST" }
);
function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of value.replace(/=+$/, ""))
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}
await call(`/api/admin/operators/${operatorAccount}/totp/confirm`, token, {
  method: "POST",
  body: JSON.stringify({ code: totp(enroll.secret) }),
});
if (
  !(await call(`/api/admin/operators/${operatorAccount}/totp`, token))
    .configured
)
  throw new Error("operator TOTP not active");

const announcement = await call(
  "/api/admin/modules/system.announcements",
  token,
  {
    method: "POST",
    body: JSON.stringify({
      name: "0.7.1 公告",
      status: "Draft",
      data: { content: "需求文档公告测试" },
    }),
  }
);
await call(`/api/admin/announcements/${announcement.id}/action`, token, {
  method: "POST",
  body: JSON.stringify({ action: "publish" }),
});
await call(`/api/admin/announcements/${announcement.id}/action`, token, {
  method: "POST",
  body: JSON.stringify({ action: "revoke" }),
});

const conversationPage = await call(
  "/api/admin/chat/conversations?page=1&pageSize=20",
  token
);
const conversations = conversationPage.items;
const groupPage = await call(
  "/api/admin/chat/conversations?page=1&pageSize=20&groupsOnly=true",
  token
);
const group = groupPage.items.find(x => x.type === "Group");
if (!group) throw new Error("group conversation prerequisite missing");
const managedGroup = await call("/api/admin/chat/groups", token, {
  method: "POST",
  body: JSON.stringify({
    name: "后台加密群",
    ownerAccount: userAccount,
    memberAccounts: [peerAccount],
  }),
});
await call(`/api/admin/chat/groups/${managedGroup.id}`, token, {
  method: "PUT",
  body: JSON.stringify({ name: "后台加密群已更新" }),
});
const speech = await call("/api/admin/modules/chat.group-speech", token, {
  method: "POST",
  body: JSON.stringify({
    name: "自动群发言",
    status: "Active",
    data: {
      conversationId: group.id,
      content: "群发言自动化测试",
      keywords: "测试 自动化",
      replacement: "已替换",
    },
  }),
});
await call(`/api/admin/automations/${speech.id}/run`, token, {
  method: "POST",
  body: JSON.stringify({}),
});
const groupInvite = await call("/api/admin/group-invites", token, {
  method: "POST",
  body: JSON.stringify({
    code: `GI${suffix}`.slice(0, 10).toUpperCase(),
    conversationId: group.id,
    maxUses: 10,
    enabled: true,
  }),
});
await call("/api/group-invites/redeem", user.accessToken, {
  method: "POST",
  body: JSON.stringify({ code: groupInvite.data.code }),
});

const messageView = await call(
  `/api/admin/conversations/${conversations[0].id}/messages`,
  token
);
if (messageView.messages.some(x => x.plaintextAvailable !== false))
  throw new Error("E2EE admin boundary broken");
await call("/api/admin/contacts", token, {}, 410);

for (const retired of [
  "system.resources",
  "system.settings",
  "system.push",
  "chat.tasks",
  "chat.sms",
])
  await call(`/api/admin/modules/${retired}`, token, {}, 404);
await call("/api/admin/tasks/retired/run", token, { method: "POST" }, 410);

console.log(
  `ADMIN_REQUIREMENTS_083_OK verification=approved invite=${generated.code} login_logs=${loginSearch.total} failure_ips=${failureIps.total} fund=${adjustment.data.balanceAfter} transactions=filtered totp=active announcement=revoke conversations=paged group_speech=sent group_invite=${groupInvite.data.code} e2ee=protected retired_modules=5`
);
