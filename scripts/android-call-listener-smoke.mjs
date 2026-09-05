import * as signalR from "@microsoft/signalr";

const base = (process.argv[2] || "http://127.0.0.1:2099").replace(/\/$/, "");
const suffix = Date.now().toString().slice(-9);
const password = "EChat.Listener.2026!";

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
      deviceName: "Android native call listener smoke",
      deviceId: `android-listener-${account}`,
    }),
  });
}

function once(connection, event, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.off(event, handler);
      reject(new Error(`${event} timeout`));
    }, timeout);
    const handler = value => {
      clearTimeout(timer);
      connection.off(event, handler);
      resolve(value);
    };
    connection.on(event, handler);
  });
}

function connection(token) {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${base}/hubs/chat`, { accessTokenFactory: () => token })
    .withAutomaticReconnect([0, 500, 1000])
    .build();
}

const caller = await register(`nativeca${suffix}`, "原生呼叫方");
const receiver = await register(`nativecb${suffix}`, "原生接听方");
const listenerToken = await request(
  "/api/calls/listener-token",
  receiver.accessToken,
  { method: "POST" }
);
if (
  !listenerToken.token ||
  listenerToken.userId !== receiver.user.id ||
  Date.parse(listenerToken.expiresAtUtc) < Date.now() + 6 * 24 * 60 * 60 * 1000
)
  throw new Error("listener token payload invalid");

const listenerApiResponse = await fetch(`${base}/api/calls`, {
  headers: { Authorization: `Bearer ${listenerToken.token}` },
});
if (listenerApiResponse.status !== 403)
  throw new Error(
    `listener token unexpectedly accessed API: ${listenerApiResponse.status}`
  );

// The native listener connects before the friendship and conversation exist.
// Incoming calls must therefore be routed through the receiver's user group,
// not only the conversation groups captured at connection time.
const listenerHub = connection(listenerToken.token);
await listenerHub.start();

await request("/api/contacts/requests", caller.accessToken, {
  method: "POST",
  body: JSON.stringify({
    requestId: `native-listener-${suffix}`,
    peerAccount: receiver.user.account,
    note: "native listener smoke",
    source: "account",
  }),
});
const friendRequest = (
  await request("/api/contacts/requests", receiver.accessToken)
)[0];
await request(
  `/api/contacts/requests/${friendRequest.id}/accept`,
  receiver.accessToken,
  { method: "POST" }
);
const conversation = await request(
  "/api/conversations/direct",
  caller.accessToken,
  {
    method: "POST",
    body: JSON.stringify({
      peerAccount: receiver.user.account,
      keyEnvelopes: {
        [caller.user.id]: "caller-envelope",
        [receiver.user.id]: "receiver-envelope",
      },
    }),
  }
);

const callerHub = connection(caller.accessToken);
await callerHub.start();
let readOnlyRejected = false;
try {
  await listenerHub.invoke("MarkRead", conversation.id, 0);
} catch (error) {
  readOnlyRejected = String(error).includes("LISTENER_SCOPE_READ_ONLY");
}
if (!readOnlyRejected)
  throw new Error("listener scope invoked interactive Hub API");

const callId = crypto.randomUUID();
const incoming = once(listenerHub, "call.invited");
await callerHub.invoke("CallInvite", conversation.id, callId, "video");
const invite = await incoming;
if (
  invite.callId !== callId ||
  invite.conversationId !== conversation.id ||
  invite.mode !== "video" ||
  invite.callerId !== caller.user.id ||
  invite.callerName !== "原生呼叫方"
)
  throw new Error(`native invite payload mismatch: ${JSON.stringify(invite)}`);

const cleared = once(listenerHub, "call.listener.cleared");
await callerHub.invoke("CallEnd", conversation.id, callId);
if ((await cleared).callId !== callId) throw new Error("call.ended mismatch");

await Promise.all([callerHub.stop(), listenerHub.stop()]);
console.log(
  `ANDROID_CALL_LISTENER_OK conversation=${conversation.id} call=${callId} mode=video scope=readonly api=403 late_conversation=received events=invited,cleared`
);
