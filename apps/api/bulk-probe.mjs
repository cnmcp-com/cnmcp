#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const API = process.env.CNMCP_API ?? "http://127.0.0.1:8787";
const concurrency = Math.min(16, Math.max(1, Number(process.env.CNMCP_PROBE_CONCURRENCY ?? "8")));
const timeoutMs = Math.min(180_000, Math.max(10_000, Number(process.env.CNMCP_PROBE_TIMEOUT_MS ?? "60000")));
const limit = Math.min(1000, Math.max(1, Number(process.env.CNMCP_PROBE_LIMIT ?? "1000")));
const requestedServerId = process.env.CNMCP_PROBE_SERVER_ID?.trim() || null;
const images = {
  npx: "public.ecr.aws/docker/library/node:22-bookworm-slim",
  uvx: "ghcr.io/astral-sh/uv:python3.12-bookworm-slim",
  uv: "ghcr.io/astral-sh/uv:python3.12-bookworm-slim",
};

function launchOf(detail) {
  const servers = detail?.reliableConfig?.config?.mcpServers;
  const entry = servers && typeof servers === "object" ? Object.values(servers)[0] : null;
  if (!entry || typeof entry.command !== "string") return { error: "no_reliable_config" };
  const command = entry.command.split(/[\\/]/).pop();
  if (!(command in images)) return { error: `unsupported_launcher:${command || "unknown"}` };
  const args = Array.isArray(entry.args) ? entry.args.filter((item) => typeof item === "string") : [];
  if (!args.length) return { error: "missing_launcher_arguments" };
  if (args.some((item) => item.length > 200 || /[\n\r;|&$`]/.test(item))) return { error: "unsafe_launcher_arguments" };
  return { command, args, image: images[command] };
}

function dockerCommand(launch, name) {
  return [
    "run",
    "--rm",
    "-i",
    "--name",
    name,
    "--network",
    "bridge",
    "--read-only",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,size=384m,mode=1777",
    "--env",
    "HOME=/tmp",
    "--env",
    "NPM_CONFIG_CACHE=/tmp/npm-cache",
    "--env",
    "NPM_CONFIG_UPDATE_NOTIFIER=false",
    "--env",
    "npm_config_yes=true",
    "--env",
    "UV_NO_PROGRESS=1",
    "--entrypoint",
    launch.command,
    launch.image,
    ...launch.args,
  ];
}

function removeContainer(name) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
    child.once("exit", resolve);
    child.once("error", resolve);
  });
}

async function handshakeDocker(launch) {
  const started = Date.now();
  const name = `cnmcp-probe-${randomUUID().slice(0, 12)}`;
  const child = spawn("docker", dockerCommand(launch, name), { shell: false, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const waiters = new Map();
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-600);
  });
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      const text = buffer.toString("utf8");
      if (text.startsWith("{") || text.startsWith("\n") || text.startsWith(" ")) {
        const newline = buffer.indexOf(0x0a);
        if (newline < 0) return;
        const line = buffer.subarray(0, newline).toString("utf8").trim();
        buffer = buffer.subarray(newline + 1);
        if (!line.startsWith("{")) continue;
        try {
          deliver(JSON.parse(line));
        } catch {
          // Ignore non-protocol output.
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
        // Ignore malformed protocol frames.
      }
      buffer = buffer.subarray(start + length);
    }
  });

  function deliver(message) {
    const waiter = message && waiters.get(message.id);
    if (!waiter) return;
    waiters.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message);
  }

  function request(id, method, params) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      waiters.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  try {
    const init = await request(1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "cnmcp", version: "0.1.0" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const listed = await request(2, "tools/list", {});
    const tools = Array.isArray(listed.result?.tools) ? listed.result.tools : [];
    return {
      ok: true,
      latencyMs: Date.now() - started,
      protocolVersion: typeof init.result?.protocolVersion === "string" ? init.result.protocolVersion : null,
      tools: tools.flatMap((tool) =>
        tool && typeof tool.name === "string"
          ? [{ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema ?? null }]
          : [],
      ),
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
    child.kill("SIGKILL");
    for (const waiter of waiters.values()) clearTimeout(waiter.timer);
    await removeContainer(name);
  }
}

async function json(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function record(serverId, stdioHandshake) {
  return json(`${API}/internal/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serverId, stdioHandshake }),
  });
}

const queue = requestedServerId ? null : await json(`${API}/internal/probe-queue?transport=local&limit=${limit}`);
const ids = requestedServerId ? [requestedServerId] : queue?.ids ?? [];
const summary = { total: ids.length, completed: 0, attempted: 0, verified: 0, failed: 0, unsupported: 0, writeErrors: 0 };
let cursor = 0;

async function worker() {
  while (cursor < ids.length) {
    const serverId = ids[cursor++];
    try {
      const detail = await json(`${API}/v1/servers/${encodeURIComponent(serverId)}`);
      const launch = launchOf(detail);
      let handshake;
      if (launch.error) {
        summary.unsupported += 1;
        handshake = { ok: false, error: launch.error, latencyMs: null, protocolVersion: null, tools: [] };
      } else {
        summary.attempted += 1;
        handshake = await handshakeDocker(launch);
      }
      const result = await record(serverId, handshake);
      if (result.score === null) summary.failed += 1;
      else summary.verified += 1;
    } catch (error) {
      summary.writeErrors += 1;
      console.error(JSON.stringify({ serverId, error: error instanceof Error ? error.message : String(error) }));
    }
    summary.completed += 1;
    if (summary.completed % 10 === 0 || summary.completed === ids.length) {
      console.log(JSON.stringify(summary));
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
console.log(JSON.stringify({ done: true, ...summary }, null, 2));
