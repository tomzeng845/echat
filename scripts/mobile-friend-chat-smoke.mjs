import puppeteer from "puppeteer-core";
import { webcrypto } from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-9);
const password = "EChat.Mobile.2026!";

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
    body: JSON.stringify({ account, password, inviteCode: "ECHAT2026", displayName, agreementAccepted: true, deviceName: "Mobile UI smoke" }),
  });
}

const recipientAccount = `mobile${suffix}`;
const peerAccount = `peer${suffix}`;
const [recipient, peer] = await Promise.all([register(recipientAccount, "手机用户"), register(peerAccount, "移动好友")]);
const pair = await webcrypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, false, ["encrypt", "decrypt"]);
const peerJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
await request("/api/users/me/public-key", peer.accessToken, { method: "PUT", body: JSON.stringify({ publicKeyJwk: JSON.stringify(peerJwk) }) });

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(session => localStorage.setItem("echat.session.v1", JSON.stringify(session)), recipient);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("消息"));

  await request("/api/contacts/requests", peer.accessToken, {
    method: "POST",
    body: JSON.stringify({ requestId: `mobile-${suffix}`, peerAccount: recipientAccount, note: "请通过手机端接收", source: "account" }),
  });
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(button => button.textContent?.includes("联系人"))?.click());
  await page.waitForFunction(account => document.body.innerText.includes(account) && document.body.innerText.includes("接受"), { timeout: 8000 }, peerAccount);

  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("接受"))?.click());
  await page.waitForFunction(account => document.body.innerText.includes(account) && document.body.innerText.includes("发消息"), { timeout: 8000 }, peerAccount);

  await page.evaluate(account => [...document.querySelectorAll("button")].find(button => button.textContent?.includes(`@${account}`))?.click(), peerAccount);
  await page.waitForSelector('textarea[placeholder="输入消息"]', { visible: true, timeout: 8000 });
  await page.waitForSelector('button[aria-label="发送消息"]', { visible: true, timeout: 8000 });

  const layout = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="发送消息"]');
    const textarea = document.querySelector('textarea[placeholder="输入消息"]');
    const nav = document.querySelector("nav.fixed");
    if (!button || !textarea) return { valid: false };
    const buttonRect = button.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    return {
      valid: buttonRect.width >= 40 && buttonRect.right <= innerWidth && buttonRect.bottom <= innerHeight && textareaRect.width > 160,
      button: { left: buttonRect.left, top: buttonRect.top, right: buttonRect.right, bottom: buttonRect.bottom },
      textareaWidth: textareaRect.width,
      bottomNavHidden: !nav,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  if (!layout.valid || !layout.bottomNavHidden) throw new Error(`mobile composer layout invalid: ${JSON.stringify(layout)}`);

  const textarea = await page.$('textarea[placeholder="输入消息"]');
  await textarea.type("手机端发送按钮正常");
  await page.click('button[aria-label="发送消息"]');
  await page.waitForFunction(() => document.body.innerText.includes("手机端发送按钮正常"), { timeout: 8000 });
  await page.screenshot({ path: "/home/ubuntu/screenshots/echat-mobile-send-fixed.png", fullPage: false });
  console.log(`MOBILE_CHAT_OK request=${peerAccount} button=${layout.button.left},${layout.button.top}-${layout.button.right},${layout.button.bottom} textarea=${layout.textareaWidth} viewport=${layout.viewport.width}x${layout.viewport.height}`);
} finally {
  await browser.close();
}
