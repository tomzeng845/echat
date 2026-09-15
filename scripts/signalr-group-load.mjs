#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { performance } from "node:perf_hooks";
import {
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
} from "@microsoft/signalr";

const env = process.env;
const API_URL = (env.ECHAT_API_URL || "http://127.0.0.1:2099").replace(/\/$/, "");
const HUB_URL = `${API_URL}/hubs/chat`;
const CONVERSATION_ID = env.ECHAT_CONVERSATION_ID;
const USERS_FILE = env.ECHAT_LOAD_USERS_FILE || "./load-users.json";
const CLIENT_COUNT = Number(env.ECHAT_CLIENT_COUNT || 0);
const BATCH_SIZE = Number(env.ECHAT_CONNECT_BATCH || 50);
const BATCH_DELAY_MS = Number(env.ECHAT_CONNECT_BATCH_DELAY_MS || 500);
const HOLD_MS = Number(env.ECHAT_HOLD_MS || 60_000);
const SEND_INTERVAL_MS = Number(env.ECHAT_SEND_INTERVAL_MS || 0);
const RECONNECT_STORM = Number(env.ECHAT_RECONNECT_STORM || 0);
const LOG_LEVEL = env.ECHAT_SIGNALR_LOG === "debug" ? LogLevel.Information : LogLevel.Warning;

if (!CONVERSATION_ID) throw new Error("缺少 ECHAT_CONVERSATION_ID");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};

async function readUsers() {
  const content = await fs.readFile(USERS_FILE, "utf8");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("测试账号文件必须是非空数组");
  for (const [index, user] of parsed.entries()) {
    if (!user.account || !user.password) throw new Error(`第 ${index + 1} 个测试账号缺少 account/password`);
  }
  const wanted = CLIENT_COUNT > 0 ? CLIENT_COUNT : parsed.length;
  if (parsed.length < wanted) throw new Error(`测试账号只有 ${parsed.length} 个，无法创建 ${wanted} 个客户端`);
  return parsed.slice(0, wanted);
}

async function login(user, index) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: user.account,
      password: user.password,
      deviceName: `load-test-${index + 1}`,
      deviceId: user.deviceId || `load-test-${index + 1}`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.accessToken) {
    throw new Error(`登录失败 ${user.account}: HTTP ${response.status} ${body.error || "无 accessToken"}`);
  }
  return body.accessToken;
}

class LoadClient {
  constructor(user, index, token, metrics) {
    this.user = user;
    this.index = index;
    this.token = token;
    this.metrics = metrics;
    this.connection = null;
    this.shouldRun = true;
    this.lastSentAt = new Map();
  }

  build() {
    this.connection = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => this.token,
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
      .configureLogging(LOG_LEVEL)
      .build();

    this.connection.on("message.created", message => {
      this.metrics.received += 1;
      const sentAt = message?.metadata?.loadSentAt || message?.loadSentAt;
      if (sentAt) this.metrics.latencies.push(Math.max(0, Date.now() - Number(sentAt)));
      const key = message?.clientMessageId || message?.id;
      if (key && this.metrics.seen.has(key)) this.metrics.duplicates += 1;
      if (key) this.metrics.seen.add(key);
    });
    this.connection.onreconnecting(() => { this.metrics.reconnecting += 1; });
    this.connection.onreconnected(() => { this.metrics.reconnected += 1; });
    this.connection.onclose(error => {
      if (this.shouldRun && error) this.metrics.unexpectedClose += 1;
    });
    return this;
  }

  async start() {
    await this.connection.start();
    await this.connection.invoke("JoinConversation", CONVERSATION_ID);
    this.metrics.connected += 1;
    this.metrics.joined += 1;
    if (SEND_INTERVAL_MS > 0) this.startSending();
  }

  startSending() {
    this.timer = setInterval(async () => {
      if (this.connection.state !== "Connected") return;
      const clientMessageId = `load-${this.index}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sentAt = Date.now();
      this.lastSentAt.set(clientMessageId, sentAt);
      try {
        const response = await fetch(`${API_URL}/api/conversations/${encodeURIComponent(CONVERSATION_ID)}/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            clientMessageId,
            kind: "Text",
            content: `load-test ${clientMessageId}`,
            algorithm: "PLAINTEXT",
            keyVersion: 0,
            metadata: { loadSentAt: String(sentAt) },
          }),
        });
        if (!response.ok) this.metrics.sendErrors += 1;
        else this.metrics.sent += 1;
      } catch {
        this.metrics.sendErrors += 1;
      }
    }, SEND_INTERVAL_MS);
  }

  async stop() {
    this.shouldRun = false;
    if (this.timer) clearInterval(this.timer);
    if (this.connection) await this.connection.stop();
  }
}

async function main() {
  console.log(JSON.stringify({ event: "load-start", api: API_URL, hub: HUB_URL, conversationId: CONVERSATION_ID, holdMs: HOLD_MS }, null, 2));
  const users = await readUsers();
  const metrics = {
    connected: 0, joined: 0, received: 0, sent: 0, sendErrors: 0,
    duplicates: 0, unexpectedClose: 0, reconnecting: 0, reconnected: 0,
    latencies: [], seen: new Set(), clients: [],
  };
  const clients = [];
  for (let offset = 0; offset < users.length; offset += BATCH_SIZE) {
    const batch = users.slice(offset, offset + BATCH_SIZE);
    const prepared = await Promise.all(batch.map(async (user, localIndex) => {
      const index = offset + localIndex;
      const token = await login(user, index);
      return new LoadClient(user, index, token, metrics).build();
    }));
    for (const client of prepared) {
      try {
        await client.start();
        clients.push(client);
      } catch (error) {
        metrics.sendErrors += 1;
        console.error(JSON.stringify({ event: "client-start-failed", index: client.index, error: String(error) }));
        await client.stop();
      }
    }
    console.log(JSON.stringify({ event: "batch-ready", connected: metrics.connected, target: users.length }));
    if (offset + BATCH_SIZE < users.length) await sleep(BATCH_DELAY_MS);
  }

  if (RECONNECT_STORM > 0) {
    await sleep(1_000);
    const storm = clients.slice(0, Math.min(RECONNECT_STORM, clients.length));
    console.log(JSON.stringify({ event: "reconnect-storm", count: storm.length }));
    await Promise.all(storm.map(client => client.connection.stop().then(() => client.connection.start()).then(() => client.connection.invoke("JoinConversation", CONVERSATION_ID)).catch(() => { metrics.sendErrors += 1; })));
  }

  await sleep(HOLD_MS);
  await Promise.all(clients.map(client => client.stop()));
  const report = {
    event: "load-finished",
    targetClients: users.length,
    connected: metrics.connected,
    joined: metrics.joined,
    sent: metrics.sent,
    sendErrors: metrics.sendErrors,
    received: metrics.received,
    duplicates: metrics.duplicates,
    unexpectedClose: metrics.unexpectedClose,
    reconnecting: metrics.reconnecting,
    reconnected: metrics.reconnected,
    latencyMs: {
      count: metrics.latencies.length,
      p50: percentile(metrics.latencies, 0.5),
      p95: percentile(metrics.latencies, 0.95),
      p99: percentile(metrics.latencies, 0.99),
      max: metrics.latencies.length ? Math.max(...metrics.latencies) : null,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (metrics.connected < users.length * 0.99 || metrics.unexpectedClose > users.length * 0.01 || metrics.duplicates > 0) process.exitCode = 2;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
