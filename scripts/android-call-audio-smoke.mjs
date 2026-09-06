import { webcrypto } from "node:crypto";
import puppeteer from "puppeteer-core";

const base = (process.argv[2] || "http://127.0.0.1:2099").replace(/\/$/, "");
const suffix = String(Date.now()).slice(-8);
const password = "Android.Call@99";
const subtle = webcrypto.subtle;

async function request(
  path,
  { token, deviceId, method = "GET", body, expected = 200 } = {}
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceId ? { "X-EChat-Device-Id": deviceId } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (response.status !== expected)
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function register(account, displayName, deviceId) {
  return request("/api/auth/register", {
    method: "POST",
    body: {
      account,
      password,
      inviteCode: "ECHAT2026",
      displayName,
      agreementAccepted: true,
      deviceName: "Android call audio smoke",
      deviceId,
    },
  });
}

async function waitForPublicKey(account, token, deviceId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${base}/api/users/${account}/public-key`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EChat-Device-Id": deviceId,
      },
    });
    if (response.ok) return response.json();
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Public key was not registered for ${account}`);
}

async function createKey() {
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(key, publicKeyJwk) {
  const publicKey = await subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  return Buffer.from(
    await subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      await subtle.exportKey("raw", key)
    )
  ).toString("base64");
}

const deviceA = `call-a-${suffix}`;
const deviceB = `call-b-${suffix}`;
const accountA = `calla${suffix}`;
const accountB = `callb${suffix}`;
const [authA, authB] = await Promise.all([
  register(accountA, "呼叫方", deviceA),
  register(accountB, "接听方", deviceB),
]);
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
const contextA = await browser.createBrowserContext();
const contextB = await browser.createBrowserContext();
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();

async function loginPage(page, session, deviceId) {
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(
    ({ value, device }) => {
      localStorage.setItem("echat.session.v1", JSON.stringify(value));
      localStorage.setItem("echat.device.v1", device);
    },
    { value: session, device: deviceId }
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("消息"));
}

