import puppeteer from "puppeteer-core";
import * as signalR from "@microsoft/signalr";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-8);
const adminPassword = "Heibai@99";
const userPassword = "EChat.Admin.Test@99";

async function fetchApi(path, token, init = {}, expected = 200, attempt = 0) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  if (!(init.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, { ...init, headers });
  if (response.status === 429 && attempt < 5) {
    const retryAfter = Math.max(
      1,
      Number(response.headers.get("retry-after") || 12)
    );
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return fetchApi(path, token, init, expected, attempt + 1);
  }
  if (response.status !== expected)
    throw new Error(
      `${path}: expected ${expected}, got ${response.status} ${await response.text()}`
    );
  const text = response.status === 204 ? "" : await response.text();
  return text ? JSON.parse(text) : null;
}

await fetchApi(
  "/api/auth/login",
  null,
  {
    method: "POST",
    body: JSON.stringify({
      account: "unknown-admin-test",
      password: "wrong-pass",
      deviceName: "Failure smoke",
    }),
  },
  401
);
const admin = await fetchApi("/api/auth/login", null, {
  method: "POST",
  body: JSON.stringify({
    account: "E_Admin",
    password: adminPassword,
    deviceName: "Admin API smoke",
  }),
});
if (!admin.accessToken || admin.user?.role !== "Admin" || admin.requiresTotp)
  throw new Error("preview admin login failed");
const token = admin.accessToken;
const overview = await fetchApi("/api/admin/overview", token);
if (overview.version !== "0.5.0" || overview.metrics.users < 1)
  throw new Error("admin overview invalid");

const normalAccount = `adminuser${suffix}`;
const invitedAccount = `invite${suffix}`;
const normal = await fetchApi("/api/auth/register", null, {
  method: "POST",
  body: JSON.stringify({
    account: normalAccount,
    password: userPassword,
    inviteCode: "ECHAT2026",
    displayName: "后台测试用户",
    agreementAccepted: true,
  }),
});
await fetchApi("/api/admin/overview", normal.accessToken, {}, 403);
let users = await fetchApi(`/api/admin/users?search=${normalAccount}`, token);
if (users.length !== 1) throw new Error("user search failed");
await fetchApi(`/api/admin/users/${normalAccount}/status`, token, {
  method: "POST",
  body: JSON.stringify({ status: "Disabled", reason: "automated test" }),
});
await fetchApi(
  "/api/auth/login",
  null,
  {
    method: "POST",
    body: JSON.stringify({ account: normalAccount, password: userPassword }),
  },
  403
);
await fetchApi(`/api/admin/users/${normalAccount}/status`, token, {
  method: "POST",
  body: JSON.stringify({ status: "Active", reason: "restore" }),
});
const normalActive = await fetchApi("/api/auth/login", null, {
  method: "POST",
  body: JSON.stringify({ account: normalAccount, password: userPassword }),
});

const inviteCode = `ADM${suffix}`.toUpperCase();
await fetchApi("/api/admin/invites", token, {
  method: "POST",
  body: JSON.stringify({ code: inviteCode, maxUses: 2, isActive: true }),
});
const invited = await fetchApi("/api/auth/register", null, {
  method: "POST",
  body: JSON.stringify({
    account: invitedAccount,
    password: userPassword,
    inviteCode,
    displayName: "邀请码用户",
    agreementAccepted: true,
  }),
});
await fetchApi("/api/contacts/requests", normalActive.accessToken, {
  method: "POST",
  body: JSON.stringify({
    requestId: `friend-${suffix}`,
    peerAccount: invitedAccount,
    note: "管理测试",
    source: "account",
  }),
});
const request = (
  await fetchApi("/api/contacts/requests", invited.accessToken)
).find(item => item.senderId === normalActive.user.id);
await fetchApi(
  `/api/contacts/requests/${request.id}/accept`,
  invited.accessToken,
  { method: "POST" },
  204
);
await fetchApi("/api/conversations/direct", normalActive.accessToken, {
  method: "POST",
  body: JSON.stringify({ peerAccount: invitedAccount }),
});
if (!(await fetchApi("/api/admin/conversations", token)).length)
  throw new Error("conversation admin list missing");
