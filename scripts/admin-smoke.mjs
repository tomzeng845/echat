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
if (overview.version !== "0.8.9" || overview.metrics.users < 1)
  throw new Error("admin overview invalid");

const managedAccount = `managed${suffix}`;
const managed = await fetchApi("/api/admin/users", token, {
  method: "POST",
  body: JSON.stringify({
    account: managedAccount,
    password: userPassword,
    displayName: "受管测试用户",
    mobilePhone: "13800138000",
    inviteSource: "后台测试",
  }),
});
await fetchApi(`/api/admin/users/${managedAccount}/profile`, token, {
  method: "PUT",
  body: JSON.stringify({
    displayName: "已更新测试用户",
    mobilePhone: "13900139000",
    inviteSource: "API_IMPORT",
  }),
});
await fetchApi(`/api/admin/users/${managedAccount}/security`, token, {
  method: "PUT",
  body: JSON.stringify({
    realNameVerified: true,
    enterpriseVerified: true,
    redFlagged: true,
    riskLevel1: 12,
    riskLevel2: 7,
    accountLocked: true,
    loginLocked: true,
    bankCardLocked: true,
    reason: "automated security test",
  }),
});
await fetchApi(
  "/api/auth/login",
  null,
  {
    method: "POST",
    body: JSON.stringify({ account: managedAccount, password: userPassword }),
  },
  403
);
await fetchApi(`/api/admin/users/${managedAccount}/security`, token, {
  method: "PUT",
  body: JSON.stringify({
    accountLocked: false,
    loginLocked: false,
    reason: "unlock",
  }),
});
const managedPage = await fetchApi(
  `/api/admin/users?page=1&pageSize=20&search=${managedAccount}&realNameVerified=true&redFlagged=true`,
  token
);
if (
  managedPage.total !== 1 ||
  managedPage.items[0].mobilePhone !== "13900139000" ||
  managedPage.items[0].riskLevel1 !== 12
)
  throw new Error("advanced user search failed");
const copyAccount = `copy${suffix}`;
await fetchApi(`/api/admin/users/${managedAccount}/duplicate`, token, {
  method: "POST",
  body: JSON.stringify({
    account: copyAccount,
    password: userPassword,
    displayName: "复制测试用户",
  }),
});
await fetchApi("/api/admin/users/batch", token, {
  method: "POST",
  body: JSON.stringify({
    users: [
      {
        account: `batcha${suffix}`,
        password: userPassword,
        displayName: "批量A",
      },
      {
        account: `batchb${suffix}`,
        password: userPassword,
        displayName: "批量B",
      },
    ],
  }),
});
await fetchApi(
  `/api/admin/users/${managedAccount}/password`,
  token,
  {
    method: "PUT",
    body: JSON.stringify({ password: `${userPassword}New` }),
  },
  204
);
await fetchApi(
  "/api/auth/login",
  null,
  {
    method: "POST",
    body: JSON.stringify({ account: managedAccount, password: userPassword }),
  },
  401
);
const managedActive = await fetchApi("/api/auth/login", null, {
  method: "POST",
  body: JSON.stringify({
    account: managedAccount,
    password: `${userPassword}New`,
  }),
});
await fetchApi(`/api/admin/users/${managedAccount}/security`, token, {
  method: "PUT",
  body: JSON.stringify({
    cancellationEnabled: true,
    reason: "cancellation test",
  }),
});
await fetchApi("/api/auth/me", managedActive.accessToken, {}, 401);
await fetchApi(`/api/admin/users/${managedAccount}/security`, token, {
  method: "PUT",
  body: JSON.stringify({
    cancellationEnabled: false,
    reason: "restore cancellation",
  }),
});
await fetchApi(`/api/admin/users/${managedAccount}/profile`, token, {
  method: "PUT",
  body: JSON.stringify({ loginIpRestriction: "203.0.113.25" }),
});
await fetchApi(
  "/api/auth/login",
  null,
  {
    method: "POST",
    body: JSON.stringify({
      account: managedAccount,
      password: `${userPassword}New`,
    }),
  },
  403
);
await fetchApi(`/api/admin/users/${managedAccount}/profile`, token, {
  method: "PUT",
  body: JSON.stringify({ loginIpRestriction: "" }),
});
const exportResponse = await fetch(
  `${base}/api/admin/users/export?pageSize=20&search=${managedAccount}`,
  {
    headers: { Authorization: `Bearer ${token}` },
  }
);
if (
  !exportResponse.ok ||
  !(await exportResponse.text()).includes(managedAccount)
)
  throw new Error("user export failed");

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
if (users.total !== 1 || users.items.length !== 1)
  throw new Error("user search failed");
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
if (
  !(await fetchApi(`/api/admin/users/${normalAccount}/same-ip`, token)).length
)
  throw new Error("same IP user detection failed");

