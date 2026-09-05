import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-9);
const password = "EChat.Unread.2026!";

async function request(path, token, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function register(account, displayName) {
  return request("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ account, password, inviteCode: "ECHAT2026", displayName, agreementAccepted: true, deviceName: "Unread smoke" }),
  });
}

async function waitForRead(token, conversationId, expected) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await request("/api/conversations", token);
    const item = list.find(value => value.id === conversationId);
    if (item?.readSequence === expected) return item;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`readSequence did not reach ${expected}`);
}

const senderAccount = `unreads${suffix}`;
const recipientAccount = `unreadr${suffix}`;
const [sender, recipient] = await Promise.all([register(senderAccount, "未读发送者"), register(recipientAccount, "未读接收者")]);
await request("/api/contacts/requests", sender.accessToken, {
  method: "POST",
  body: JSON.stringify({ requestId: `unread-${suffix}`, peerAccount: recipientAccount, note: "未读测试", source: "account" }),
});
const friendRequest = (await request("/api/contacts/requests", recipient.accessToken))[0];
await request(`/api/contacts/requests/${friendRequest.id}/accept`, recipient.accessToken, { method: "POST" });
const conversation = await request("/api/conversations/direct", sender.accessToken, {
  method: "POST",
  body: JSON.stringify({ peerAccount: recipientAccount, keyEnvelopes: { [sender.user.id]: "sender-envelope", [recipient.user.id]: "recipient-envelope" } }),
});

for (let sequence = 1; sequence <= 3; sequence += 1) {
  await request(`/api/conversations/${conversation.id}/messages`, sender.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: `unread-${suffix}-${sequence}`, kind: "Text", ciphertext: `cipher-${sequence}`, nonce: "nonce", algorithm: "AES-GCM-256" }),
  });
}

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(session => localStorage.setItem("echat.session.v1", JSON.stringify(session)), recipient);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("未读发送者"));
  const before = await page.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("未读发送者"));
    return { text: row?.textContent || "", unread: [...(row?.querySelectorAll("span") || [])].some(span => span.textContent === "3") };
  });
  if (!before.unread) throw new Error(`expected unread badge 3 before opening: ${JSON.stringify(before)}`);

  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("未读发送者"))?.click());
  await page.waitForSelector('button[aria-label="发送消息"]', { visible: true, timeout: 8000 });
  await waitForRead(recipient.accessToken, conversation.id, 3);

  await request(`/api/conversations/${conversation.id}/messages`, sender.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: `unread-${suffix}-4`, kind: "Text", ciphertext: "cipher-4", nonce: "nonce", algorithm: "AES-GCM-256" }),
  });
  await waitForRead(recipient.accessToken, conversation.id, 4);

  await page.evaluate(() => document.querySelector("svg.lucide-chevron-left")?.closest("button")?.click());
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("未读发送者"));
    return Boolean(row) && ![...row.querySelectorAll("span")].some(span => /^\d+$/.test(span.textContent || ""));
  }, { timeout: 8000 });
  await page.screenshot({ path: "/home/ubuntu/screenshots/echat-unread-cleared.png", fullPage: false });

  const desktopSenderAccount = `unreadd${suffix}`;
  const desktopSender = await register(desktopSenderAccount, "桌面未读好友");
  await request("/api/contacts/requests", desktopSender.accessToken, {
    method: "POST",
    body: JSON.stringify({ requestId: `desktop-unread-${suffix}`, peerAccount: recipientAccount, note: "桌面未读测试", source: "account" }),
  });
  const desktopFriendRequest = (await request("/api/contacts/requests", recipient.accessToken)).find(item => item.senderId === desktopSender.user.id);
  await request(`/api/contacts/requests/${desktopFriendRequest.id}/accept`, recipient.accessToken, { method: "POST" });
  const desktopConversation = await request("/api/conversations/direct", desktopSender.accessToken, {
    method: "POST",
    body: JSON.stringify({ peerAccount: recipientAccount, keyEnvelopes: { [desktopSender.user.id]: "desktop-envelope", [recipient.user.id]: "recipient-envelope" } }),
  });
  await request(`/api/conversations/${desktopConversation.id}/messages`, desktopSender.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: `desktop-${suffix}-1`, kind: "Text", ciphertext: "desktop-cipher-1", nonce: "nonce", algorithm: "AES-GCM-256" }),
  });
  await request(`/api/conversations/${conversation.id}/messages`, sender.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: `unread-${suffix}-5`, kind: "Text", ciphertext: "cipher-5", nonce: "nonce", algorithm: "AES-GCM-256" }),
  });

  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await desktop.goto(base, { waitUntil: "networkidle0" });
  await desktop.evaluate(session => localStorage.setItem("echat.session.v1", JSON.stringify(session)), recipient);
  await desktop.reload({ waitUntil: "networkidle0" });
  await desktop.waitForFunction(() => {
    const row = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("桌面未读好友"));
    return Boolean(row) && [...row.querySelectorAll("span")].some(span => span.textContent === "1");
  }, { timeout: 8000 });
  await desktop.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("桌面未读好友"))?.click());
  await waitForRead(recipient.accessToken, desktopConversation.id, 1);
  await desktop.waitForFunction(() => {
    const row = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("桌面未读好友"));
    return Boolean(row) && ![...row.querySelectorAll("span")].some(span => /^\d+$/.test(span.textContent || ""));
  }, { timeout: 8000 });

  await request(`/api/conversations/${desktopConversation.id}/messages`, desktopSender.accessToken, {
    method: "POST",
    body: JSON.stringify({ clientMessageId: `desktop-${suffix}-2`, kind: "Text", ciphertext: "desktop-cipher-2", nonce: "nonce", algorithm: "AES-GCM-256" }),
  });
  await waitForRead(recipient.accessToken, desktopConversation.id, 2);
  await new Promise(resolve => setTimeout(resolve, 300));
  const desktopUnread = await desktop.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("桌面未读好友"));
    return [...(row?.querySelectorAll("span") || [])].filter(span => /^\d+$/.test(span.textContent || "")).map(span => span.textContent);
  });
  if (desktopUnread.length) throw new Error(`desktop unread badge returned: ${desktopUnread.join(",")}`);
  await desktop.screenshot({ path: "/home/ubuntu/screenshots/echat-desktop-unread-cleared.png", fullPage: false });
  console.log(`UNREAD_CLEAR_OK mobile=3>0 live=4>0 desktop=1>0 live=2>0 viewports=390x844,1280x720`);
} finally {
  await browser.close();
}