if ((await fetchApi("/api/admin/contacts", token)).length < 2)
  throw new Error("contacts admin list missing");

const moduleCases = [
  ["fund.subjects", "自动科目", "code", `AUTO_${suffix}`],
  ["system.roles", "自动角色", "permissions", "users:read"],
  ["system.resources", "自动资源", "path", "admin.auto"],
  ["system.settings", "自动配置", "value", "enabled"],
  ["system.push", "小米推送", "provider", "xiaomi"],
  ["system.announcements", "自动公告", "content", "E聊后台自动化公告"],
  ["chat.customer-service", "自动客服", "account", normalAccount],
  ["chat.tasks", "自动任务", "schedule", "0 9 * * *"],
  ["chat.sms", "验证码短信", "template", "验证码 ${code}"],
  ["chat.robots", "欢迎机器人", "content", "欢迎加入 E聊"],
  ["chat.red-packet-bot", "红包机器人", "rule", "仅提醒，不自动领取"],
  ["chat.group-invites", "自动群邀请码", "code", `GROUP_${suffix}`],
];
let taskId = "";
for (const [module, name, field, value] of moduleCases) {
  const record = await fetchApi(`/api/admin/modules/${module}`, token, {
    method: "POST",
    body: JSON.stringify({ name, status: "Active", data: { [field]: value } }),
  });
  if (module === "chat.tasks") taskId = record.id;
  const list = await fetchApi(`/api/admin/modules/${module}`, token);
  if (!list.some(item => item.id === record.id))
    throw new Error(`module ${module} save failed`);
}
await fetchApi(`/api/admin/tasks/${taskId}/run`, token, { method: "POST" });
if (!(await fetchApi("/api/admin/modules/chat.task-logs", token)).length)
  throw new Error("task log missing");

await fetchApi("/api/admin/wallet/adjust", token, {
  method: "POST",
  body: JSON.stringify({
    account: normalAccount,
    amount: 88.5,
    subject: "测试充值",
    note: "自动化",
  }),
});
const wallets = await fetchApi("/api/admin/wallets", token);
if (wallets.find(item => item.account === normalAccount)?.balance !== "88.50")
  throw new Error("wallet balance incorrect");
if (!(await fetchApi("/api/admin/modules/fund.adjustments", token)).length)
  throw new Error("fund transaction missing");

const operatorAccount = `operator${suffix}`;
await fetchApi("/api/admin/operators", token, {
  method: "POST",
  body: JSON.stringify({
    account: operatorAccount,
    password: userPassword,
    displayName: "运营测试账号",
    role: "Operator",
  }),
});
if (
  !(await fetchApi("/api/admin/operators", token)).some(
    item => item.account === operatorAccount
  )
)
  throw new Error("operator missing");

await fetchApi("/api/feedback", normalActive.accessToken, {
  method: "POST",
  body: JSON.stringify({
    name: "建议增加夜间模式",
    data: { contact: normalAccount },
  }),
});
const feedback = (
  await fetchApi("/api/admin/modules/account.feedback", token)
)[0];
await fetchApi(`/api/admin/feedback/${feedback.id}/decision`, token, {
  method: "POST",
  body: JSON.stringify({ status: "Resolved", reply: "已记录" }),
});
const loginLogs = await fetchApi("/api/admin/login-logs", token);
const failureStats = await fetchApi("/api/admin/login-failure-stats", token);
if (!loginLogs.length || !failureStats.length)
  throw new Error("login analytics missing");

const noticeConnection = new signalR.HubConnectionBuilder()
  .withUrl(`${base}/hubs/chat`, {
    accessTokenFactory: () => normalActive.accessToken,
  })
  .build();
