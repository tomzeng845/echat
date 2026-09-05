import * as signalR from "@microsoft/signalr";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString();
const password = "EChat.Call.2026!";

async function request(path, token, init = {}) {
  const response = await fetch(base + path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function register(account, displayName) {
  return request("/api/auth/register", null, { method: "POST", body: JSON.stringify({ account, password, inviteCode: "ECHAT2026", displayName, agreementAccepted: true, deviceName: "SignalR smoke" }) });
}

function once(connection, event, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { connection.off(event, handler); reject(new Error(`${event} timeout`)); }, timeout);
    const handler = value => { clearTimeout(timer); connection.off(event, handler); resolve(value); };
    connection.on(event, handler);
  });
}

const aliceAccount = `calla${suffix.slice(-9)}`;
const bobAccount = `callb${suffix.slice(-9)}`;
const [alice, bob] = await Promise.all([register(aliceAccount, "通话甲"), register(bobAccount, "通话乙")]);
await request("/api/contacts/requests", alice.accessToken, { method: "POST", body: JSON.stringify({ requestId: `call-${suffix}`, peerAccount: bobAccount, note: "call smoke", source: "account" }) });
const friendRequest = (await request("/api/contacts/requests", bob.accessToken))[0];
await request(`/api/contacts/requests/${friendRequest.id}/accept`, bob.accessToken, { method: "POST" });
const conversation = await request("/api/conversations/direct", alice.accessToken, { method: "POST", body: JSON.stringify({ peerAccount: bobAccount, keyEnvelopes: { [alice.user.id]: "a", [bob.user.id]: "b" } }) });

const createConnection = token => new signalR.HubConnectionBuilder().withUrl(`${base}/hubs/chat`, { accessTokenFactory: () => token }).withAutomaticReconnect().build();
const aliceHub = createConnection(alice.accessToken);
const bobHub = createConnection(bob.accessToken);
await Promise.all([aliceHub.start(), bobHub.start()]);
await Promise.all([aliceHub.invoke("JoinConversation", conversation.id), bobHub.invoke("JoinConversation", conversation.id)]);

const declinedCallId = crypto.randomUUID();
const declineInvite = once(bobHub, "call.invited");
await aliceHub.invoke("CallInvite", conversation.id, declinedCallId, "video");
if ((await declineInvite).callId !== declinedCallId) throw new Error("decline call.invited mismatch");
const rejected = once(aliceHub, "call.rejected");
await bobHub.invoke("CallReject", conversation.id, declinedCallId, alice.user.id, "declined");
if ((await rejected).reason !== "declined") throw new Error("call.rejected mismatch");

const callId = crypto.randomUUID();
const invited = once(bobHub, "call.invited");
await aliceHub.invoke("CallInvite", conversation.id, callId, "audio");
if ((await invited).callId !== callId) throw new Error("call.invited mismatch");

const accepted = once(aliceHub, "call.accepted");
await bobHub.invoke("CallAccept", conversation.id, callId);
if ((await accepted).userId !== bob.user.id) throw new Error("call.accepted mismatch");

const signaled = once(bobHub, "call.signal");
await aliceHub.invoke("CallSignal", conversation.id, callId, bob.user.id, "ice", JSON.stringify({ candidate: "smoke", sdpMid: "0", sdpMLineIndex: 0 }));
if ((await signaled).fromUserId !== alice.user.id) throw new Error("call.signal mismatch");

const ended = once(aliceHub, "call.ended");
await bobHub.invoke("CallEnd", conversation.id, callId);
if ((await ended).callId !== callId) throw new Error("call.ended mismatch");
const history = await request("/api/calls", alice.accessToken);
if (history.find(item => item.id === declinedCallId)?.status !== "Rejected") throw new Error("rejected call history missing");
if (history.find(item => item.id === callId)?.status !== "Ended") throw new Error("ended call history missing");
const rtc = await request("/api/rtc/config", alice.accessToken);
if (!Array.isArray(rtc.iceServers) || !rtc.mode) throw new Error("RTC config missing");
await Promise.all([aliceHub.stop(), bobHub.stop()]);
console.log(`CALL_SIGNAL_OK conversation=${conversation.id} call=${callId} history=${history.length} rtc=${rtc.mode}`);