const inviteCode = `A${suffix.slice(-7)}`.toUpperCase();
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
await fetchApi("/api/admin/contacts", token, {}, 410);

const moduleCases = [
  ["system.roles", "自动角色", "permissions", "users:read"],
  ["system.announcements", "自动公告", "content", "E聊后台自动化公告"],
  ["chat.customer-service", "自动客服", "account", normalAccount],
  ["chat.group-speech", "群发言规则", "content", "E聊群发言测试"],
  ["chat.robots", "欢迎机器人", "content", "欢迎加入 E聊"],
  ["chat.red-packet-bot", "红包机器人", "rule", "仅提醒，不自动领取"],
  ["chat.group-invites", "自动群邀请码", "code", `GROUP_${suffix}`],
];
for (const [module, name, field, value] of moduleCases) {
  const record = await fetchApi(`/api/admin/modules/${module}`, token, {
    method: "POST",
    body: JSON.stringify({ name, status: "Active", data: { [field]: value } }),
  });
  const list = await fetchApi(`/api/admin/modules/${module}`, token);
  if (!list.some(item => item.id === record.id))
    throw new Error(`module ${module} save failed`);
}
await fetchApi(
  "/api/admin/modules/system.roles",
  token,
  {
    method: "POST",
    body: JSON.stringify({
      name: "越权角色",
      status: "Active",
      data: { permissions: "root:*" },
    }),
  },
  400
);

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
const transactions = await fetchApi(
  `/api/admin/fund/transactions?page=1&pageSize=20&search=${normalAccount}`,
  token
);
if (!transactions.total) throw new Error("transaction details missing");

const operatorAccount = `operator${suffix}`;
await fetchApi("/api/admin/operators", token, {
  method: "POST",
  body: JSON.stringify({
    account: operatorAccount,
    password: userPassword,
    displayName: "管理测试账号",
    role: "Admin",
  }),
});
if (
  !(await fetchApi("/api/admin/operators", token)).some(
    item => item.account === operatorAccount
  )
)
  throw new Error("operator missing");
const operatorInUsers = await fetchApi(
  `/api/admin/users?page=1&pageSize=20&search=${operatorAccount}`,
  token
);
if (operatorInUsers.total !== 0)
  throw new Error("admin leaked into normal user management");
await fetchApi(
  `/api/admin/operators/${operatorAccount}`,
  token,
  {
    method: "DELETE",
  },
  204
);

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
await fetchApi("/api/admin/feedback/seen", token, {
  method: "POST",
  body: JSON.stringify({ ids: [feedback.id] }),
});
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
const uploadedImage = await fetchApi("/api/admin/images", token, {
  method: "POST",
  body: imageForm,
});
await fetchApi(`/api/admin/images/${uploadedImage.id}`, token, {
  method: "PUT",
  body: JSON.stringify({
    name: "运营测试图",
    status: "Active",
    data: { category: "公告", tags: "测试,运营" },
  }),
});
const imageRows = await fetchApi("/api/admin/modules/system.images", token);
if (
  !imageRows.some(
    item => item.id === uploadedImage.id && item.data.category === "公告"
  )
)
  throw new Error("admin image missing");
