import puppeteer from "puppeteer-core";
import { webcrypto } from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-9);
const password = "EChat.Mobile.2026!";

async function request(path, token, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function register(account, displayName) {
  return request("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({
      account,
      password,
      inviteCode: "ECHAT2026",
      displayName,
      agreementAccepted: true,
      deviceName: "Mobile UI smoke",
    }),
  });
}

const recipientAccount = `mobile${suffix}`;
const peerAccount = `peer${suffix}`;
const [recipient, peer] = await Promise.all([
  register(recipientAccount, "手机用户"),
  register(peerAccount, "移动好友"),
]);
const pair = await webcrypto.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  false,
  ["encrypt", "decrypt"]
);
const peerJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
await request("/api/users/me/public-key", peer.accessToken, {
  method: "PUT",
  body: JSON.stringify({ publicKeyJwk: JSON.stringify(peerJwk) }),
});

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const page = await browser.newPage();
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(
    session =>
      localStorage.setItem("echat.session.v1", JSON.stringify(session)),
    recipient
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("消息"));

  await request("/api/contacts/requests", peer.accessToken, {
    method: "POST",
    body: JSON.stringify({
      requestId: `mobile-${suffix}`,
      peerAccount: recipientAccount,
      note: "请通过手机端接收",
      source: "account",
    }),
  });
  await page.evaluate(() =>
    [...document.querySelectorAll("nav button")]
      .find(button => button.textContent?.includes("联系人"))
      ?.click()
  );
  await page.waitForFunction(
    account =>
      document.body.innerText.includes(account) &&
      document.body.innerText.includes("接受"),
    { timeout: 8000 },
    peerAccount
  );

  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find(button => button.textContent?.includes("接受"))
      ?.click()
  );
  await page.waitForFunction(
    account =>
      document.body.innerText.includes(account) &&
      document.body.innerText.includes("发消息"),
    { timeout: 8000 },
    peerAccount
  );

  await page.evaluate(
    account =>
      [...document.querySelectorAll("button")]
        .find(button => button.textContent?.includes(`@${account}`))
        ?.click(),
    peerAccount
  );
  await page.waitForSelector('textarea[placeholder="输入消息"]', {
    visible: true,
    timeout: 8000,
  });
  await page.waitForSelector('button[aria-label="发送消息"]', {
    visible: true,
    timeout: 8000,
  });

  const layout = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="发送消息"]');
    const textarea = document.querySelector('textarea[placeholder="输入消息"]');
    const nav = document.querySelector("nav.fixed");
    if (!button || !textarea) return { valid: false };
    const buttonRect = button.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    return {
      valid:
        buttonRect.width >= 40 &&
        buttonRect.right <= innerWidth &&
        buttonRect.bottom <= innerHeight &&
        textareaRect.width > 160,
      button: {
        left: buttonRect.left,
        top: buttonRect.top,
        right: buttonRect.right,
        bottom: buttonRect.bottom,
      },
      textareaWidth: textareaRect.width,
      bottomNavHidden: !nav,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  if (!layout.valid || !layout.bottomNavHidden)
    throw new Error(
      `mobile composer layout invalid: ${JSON.stringify(layout)}`
    );

  const textarea = await page.$('textarea[placeholder="输入消息"]');
  await textarea.type("手机端发送按钮正常");
  await page.click('button[aria-label="发送消息"]');
  await page.waitForFunction(
    () => document.body.innerText.includes("手机端发送按钮正常"),
    { timeout: 8000 }
  );
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="打开表情面板"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await page.click('button[aria-label="打开表情面板"]');
  await page.waitForSelector('[role="dialog"][aria-label="选择表情"]', {
    visible: true,
    timeout: 4000,
  });
  const emojiPanelLayout = await page.evaluate(() => {
    const panel = document.querySelector(
      '[role="dialog"][aria-label="选择表情"]'
    );
    if (!panel) return { valid: false };
    const rect = panel.getBoundingClientRect();
    return {
      valid:
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    };
  });
  if (!emojiPanelLayout.valid)
    throw new Error(
      `emoji panel outside viewport: ${JSON.stringify(emojiPanelLayout)}`
    );
  await page.type('input[aria-label="搜索表情"]', "爱心");
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some(button =>
      button.getAttribute("aria-label")?.includes("发送表情 ❤️")
    )
  );
  await page.screenshot({
    path: "/home/ubuntu/screenshots/echat-emoji-panel-mobile.png",
    fullPage: false,
  });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .find(button =>
        button.getAttribute("aria-label")?.includes("发送表情 ❤️")
      )
      ?.click()
  );
  await page.waitForSelector('[role="dialog"][aria-label="选择表情"]', {
    hidden: true,
    timeout: 4000,
  });
  await page.waitForFunction(() => document.body.innerText.includes("❤️"), {
    timeout: 8000,
  });
  const directConversation = (
    await request("/api/conversations", recipient.accessToken)
  ).find(item => item.type === "Direct" && item.name === "移动好友");
  if (!directConversation || directConversation.lastMessagePreview !== "[表情]")
    throw new Error(
      `emoji preview missing: ${JSON.stringify(directConversation)}`
    );
  const emojiMessages = await request(
    `/api/conversations/${directConversation.id}/messages?after=0&limit=100`,
    recipient.accessToken
  );
  if (!emojiMessages.some(message => message.kind === "Emoji"))
    throw new Error("dedicated Emoji message was not persisted");
  console.log(
    "MEDIA_PROBE",
    await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const tracks = stream.getAudioTracks().length;
        stream.getTracks().forEach(track => track.stop());
        return { ok: true, tracks };
      } catch (cause) {
        return {
          ok: false,
          name: cause instanceof Error ? cause.name : "Unknown",
          message: cause instanceof Error ? cause.message : String(cause),
        };
      }
    })
  );
  await new Promise(resolve => setTimeout(resolve, 3000));
  const callButtonClicked = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="语音通话"]');
    button?.click();
    return Boolean(button);
  });
  if (!callButtonClicked) throw new Error("Voice call button is missing");
  await new Promise(resolve => setTimeout(resolve, 1200));
  console.log(
    "CALL_UI_STATE",
    await page.evaluate(() => ({
      text: document.body.innerText.slice(-500).replaceAll("\n", " | "),
      toasts: Array.from(document.querySelectorAll("[data-sonner-toast]")).map(
        item => item.textContent
      ),
    }))
  );
  await page.waitForSelector('button[aria-label="打开扬声器"]', {
    visible: true,
    timeout: 8000,
  });
  await page.click('button[aria-label="打开扬声器"]');
  await page.waitForSelector('button[aria-label="关闭扬声器"]', {
    visible: true,
    timeout: 4000,
  });
  await page.click('button[aria-label="结束通话"]');
  await page.waitForSelector('button[aria-label="语音通话"]', {
    visible: true,
    timeout: 4000,
  });
  await page.screenshot({
    path: "/home/ubuntu/screenshots/echat-mobile-send-fixed.png",
    fullPage: false,
  });
  console.log(
    `MOBILE_CHAT_OK request=${peerAccount} button=${layout.button.left},${layout.button.top}-${layout.button.right},${layout.button.bottom} textarea=${layout.textareaWidth} viewport=${layout.viewport.width}x${layout.viewport.height} emoji=searched:sent:preview speaker=toggle`
  );
} finally {
  await browser.close();
}
