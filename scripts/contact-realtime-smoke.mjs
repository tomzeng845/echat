import * as signalR from "@microsoft/signalr";

const base = process.argv[2] || "http://127.0.0.1:2099";
const suffix = Date.now().toString().slice(-9);
const password = "EChat.Contact.2026!";

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
    body: JSON.stringify({ account, password, inviteCode: "ECHAT2026", displayName, agreementAccepted: true, deviceName: "Contact realtime smoke" }),
  });
}

function once(connection, event, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const handler = value => { clearTimeout(timer); connection.off(event, handler); resolve(value); };
    const timer = setTimeout(() => { connection.off(event, handler); reject(new Error(`${event} timeout`)); }, timeout);
    connection.on(event, handler);
  });
}

const aliceAccount = `rta${suffix}`;
const bobAccount = `rtb${suffix}`;
const [alice, bob] = await Promise.all([register(aliceAccount, "实时甲"), register(bobAccount, "实时乙")]);
const connect = token => new signalR.HubConnectionBuilder().withUrl(`${base}/hubs/chat`, { accessTokenFactory: () => token }).withAutomaticReconnect().build();
const aliceHub = connect(alice.accessToken);
const bobHub = connect(bob.accessToken);

try {
  await Promise.all([aliceHub.start(), bobHub.start()]);
  const requested = once(bobHub, "contact.requested");
  const created = await request("/api/contacts/requests", alice.accessToken, {
    method: "POST",
    body: JSON.stringify({ requestId: `realtime-${suffix}`, peerAccount: bobAccount, note: "实时申请", source: "account" }),
  });
  const requestEvent = await requested;
  if (requestEvent.id !== created.id || requestEvent.sender?.account !== aliceAccount) throw new Error("contact.requested payload mismatch");

  const inbox = await request("/api/contacts/requests", bob.accessToken);
  if (inbox[0]?.sender?.displayName !== "实时甲") throw new Error("friend request sender profile missing");

  const aliceUpdated = once(aliceHub, "contact.updated");
  const bobUpdated = once(bobHub, "contact.updated");
  await request(`/api/contacts/requests/${created.id}/accept`, bob.accessToken, { method: "POST" });
  const [aliceEvent, bobEvent] = await Promise.all([aliceUpdated, bobUpdated]);
  if (aliceEvent.status !== "Friend" || bobEvent.status !== "Friend") throw new Error("contact.updated status mismatch");

  const [aliceContacts, bobContacts] = await Promise.all([
    request("/api/contacts", alice.accessToken),
    request("/api/contacts", bob.accessToken),
  ]);
  if (!aliceContacts.some(item => item.user.account === bobAccount) || !bobContacts.some(item => item.user.account === aliceAccount)) throw new Error("contact list did not refresh at source");

  const conversationEvent = once(bobHub, "conversation.updated");
  const conversation = await request("/api/conversations/direct", alice.accessToken, {
    method: "POST",
    body: JSON.stringify({ peerAccount: bobAccount }),
  });
  const receivedConversationEvent = await conversationEvent;
  if (receivedConversationEvent.conversationId !== conversation.id || receivedConversationEvent.action !== "created") throw new Error("direct conversation event mismatch");
  const receivedMessage = once(bobHub, "message.created");
  const sentMessage = await request(`/api/conversations/${conversation.id}/messages`, alice.accessToken, {
    method: "POST",
    body: JSON.stringify({
      clientMessageId: `contact-message-${suffix}`,
      kind: "Text",
      content: "加好友后立即发送的消息",
      ciphertext: "",
      nonce: "",
      algorithm: "PLAINTEXT",
    }),
  });
  const messageEvent = await receivedMessage;
  if (messageEvent.id !== sentMessage.id || messageEvent.content !== "加好友后立即发送的消息") throw new Error("message was not delivered after direct conversation creation");

  console.log(`CONTACT_REALTIME_OK request=${created.id} conversation=${conversation.id} message=${messageEvent.id} sender=${requestEvent.sender.displayName} contacts=${aliceContacts.length}:${bobContacts.length}`);
} finally {
  await Promise.allSettled([aliceHub.stop(), bobHub.stop()]);
}
