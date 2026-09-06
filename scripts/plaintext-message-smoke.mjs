const base = (process.argv[2] || "http://127.0.0.1:2099").replace(/\/$/, "");
const suffix = String(Date.now()).slice(-8);
const password = "Plain.Message@99";

async function request(
  path,
  { token, method = "GET", body, expected = 200 } = {}
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== expected)
    throw new Error(
      `${method} ${path} -> ${response.status}: ${bytes.toString("utf8")}`
    );
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("json")
    ? JSON.parse(bytes.toString("utf8"))
    : bytes;
}

async function register(account, displayName) {
  return request("/api/auth/register", {
    method: "POST",
    body: {
      account,
      password,
      inviteCode: "ECHAT2026",
      displayName,
      agreementAccepted: true,
      deviceName: "Plaintext message smoke",
    },
  });
}

const senderAccount = `plaina${suffix}`;
const receiverAccount = `plainb${suffix}`;
const [sender, receiver] = await Promise.all([
  register(senderAccount, "明文发送者"),
  register(receiverAccount, "明文接收者"),
]);

await request("/api/contacts/requests", {
  token: sender.accessToken,
  method: "POST",
  body: {
    requestId: `plain-friend-${suffix}`,
    peerAccount: receiverAccount,
    note: "明文消息验收",
    source: "account",
  },
});
const friendRequests = await request("/api/contacts/requests", {
  token: receiver.accessToken,
});
await request(`/api/contacts/requests/${friendRequests[0].id}/accept`, {
  token: receiver.accessToken,
  method: "POST",
  expected: 204,
});

const conversation = await request("/api/conversations/direct", {
  token: sender.accessToken,
  method: "POST",
  body: { peerAccount: receiverAccount },
});
const text = `明文消息 ${suffix}`;
const message = await request(
  `/api/conversations/${conversation.id}/messages`,
  {
    token: sender.accessToken,
    method: "POST",
    body: {
      clientMessageId: `plain-text-${suffix}`,
      kind: "Text",
      algorithm: "PLAINTEXT",
      keyVersion: 0,
      content: text,
      ciphertext: "",
      nonce: "",
    },
  }
);
if (
  message.content !== text ||
  message.algorithm !== "PLAINTEXT" ||
  message.ciphertext !== "" ||
  message.keyVersion !== 0
)
  throw new Error(`plaintext contract invalid: ${JSON.stringify(message)}`);

const emoji = await request(`/api/conversations/${conversation.id}/messages`, {
  token: sender.accessToken,
  method: "POST",
  body: {
    clientMessageId: `plain-emoji-${suffix}`,
    kind: "Emoji",
    algorithm: "PLAINTEXT",
    keyVersion: 0,
    content: "❤️",
    ciphertext: "",
    nonce: "",
  },
});
if (emoji.content !== "❤️" || emoji.kind !== "Emoji")
  throw new Error("plaintext emoji missing");

const original = Buffer.from(`original-media-${suffix}`);
const mediaForm = new FormData();
mediaForm.append("purpose", "Chat");
mediaForm.append("conversationId", conversation.id);
mediaForm.append(
  "file",
  new Blob([original], { type: "image/png" }),
  "plain-image.png"
);
const asset = await request("/api/media", {
  token: sender.accessToken,
  method: "POST",
  body: mediaForm,
});
const mediaPayload = {
  assetId: asset.id,
  fileName: "plain-image.png",
  mimeType: "image/png",
  size: original.length,
};
const mediaMessage = await request(
  `/api/conversations/${conversation.id}/messages`,
  {
    token: sender.accessToken,
    method: "POST",
    body: {
      clientMessageId: `plain-media-${suffix}`,
      kind: "Image",
      algorithm: "PLAINTEXT",
      keyVersion: 0,
      content: JSON.stringify(mediaPayload),
      ciphertext: "",
      nonce: "",
      metadata: { assetId: asset.id },
    },
  }
);
if (JSON.parse(mediaMessage.content).assetId !== asset.id)
  throw new Error("plaintext media metadata missing");
const downloaded = await request(`/api/media/${asset.id}/content`, {
  token: receiver.accessToken,
});
if (!Buffer.isBuffer(downloaded) || !downloaded.equals(original))
  throw new Error("media was not stored as original file bytes");

const received = await request(
  `/api/conversations/${conversation.id}/messages?after=0&limit=100`,
  { token: receiver.accessToken }
);
if (!received.some(item => item.id === message.id && item.content === text))
  throw new Error("receiver plaintext message missing");
const list = await request("/api/conversations", {
  token: receiver.accessToken,
});
const preview = list.find(
  item => item.id === conversation.id
)?.lastMessagePreview;
if (preview !== "[图片]")
  throw new Error(`conversation preview invalid: ${preview}`);

const admin = await request("/api/auth/login", {
  method: "POST",
  body: {
    account: "E_Admin",
    password: "Heibai@99",
    deviceName: "Plaintext admin smoke",
  },
});
const adminView = await request(
  `/api/admin/conversations/${conversation.id}/messages`,
  { token: admin.accessToken }
);
const adminText = adminView.messages.find(item => item.id === message.id);
const adminMedia = adminView.messages.find(item => item.id === mediaMessage.id);
if (
  !adminText?.plaintextAvailable ||
  adminText.content !== text ||
  !adminMedia?.plaintextAvailable ||
  JSON.parse(adminMedia.content).assetId !== asset.id
)
  throw new Error("admin plaintext message view missing");

console.log(
  `PLAINTEXT_MESSAGES_OK conversation=${conversation.id} text=visible emoji=visible media=original admin=readable`
);
