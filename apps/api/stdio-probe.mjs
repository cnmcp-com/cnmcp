#!/usr/bin/env node
/**
 * 本机拉起一条可靠的 stdio 配置，只做 initialize + tools/list，再写回本地 API。
 *
 *   node apps/api/stdio-probe.mjs cloud.tencent.com/10000
 *   node apps/api/stdio-probe.mjs --next
 */
import { spawn } from "node:child_process";

const API = process.env.CNMCP_API ?? "http://127.0.0.1:8787";
const args = process.argv.slice(2);
const next = args.includes("--next");
const serverId = args.find((item) => !item.startsWith("--"));
const LAUNCHERS = new Set(["uvx", "npx", "bunx", "uv"]);

if (!serverId && !next) {
  console.error("用法: node apps/api/stdio-probe.mjs <serverId> | --next");
  process.exit(1);
}

function launchOf(config) {
  const servers = config?.config?.mcpServers;
  const entry = servers && typeof servers === "object" ? Object.values(servers)[0] : null;
  if (!entry || typeof entry.command !== "string") return null;
  const command = entry.command.split(/[\\/]/).pop();
  if (!LAUNCHERS.has(command)) return null;
  const args = Array.isArray(entry.args) ? entry.args.filter((item) => typeof item === "string") : [];
  if (!args.length || args.some((item) => item.length > 200 || /[\n\r;|&$`]/.test(item))) return null;
  return { command, args };
}

function stop(child) {
  if (!child?.pid || child.killed) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function handshakeStdio(launch, timeoutMs = 180_000) {
  const started = Date.now();
  const child = spawn(launch.command, launch.args, {
    shell: false,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: "C.UTF-8",
      UV_NO_PROGRESS: "1",
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
    },
  });
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const waiters = new Map();
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-500);
  });
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      const asText = buffer.toString("utf8");
      if (asText.startsWith("{") || asText.startsWith("\n") || asText.startsWith(" ")) {
        const newline = buffer.indexOf(0x0a);
        if (newline < 0) return;
        const line = buffer.subarray(0, newline).toString("utf8").trim();
        buffer = buffer.subarray(newline + 1);
        if (!line.startsWith("{")) continue;
        try {
          deliver(JSON.parse(line));
        } catch {
          // 非 JSON 行丢掉。
        }
        continue;
      }
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const match = buffer.subarray(0, headerEnd).toString("utf8").match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      try {
        deliver(JSON.parse(buffer.subarray(start, start + length).toString("utf8")));
      } catch {
        // 坏帧丢掉。
      }
      buffer = buffer.subarray(start + length);
    }
  });

  function deliver(message) {
    if (!message || typeof message.id === "undefined") return;
    const waiter = waiters.get(message.id);
    if (!waiter) return;
    waiters.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message);
  }

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(id, method, params) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      waiters.set(id, { resolve, reject, timer });
      send({ jsonrpc: "2.0", id, method, params });
    });
  }

  return (async () => {
    try {
      const init = await request(1, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "cnmcp", version: "0.1.0" },
      });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      const listed = await request(2, "tools/list", {});
      const tools = Array.isArray(listed.result?.tools) ? listed.result.tools : [];
      return {
        ok: true,
        latencyMs: Date.now() - started,
        protocolVersion: typeof init.result?.protocolVersion === "string" ? init.result.protocolVersion : null,
        tools: tools.flatMap((tool) => (tool && typeof tool.name === "string" ? [{ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema ?? null }] : [])),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: `${message}${stderr ? ` ${stderr}` : ""}`.slice(0, 300),
        latencyMs: Date.now() - started,
        protocolVersion: null,
        tools: [],
      };
    } finally {
      stop(child);
    }
  })();
}

async function loadDetail(id) {
  const response = await fetch(`${API}/v1/servers/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function probeOne(id) {
  const detail = await loadDetail(id);
  const launch = launchOf(detail.reliableConfig);
  if (!launch) return null;
  console.error(`拉起 ${launch.command} ${launch.args.join(" ")}`);
  const stdioHandshake = await handshakeStdio(launch);
  const recorded = await fetch(`${API}/internal/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serverId: id, stdioHandshake }),
  }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  console.log(JSON.stringify({ serverId: id, launch, tools: stdioHandshake.tools?.map((tool) => tool.name), handshakeOk: stdioHandshake.ok, error: stdioHandshake.error ?? null, recorded }, null, 2));
  return stdioHandshake.ok;
}

if (next) {
  const queue = await fetch(`${API}/internal/probe-queue?transport=local&limit=30`).then(async (response) => {
    if (!response.ok) throw new Error(`队列 ${response.status}`);
    return response.json();
  });
  for (const id of queue.ids ?? []) {
    const ok = await probeOne(id);
    if (ok === null) continue;
    process.exit(ok ? 0 : 1);
  }
  console.error(JSON.stringify({ error: "队列里没有可在本机拉起的 uvx/npx 配置" }));
  process.exit(2);
}

const ok = await probeOne(serverId);
if (ok === null) {
  console.error(JSON.stringify({ serverId, error: "没有可在本机拉起的 uvx/npx 配置" }));
  process.exit(2);
}
if (!ok) process.exit(1);
