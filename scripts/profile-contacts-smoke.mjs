import * as signalR from "@microsoft/signalr";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-8);
const password = "EChat.Profile.2026!";

async function raw(path, token, init = {}) {
  return fetch(base + path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });
}

async function request(path, token, init = {}) {
  const response = await raw(path, token, init);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function register(prefix, displayName) {
  return request("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({
      account: `${prefix}${suffix}`,
      password,
      inviteCode: "ECHAT2026",
      displayName,
      agreementAccepted: true,
      deviceName: "Profile contacts smoke",
    }),
  });
}

async function makeFriends(sender, receiver) {
  const created = await request("/api/contacts/requests", sender.accessToken, {
    method: "POST",
    body: JSON.stringify({
      requestId: `profile-${crypto.randomUUID()}`,
      peerAccount: receiver.user.account,
      note: "资料功能测试",
      source: "account",
    }),
  });
  await request(`/api/contacts/requests/${created.id}/accept`, receiver.accessToken, { method: "POST" });
}

function once(connection, event, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const handler = value => {
      clearTimeout(timer);
      connection.off(event, handler);
      resolve(value);
    };
    const timer = setTimeout(() => {
      connection.off(event, handler);
      reject(new Error(`${event} timeout`));
    }, timeout);
    connection.on(event, handler);
  });
}

const [alice, bob, carol, dave] = await Promise.all([
  register("pra", "资料甲"),
  register("prb", "资料乙"),
  register("prc", "拉黑甲"),
  register("prd", "拉黑乙"),
]);

await makeFriends(alice, bob);
const conversation = await request("/api/conversations/direct", alice.accessToken, {
  method: "POST",
  body: JSON.stringify({ peerAccount: bob.user.account }),
});

const bobHub = new signalR.HubConnectionBuilder()
  .withUrl(`${base}/hubs/chat`, { accessTokenFactory: () => bob.accessToken })
  .build();
await bobHub.start();
try {
  const profileUpdated = once(bobHub, "profile.updated");
  const avatar = new FormData();
  avatar.append("purpose", "Avatar");
  avatar.append("file", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "avatar.png");
  const asset = await request("/api/media", alice.accessToken, { method: "POST", body: avatar });
  const updated = await request("/api/users/me/profile", alice.accessToken, {
    method: "PUT",
    body: JSON.stringify({ displayName: "资料甲已更新", signature: "新的个性签名", avatarAssetId: asset.id }),
  });
  const event = await profileUpdated;
  if (updated.displayName !== "资料甲已更新" || updated.signature !== "新的个性签名" || !updated.avatarUrl.includes(asset.id)) throw new Error("profile update response mismatch");
  if (event.id !== alice.user.id || event.avatarUrl !== updated.avatarUrl) throw new Error("profile.updated payload mismatch");
  const bobContacts = await request("/api/contacts", bob.accessToken);
  if (!bobContacts.some(item => item.user.id === alice.user.id && item.user.displayName === "资料甲已更新")) throw new Error("friend profile did not refresh");
  const avatarResponse = await raw(updated.avatarUrl, bob.accessToken);
  if (!avatarResponse.ok) throw new Error(`friend avatar access failed: ${avatarResponse.status}`);

  await request(`/api/contacts/${alice.user.id}`, bob.accessToken, { method: "DELETE" });
  const [aliceContacts, bobContactsAfterDelete] = await Promise.all([
    request("/api/contacts", alice.accessToken),
    request("/api/contacts", bob.accessToken),
  ]);
  if (aliceContacts.some(item => item.status === "Friend" && item.user.id === bob.user.id) || bobContactsAfterDelete.some(item => item.status === "Friend" && item.user.id === alice.user.id)) throw new Error("delete friend was not bilateral");
  const deletedSend = await raw(`/api/conversations/${conversation.id}/messages`, alice.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: crypto.randomUUID(), kind: "Text", content: "不应发送", ciphertext: "", nonce: "", algorithm: "PLAINTEXT" }),
  });
  if (deletedSend.status !== 403) throw new Error(`deleted friend message expected 403, got ${deletedSend.status}`);

  await makeFriends(carol, dave);
  const blockedConversation = await request("/api/conversations/direct", carol.accessToken, {
    method: "POST",
    body: JSON.stringify({ peerAccount: dave.user.account }),
  });
  await request(`/api/contacts/${dave.user.id}/block`, carol.accessToken, { method: "POST" });
  const [carolContacts, daveContacts] = await Promise.all([
    request("/api/contacts", carol.accessToken),
    request("/api/contacts", dave.accessToken),
  ]);
  if (carolContacts.some(item => item.status === "Friend" && item.user.id === dave.user.id) || daveContacts.some(item => item.status === "Friend" && item.user.id === carol.user.id)) throw new Error("blocked relation remained visible");
  const blockedSend = await raw(`/api/conversations/${blockedConversation.id}/messages`, dave.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: crypto.randomUUID(), kind: "Text", content: "不应发送", ciphertext: "", nonce: "", algorithm: "PLAINTEXT" }),
  });
  if (blockedSend.status !== 403) throw new Error(`blocked message expected 403, got ${blockedSend.status}`);
  const blockedRequest = await raw("/api/contacts/requests", dave.accessToken, {
    method: "POST",
    body: JSON.stringify({ requestId: crypto.randomUUID(), peerAccount: carol.user.account, note: "不应成功", source: "account" }),
  });
  if (blockedRequest.status !== 403) throw new Error(`blocked friend request expected 403, got ${blockedRequest.status}`);

  console.log(`PROFILE_CONTACTS_OK profile=${updated.id} avatar=${asset.id} delete=403 block=403 conversation=${blockedConversation.id}`);
} finally {
  await bobHub.stop();
}
