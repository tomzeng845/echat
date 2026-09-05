import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = String(Date.now()).slice(-8);

async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const session = await request("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    account: `safe${suffix}`,
    password: "SafeArea@99",
    inviteCode: "ECHAT2026",
    displayName: "安全区测试",
    agreementAccepted: true,
    deviceName: "Android safe area smoke",
    deviceId: `safe-area-${suffix}`,
  }),
});

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(
    value => localStorage.setItem("echat.session.v1", JSON.stringify(value)),
    session
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("消息"));
  const layout = await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-inset-top", "30px");
    document.documentElement.style.setProperty(
      "--safe-area-inset-right",
      "8px"
    );
    document.documentElement.style.setProperty(
      "--safe-area-inset-bottom",
      "34px"
    );
    document.documentElement.style.setProperty("--safe-area-inset-left", "8px");
    const main = document.querySelector("main");
    const nav = document.querySelector("nav.fixed");
    const navButton = nav?.querySelector("button");
    if (!main || !nav || !navButton) return { valid: false };
    const mainRect = main.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const buttonRect = navButton.getBoundingClientRect();
    const style = getComputedStyle(document.documentElement);
    return {
      valid:
        mainRect.top >= 30 &&
        mainRect.left >= 8 &&
        mainRect.right <= innerWidth - 8 &&
        mainRect.bottom <= innerHeight - 34 &&
        buttonRect.bottom <= innerHeight - 34 &&
        navRect.left >= 8 &&
        navRect.right <= innerWidth - 8,
      main: {
        top: mainRect.top,
        right: mainRect.right,
        bottom: mainRect.bottom,
        left: mainRect.left,
      },
      nav: {
        top: navRect.top,
        right: navRect.right,
        bottom: navRect.bottom,
        left: navRect.left,
      },
      navButtonBottom: buttonRect.bottom,
      padding: {
        top: style.paddingTop,
        right: style.paddingRight,
        bottom: style.paddingBottom,
        left: style.paddingLeft,
      },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  if (!layout.valid)
    throw new Error(
      `Android safe-area layout invalid: ${JSON.stringify(layout)}`
    );
  console.log(
    `ANDROID_SAFE_AREA_OK viewport=${layout.viewport.width}x${layout.viewport.height} main=${JSON.stringify(layout.main)} navButtonBottom=${layout.navButtonBottom} padding=${JSON.stringify(layout.padding)}`
  );
} finally {
  await browser.close();
}