const noticeReceived = new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("admin.notice realtime timeout")),
    8000
  );
  noticeConnection.on("admin.notice", notice => {
    clearTimeout(timer);
    resolve(notice);
  });
});
await noticeConnection.start();
await fetchApi("/api/admin/bulk-messages", token, {
  method: "POST",
  body: JSON.stringify({ audience: "all", content: "E聊 0.5.0 后台群发测试" }),
});
await noticeReceived;
await noticeConnection.stop();
if (!(await fetchApi("/api/admin/modules/chat.bulk-messages", token)).length)
  throw new Error("bulk message record missing");
const imageForm = new FormData();
imageForm.append(
  "file",
  new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wlq1ioAAAAASUVORK5CYII=",
        "base64"
      ),
    ],
    { type: "image/png" }
  ),
  "admin-test.png"
);
await fetchApi("/api/admin/images", token, { method: "POST", body: imageForm });
if (!(await fetchApi("/api/admin/modules/system.images", token)).length)
  throw new Error("admin image missing");
const audits = await fetchApi("/api/admin/audit", token);
if (audits.length < 10) throw new Error("audit log incomplete");

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => document.body.innerText.includes("使用预览管理员一键登录"),
    { timeout: 10000 }
  );
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find(button => button.textContent?.includes("使用预览管理员一键登录"))
      ?.click()
  );
  await page.waitForFunction(
    () => document.body.innerText.includes("四大业务后台均已连接"),
    { timeout: 10000 }
  );

  const menuGroups = {
    账户系统: [
      "用户管理",
      "登录日志",
      "离线日志",
      "登录失败IP统计",
      "意见反馈",
    ],
    资金系统: ["额度增减科目", "额度增减记录", "交易明细"],
    管理系统: [
      "管理账号",
      "登录日志",
      "角色管理",
      "资源管理",
      "系统配置",
      "安卓厂商推送设置",
      "公告管理",
      "图片上传",
      "操作日志",
      "报错日志",
    ],
    聊天系统: [
      "会话管理",
      "客服管理",
      "定时任务",
      "定时任务日志",
      "群监控",
      "群发言",
      "通讯录",
      "短信管理",
      "机器人发信息",
      "抢红包机器人",
      "群邀请码",
    ],
  };
  for (const [group, pages] of Object.entries(menuGroups)) {
    await page.evaluate(groupName => {
      const button = [...document.querySelectorAll("button")].find(item =>
        item.textContent?.trim().startsWith(groupName)
      );
      const container = button?.parentElement;
      if (
        button &&
        container &&
        ![...container.querySelectorAll("button")].some(
          item => item !== button && item.offsetParent !== null
        )
      )
        button.click();
    }, group);
    for (const label of pages) {
      await page.evaluate(
        (groupName, pageLabel) => {
          const groupButton = [...document.querySelectorAll("button")].find(
            item => item.textContent?.trim().startsWith(groupName)
          );
          const target = groupButton?.parentElement
            ? [...groupButton.parentElement.querySelectorAll("button")].find(
                item =>
                  item !== groupButton && item.textContent?.trim() === pageLabel
              )
            : null;
          target?.click();
        },
        group,
        label
      );
      await page.waitForFunction(
        label =>
          [...document.querySelectorAll("h1")].some(
            item => item.textContent?.trim() === label
          ),
        { timeout: 5000 },
        label
      );
    }
  }
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find(item => item.textContent?.trim().startsWith("管理系统"))
      ?.click()
  );
  await page.screenshot({
    path: "/home/ubuntu/screenshots/echat-admin-0.5-desktop.png",
    fullPage: false,
  });

  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("首页"), {
    timeout: 10000,
  });
  await page.evaluate(() =>
    document.querySelector("svg.lucide-menu")?.closest("button")?.click()
  );
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find(item => item.textContent?.trim().startsWith("聊天系统"))
      ?.click()
  );
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.screenshot({
    path: "/home/ubuntu/screenshots/echat-admin-0.5-mobile.png",
    fullPage: false,
  });
} finally {
  await browser.close();
}

console.log(
  `ADMIN_050_OK modules=${moduleCases.length} pages=30 users=${users.length} audits=${audits.length} role_guard=403 viewports=1440x900,390x844`
);
