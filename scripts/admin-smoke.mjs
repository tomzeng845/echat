import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-8);
const adminAccount = "E_Admin";
const adminPassword = "Heibai@99";
const userPassword = "EChat.Admin.Test@99";

async function fetchApi(path, token, init = {}, expected = 200) {
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status} ${await response.text()}`);
  const text = response.status === 204 ? "" : await response.text();
  return text ? JSON.parse(text) : null;
}

const admin = await fetchApi("/api/auth/login", null, {
  method: "POST",
  body: JSON.stringify({ account: adminAccount, password: adminPassword, deviceName: "Admin API smoke" }),
});
if (!admin.accessToken || admin.user?.role !== "Admin" || admin.requiresTotp) throw new Error("development bootstrap admin login failed");

const overview = await fetchApi("/api/admin/overview", admin.accessToken);
if (overview.version !== "0.4.2" || overview.metrics.users < 1) throw new Error("admin overview metrics invalid");

const normalAccount = `adminuser${suffix}`;
const normal = await fetchApi("/api/auth/register", null, {
  method: "POST",
  body: JSON.stringify({ account: normalAccount, password: userPassword, inviteCode: "ECHAT2026", displayName: "后台测试用户", agreementAccepted: true, deviceName: "Admin smoke user" }),
});
await fetchApi("/api/admin/overview", normal.accessToken, {}, 403);

const users = await fetchApi(`/api/admin/users?search=${normalAccount}`, admin.accessToken);
if (users.length !== 1 || users[0].account !== normalAccount) throw new Error("admin user search failed");

await fetchApi(`/api/admin/users/${normalAccount}/status`, admin.accessToken, { method: "POST", body: JSON.stringify({ status: "Disabled", reason: "automated test" }) });
await fetchApi("/api/auth/login", null, { method: "POST", body: JSON.stringify({ account: normalAccount, password: userPassword, deviceName: "Restricted login" }) }, 403);
await fetchApi(`/api/admin/users/${normalAccount}/status`, admin.accessToken, { method: "POST", body: JSON.stringify({ status: "Active", reason: "automated restore" }) });
const normalActive = await fetchApi("/api/auth/login", null, { method: "POST", body: JSON.stringify({ account: normalAccount, password: userPassword, deviceName: "Restored login" }) });

const inviteCode = `ADM${suffix}`.toUpperCase();
const invite = await fetchApi("/api/admin/invites", admin.accessToken, { method: "POST", body: JSON.stringify({ code: inviteCode, maxUses: 2, isActive: true }) });
if (invite.code !== inviteCode || invite.maxUses !== 2) throw new Error("admin invite creation failed");
const invitedAccount = `invite${suffix}`;
const invited = await fetchApi("/api/auth/register", null, { method: "POST", body: JSON.stringify({ account: invitedAccount, password: userPassword, inviteCode, displayName: "邀请码用户", agreementAccepted: true, deviceName: "Invite smoke" }) });

await fetchApi("/api/contacts/requests", normalActive.accessToken, { method: "POST", body: JSON.stringify({ requestId: `admin-report-${suffix}`, peerAccount: invitedAccount, note: "举报测试", source: "account" }) });
const friendRequest = (await fetchApi("/api/contacts/requests", invited.accessToken)).find(item => item.senderId === normalActive.user.id);
await fetchApi(`/api/contacts/requests/${friendRequest.id}/accept`, invited.accessToken, { method: "POST" }, 204);
const moment = await fetchApi("/api/moments", normalActive.accessToken, { method: "POST", body: JSON.stringify({ text: "管理后台举报处置测试", visibility: "Friends", mediaAssetIds: [] }) });
const report = await fetchApi(`/api/moments/${moment.id}/reports`, invited.accessToken, { method: "POST", body: JSON.stringify({ reason: "其他", detail: "自动化举报处置测试" }) });
const reports = await fetchApi("/api/admin/reports?status=Submitted", admin.accessToken);
if (!reports.some(item => item.id === report.id)) throw new Error("admin report queue missing submitted report");
await fetchApi(`/api/admin/reports/${report.id}/decision`, admin.accessToken, { method: "POST", body: JSON.stringify({ status: "Resolved", note: "automated resolution" }) });

await fetchApi(`/api/admin/users/${normalAccount}/sessions/revoke`, admin.accessToken, { method: "POST" }, 204);
const audits = await fetchApi("/api/admin/audit", admin.accessToken);
if (audits.length < 5 || !audits.some(item => item.action === "user.status") || !audits.some(item => item.action === "invite.upsert") || !audits.some(item => item.action === "report.decision")) throw new Error("admin audit log incomplete");

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("使用预览管理员一键登录"), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("使用预览管理员一键登录"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("运营概览") && document.body.innerText.includes("用户总数"), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("用户管理"))?.click());
  await page.waitForFunction(account => document.body.innerText.includes(account), { timeout: 10000 }, normalAccount);
  await page.screenshot({ path: "/home/ubuntu/screenshots/echat-admin-users.png", fullPage: false });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("运营概览"), { timeout: 10000 });
  await page.evaluate(() => document.querySelector("svg.lucide-menu")?.closest("button")?.click());
  await page.waitForFunction(() => document.body.innerText.includes("审计日志"), { timeout: 5000 });
  await new Promise(resolve => setTimeout(resolve, 350));
  await page.screenshot({ path: "/home/ubuntu/screenshots/echat-admin-mobile.png", fullPage: false });
} finally {
  await browser.close();
}

console.log(`ADMIN_OK account=${admin.user.account} users>=${overview.metrics.users} invite=${inviteCode} audits=${audits.length} role_guard=403 viewports=1440x900,390x844`);