await fetchApi(
  `/api/admin/images/${uploadedImage.id}`,
  token,
  { method: "DELETE" },
  204
);
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

  await page.evaluate(() => {
    const group = [...document.querySelectorAll("button")].find(item =>
      item.textContent?.trim().startsWith("账户系统")
    );
    const users = group?.parentElement
      ? [...group.parentElement.querySelectorAll("button")].find(
          item => item.textContent?.trim() === "用户管理"
        )
      : null;
    users?.click();
  });
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("批量新增账号") &&
      document.body.innerText.includes("账户余额") &&
      document.body.innerText.includes("最后节点IP"),
    { timeout: 10000 }
  );
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find(item => item.textContent?.trim() === "新增用户")
      ?.click()
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input[placeholder*="初始密码"]'),
    { timeout: 5000 }
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find(item => item.textContent?.trim() === "取消")
      ?.click()
  );
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find(item => item.textContent?.trim() === "批量新增账号")
      ?.click()
  );
  await page.waitForFunction(
    () => document.querySelector('[role="dialog"] textarea'),
    { timeout: 5000 }
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find(item => item.textContent?.trim() === "取消")
      ?.click()
  );
  const menuCoverage = await page.evaluate(() => ({
    rows: document.querySelectorAll("tbody tr").length,
    operationButtons: [...document.querySelectorAll("tbody button")].filter(
      item => item.textContent?.trim() === "操作"
    ).length,
  }));
  if (!menuCoverage.rows || menuCoverage.rows !== menuCoverage.operationButtons)
    throw new Error("not every account has an operation menu");
  const openFirstOperation = async () => {
    await page.evaluate(() =>
      [...document.querySelectorAll("tbody button")]
        .find(item => item.textContent?.trim() === "操作")
        ?.click()
    );
    await page.waitForSelector(".user-action-menu");
  };
  await openFirstOperation();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("同IP会员检测") &&
      document.body.innerText.includes("修改邀请码") &&
      document.body.innerText.includes("状态变更") &&
      document.body.innerText.includes("登录密码"),
    { timeout: 5000 }
  );
  const anchoredMenu = await page.evaluate(() => {
    const button = [...document.querySelectorAll("tbody button")].find(
      item => item.textContent?.trim() === "操作"
    );
    const menu = document.querySelector(".user-action-menu");
    if (!button || !menu) return null;
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    return {
      verticalGap: Math.abs(menuRect.top - buttonRect.top),
      horizontalGap: Math.min(
        Math.abs(menuRect.left - buttonRect.right),
        Math.abs(buttonRect.left - menuRect.right)
      ),
    };
  });
  if (
    !anchoredMenu ||
    anchoredMenu.verticalGap > 12 ||
    anchoredMenu.horizontalGap > 12
  )
    throw new Error("operation menu is not anchored beside its button");
  await page.mouse.click(1000, 75);
  await page.waitForFunction(
    () => !document.querySelector(".user-action-menu"),
    { timeout: 3000 }
  );
  await openFirstOperation();
  await page.evaluate(() =>
    [...document.querySelectorAll(".user-action-menu button")]
      .find(item => item.textContent?.trim() === "状态变更")
      ?.click()
  );
  await page.waitForSelector(".user-status-submenu", { timeout: 5000 });
  await new Promise(resolve => setTimeout(resolve, 120));
  const statusMenu = await page.evaluate(() => {
    const menu = document.querySelector(".user-status-submenu");
    if (!menu) return null;
    const rect = menu.getBoundingClientRect();
    const buttons = [...menu.querySelectorAll("button")];
    return {
      labels: buttons.map(button => button.textContent?.trim()),
      width: rect.width,
      height: rect.height,
      exposed: buttons.map(button => {
        const buttonRect = button.getBoundingClientRect();
        const top = document.elementFromPoint(
          buttonRect.left + buttonRect.width / 2,
          buttonRect.top + buttonRect.height / 2
        );
        return top === button || button.contains(top);
      }),
    };
  });
  const expectedStatusItems = [
    "强制下线",
    "账户锁定",
    "登录锁定",
    "银行卡锁定",
    "注销开启",
    "设置红号",
  ];
  if (
    !statusMenu ||
    statusMenu.width < 100 ||
    statusMenu.height < 150 ||
    !expectedStatusItems.every(label => statusMenu.labels.includes(label)) ||
    statusMenu.exposed.some(value => !value)
  )
    throw new Error(`status menu invalid: ${JSON.stringify(statusMenu)}`);
  await page.screenshot({
    path: "/home/ubuntu/screenshots/echat-admin-user-menu-0.8.0.png",
    fullPage: false,
  });
  await page.evaluate(() =>
    [...document.querySelectorAll(".user-action-menu > button")]
      .find(item => item.textContent?.includes("同IP会员检测"))
      ?.click()
  );
  await page.waitForSelector('[data-user-operation-dialog="sameIp"]');
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find(item => item.textContent?.trim() === "关闭")
      ?.click()
  );
  await openFirstOperation();
  await page.evaluate(() =>
    [...document.querySelectorAll(".user-action-menu > button")]
      .find(item => item.textContent?.trim() === "修改邀请码")
      ?.click()
  );
  await page.waitForSelector('[data-user-operation-dialog="inviteSource"]');
  await page.screenshot({
    path: "/home/ubuntu/screenshots/echat-admin-user-operation-dialog-0.8.0.png",
    fullPage: false,
  });
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find(item => item.textContent?.trim() === "取消")
      ?.click()
  );
  await openFirstOperation();
  await page.evaluate(() =>
    [...document.querySelectorAll(".user-action-menu > button")]
      .find(item => item.textContent?.includes("登录密码"))
      ?.click()
  );
  await page.waitForSelector('[data-user-operation-dialog="password"]');
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find(item => item.textContent?.trim() === "取消")
      ?.click()
  );
  await openFirstOperation();
  await page.evaluate(() =>
    [...document.querySelectorAll(".user-action-menu button")]
      .find(item => item.textContent?.trim() === "状态变更")
      ?.click()
  );
  await page.waitForSelector(".user-status-submenu");
  await page.evaluate(() =>
    [...document.querySelectorAll(".user-status-submenu button")]
      .find(item => item.textContent?.includes("银行卡锁定"))
      ?.click()
  );
  await page.waitForSelector('[data-user-operation-dialog="bankCardLocked"]');
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find(item => item.textContent?.trim() === "取消")
      ?.click()
  );

  const menuGroups = {
    账户系统: [
      "用户管理",
      "登录日志",
      "离线日志",
      "登录失败IP统计",
      "意见反馈",
      "邀请码设置",
    ],
    资金系统: ["额度增减科目", "额度增减记录", "交易明细"],
    管理系统: [
      "管理账号",
      "登录日志",
      "角色管理",
      "公告管理",
      "图片上传",
      "操作日志",
      "报错日志",
    ],
    聊天系统: [
      "会话管理",
      "客服管理",
      "群管理",
      "群发言",
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
    path: "/home/ubuntu/screenshots/echat-admin-0.7-desktop.png",
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
  await page.evaluate(() => {
    const account = [...document.querySelectorAll("button")].find(item =>
      item.textContent?.trim().startsWith("账户系统")
    );
    account?.click();
    const users = account?.parentElement
      ? [...account.parentElement.querySelectorAll("button")].find(
          item => item.textContent?.trim() === "用户管理"
        )
      : null;
    users?.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("账户余额"),
    {
      timeout: 5000,
    }
  );
  const mobileLayout = await page.evaluate(() => {
    const table = document.querySelector("table");
    const scroller = table?.parentElement;
    return {
      pageFits: document.documentElement.scrollWidth <= window.innerWidth + 2,
      tableScrollable: Boolean(
        scroller && scroller.scrollWidth > scroller.clientWidth
      ),
    };
  });
  if (!mobileLayout.pageFits || !mobileLayout.tableScrollable)
    throw new Error("mobile user table layout invalid");
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
    path: "/home/ubuntu/screenshots/echat-admin-0.7-mobile.png",
    fullPage: false,
  });
} finally {
  await browser.close();
}

console.log(
  `ADMIN_089_OK modules=${moduleCases.length} pages=24 users=${users.total} audits=${audits.length} role_guard=403 menu_anchor=button outside_click=closed viewports=1440x900,390x844`
);