try {
  await Promise.all([
    loginPage(pageA, authA, deviceA),
    loginPage(pageB, authB, deviceB),
  ]);
  const [bundleA, bundleB] = await Promise.all([
    waitForPublicKey(accountA, authA.accessToken, deviceA),
    waitForPublicKey(accountB, authB.accessToken, deviceB),
  ]);
  const friendRequest = await request("/api/contacts/requests", {
    token: authA.accessToken,
    deviceId: deviceA,
    method: "POST",
    body: {
      requestId: `call-${suffix}`,
      peerAccount: accountB,
      note: "通话音频测试",
      source: "account",
    },
  });
  await request(`/api/contacts/requests/${friendRequest.id}/accept`, {
    token: authB.accessToken,
    deviceId: deviceB,
    method: "POST",
    expected: 204,
  });
  const key = await createKey();
  const conversation = await request("/api/conversations/direct", {
    token: authA.accessToken,
    deviceId: deviceA,
    method: "POST",
    body: {
      peerAccount: accountB,
      keyEnvelopes: {
        [`${authA.user.id}:${deviceA}`]: await seal(key, bundleA.publicKeyJwk),
        [`${authB.user.id}:${deviceB}`]: await seal(key, bundleB.publicKeyJwk),
      },
    },
  });
  await Promise.all([
    pageA.reload({ waitUntil: "networkidle0" }),
    pageB.reload({ waitUntil: "networkidle0" }),
  ]);
  await Promise.all([
    pageA.waitForFunction(
      name => document.body.innerText.includes(name),
      {},
      "接听方"
    ),
    pageB.waitForFunction(
      name => document.body.innerText.includes(name),
      {},
      "呼叫方"
    ),
  ]);
  await pageB.evaluate(() => {
    window.__echatCallAlerts = [];
    window.__echatCallStops = 0;
    window.addEventListener("echat-alert-sound", event =>
      window.__echatCallAlerts.push(event.detail)
    );
    window.addEventListener(
      "echat-alert-sound-stopped",
      () => (window.__echatCallStops += 1)
    );
  });
  await pageA.evaluate(() => {
    window.__echatOutgoingAlerts = [];
    window.__echatOutgoingStops = 0;
    window.addEventListener("echat-alert-sound", event =>
      window.__echatOutgoingAlerts.push(event.detail)
    );
    window.addEventListener(
      "echat-alert-sound-stopped",
      () => (window.__echatOutgoingStops += 1)
    );
  });
  await pageB.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.getUserMedia = async constraints => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      return original(constraints);
    };
  });
  await pageA.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(item =>
      item.textContent?.includes("接听方")
    );
    button?.click();
  });
  await pageA.waitForSelector('button[aria-label="语音通话"]', {
    visible: true,
    timeout: 8000,
  });
  await new Promise(resolve => setTimeout(resolve, 2000));
  await pageA.click('button[aria-label="语音通话"]');
  await pageA.waitForFunction(
    () =>
      window.__echatOutgoingAlerts?.some(item => item.kind === "outgoing-call"),
    { timeout: 4000 }
  );
  await pageB.waitForSelector('button[aria-label="接听通话"]', {
    visible: true,
    timeout: 10000,
  });
  await pageB.waitForFunction(
    () => window.__echatCallAlerts?.some(item => item.kind === "voice-call"),
    { timeout: 4000 }
  );
  await pageB.click('button[aria-label="接听通话"]');
  await pageB.waitForFunction(
    () => document.body.innerText.includes("正在接听…"),
    { timeout: 4000 }
  );
  let preparingCall = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    preparingCall = (
      await request("/api/calls", {
        token: authB.accessToken,
        deviceId: deviceB,
      })
    ).find(item => item.conversationId === conversation.id);
    if (preparingCall?.status === "Ringing" && preparingCall.answering) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (preparingCall?.status !== "Ringing" || !preparingCall.answering)
    throw new Error(
      `CallPrepareAnswer was not persisted: ${JSON.stringify(preparingCall)}`
    );
  await pageA.waitForFunction(() => window.__echatOutgoingStops >= 1, {
    timeout: 4000,
  });
  await Promise.all([
    pageA.waitForSelector("audio", { timeout: 15000 }),
    pageB.waitForSelector("audio", { timeout: 15000 }),
  ]);
  const [audioA, audioB] = await Promise.all(
    [pageA, pageB].map(page =>
      page.evaluate(() => {
        const element = document.querySelector("audio");
        const stream = element?.srcObject;
        return {
          autoplay: Boolean(element?.autoplay),
          muted: Boolean(element?.muted),
          volume: Number(element?.volume ?? 0),
          tracks:
            stream instanceof MediaStream ? stream.getAudioTracks().length : 0,
          enabled:
            stream instanceof MediaStream
              ? stream.getAudioTracks().every(track => track.enabled)
              : false,
        };
      })
    )
  );
  if (
    !audioA.autoplay ||
    !audioB.autoplay ||
    audioA.tracks < 1 ||
    audioB.tracks < 1 ||
    audioA.muted ||
    audioB.muted ||
    audioA.volume !== 1 ||
    audioB.volume !== 1 ||
    !audioA.enabled ||
    !audioB.enabled
  )
    throw new Error(
      `Remote audio is invalid: ${JSON.stringify({ audioA, audioB })}`
    );
  const voiceCall = (
    await request("/api/calls", {
      token: authB.accessToken,
      deviceId: deviceB,
    })
  ).find(item => item.conversationId === conversation.id);
  if (!voiceCall?.id) throw new Error("Active voice call record not found");
  await pageB.evaluate(callId => {
    window.dispatchEvent(
      new CustomEvent("echat-native-call-cleared", { detail: { callId } })
    );
  }, voiceCall.id);
  await new Promise(resolve => setTimeout(resolve, 400));
  if (
    !(await pageB.$('button[aria-label="结束通话"]')) ||
    !(await pageB.$("audio"))
  )
    throw new Error(
      "Native notification clear incorrectly ended accepted call"
    );
  await pageA.click('button[aria-label="打开扬声器"]');
  await pageA.waitForSelector('button[aria-label="关闭扬声器"]', {
    visible: true,
    timeout: 4000,
  });
  await pageA.click('button[aria-label="结束通话"]');
  await pageB.waitForSelector('button[aria-label="结束通话"]', {
    hidden: true,
    timeout: 8000,
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  await pageA.click('button[aria-label="视频通话"]');
  await pageA.waitForFunction(
    () =>
      window.__echatOutgoingAlerts?.filter(
        item => item.kind === "outgoing-call"
      ).length >= 2,
    { timeout: 4000 }
  );
  await pageB.waitForSelector('button[aria-label="接听通话"]', {
    visible: true,
    timeout: 10000,
  });
  await pageB.waitForFunction(
    () => window.__echatCallAlerts?.some(item => item.kind === "video-call"),
    { timeout: 4000 }
  );
  await pageB.click('button[aria-label="接听通话"]');
  await pageA.waitForFunction(() => window.__echatOutgoingStops >= 2, {
    timeout: 4000,
  });
  await Promise.all([
    pageA.waitForSelector('video[data-audio-role="remote"]', {
      timeout: 15000,
    }),
    pageB.waitForSelector('video[data-audio-role="remote"]', {
      timeout: 15000,
    }),
    pageA.waitForSelector('button[aria-label="关闭扬声器"]', {
      visible: true,
      timeout: 8000,
    }),
  ]);
  const videoAudioTracks = await Promise.all(
    [pageA, pageB].map(page =>
      page.evaluate(() => {
        const element = document.querySelector(
          'video[data-audio-role="remote"]'
        );
        const stream = element?.srcObject;
        return {
          tracks:
            stream instanceof MediaStream
              ? stream.getAudioTracks().filter(track => track.enabled).length
              : 0,
          muted: Boolean(element?.muted),
          volume: Number(element?.volume ?? 0),
        };
      })
    )
  );
  if (
    videoAudioTracks.some(
      item => item.tracks < 1 || item.muted || item.volume !== 1
    )
  )
    throw new Error(
      `Video call audio tracks missing: ${JSON.stringify(videoAudioTracks)}`
    );
  const alertState = await pageB.evaluate(() => ({
    kinds: window.__echatCallAlerts.map(item => item.kind),
    stops: window.__echatCallStops,
  }));
  if (
    !alertState.kinds.includes("voice-call") ||
    !alertState.kinds.includes("video-call") ||
    alertState.stops < 2
  )
    throw new Error(
      `Incoming call alert invalid: ${JSON.stringify(alertState)}`
    );
  await pageA.click('button[aria-label="结束通话"]');
  await pageB.waitForSelector('button[aria-label="结束通话"]', {
    hidden: true,
    timeout: 8000,
  });
  console.log(
    `ANDROID_CALL_AUDIO_OK conversation=${conversation.id} peers=2 voice_tracks=${audioA.tracks},${audioB.tracks} video_audio_tracks=${videoAudioTracks.map(item => item.tracks).join(",")} autoplay=true volume=1 answering_handshake=ok speaker=toggle video_speaker=default_on alerts=voice,video ringback=voice,video stopped=accept`
  );
} finally {
  await contextA.close();
  await contextB.close();
  await browser.close();
}
