#!/usr/bin/env node
import { spawn } from "node:child_process";

const MAX_PROTOCOL_BYTES = 1024 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const MAX_TOOLS = 500;

function decodeJob(value) {
  return JSON.parse(decodeURIComponent(value));
}

function stop(child) {
  if (!child?.pid || child.killed) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function safeSchema(value) {
  try {
    return JSON.stringify(value).length <= 32_000 ? value : null;
  } catch {
    return null;
  }
}

function classifyExit(stderr) {
  if (/404|not found|no matching distribution|could not find a version/i.test(stderr)) return "package_not_found";
  if (/network|fetch failed|ECONN|certificate|timed? out|registry/i.test(stderr)) return "install_failed";
  return "startup_failed";
}

async function probe(job) {
  const started = Date.now();
  const timeoutMs = Math.min(180_000, Math.max(10_000, Number(job.timeoutMs) || 60_000));
  if (!["npx", "uvx", "uv"].includes(job.launcher) || !Array.isArray(job.args) || job.args.length > 64) {
    throw new Error("invalid_job");
  }
  const child = spawn(job.launcher, job.args, {
    shell: false,
    detached: true,
    cwd: "/tmp",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp/cnmcp",
      LANG: "C.UTF-8",
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? "/tmp/npm-cache",
      NPM_CONFIG_AUDIT: "false",
      NPM_CONFIG_CAFILE: process.env.NPM_CONFIG_CAFILE ?? "/etc/ssl/certs/ca-certificates.crt",
      NPM_CONFIG_FUND: "false",
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--use-openssl-ca",
      SSL_CERT_FILE: process.env.SSL_CERT_FILE ?? "/etc/ssl/certs/ca-certificates.crt",
      npm_config_yes: "true",
      UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? "/tmp/uv-cache",
      UV_NO_PROGRESS: "1",
      UV_PYTHON_DOWNLOADS: "never",
      UV_SYSTEM_CERTS: process.env.UV_SYSTEM_CERTS ?? "true",
    },
  });

  let buffer = Buffer.alloc(0);
  let totalBytes = 0;
  let stderr = "";
  let settled = false;
  const waiters = new Map();

  function rejectAll(error) {
    for (const waiter of waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    waiters.clear();
  }

  function deliver(message) {
    if (!message || typeof message.id === "undefined") return;
    const waiter = waiters.get(message.id);
    if (!waiter) return;
    waiters.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(`protocol_error:${JSON.stringify(message.error)}`));
    else waiter.resolve(message);
  }

  function drain() {
    while (buffer.length) {
      const text = buffer.toString("utf8");
      if (text.startsWith("{") || text.startsWith("\n") || text.startsWith(" ")) {
        const newline = buffer.indexOf(0x0a);
        if (newline < 0) return;
        const line = buffer.subarray(0, newline).toString("utf8").trim();
        buffer = buffer.subarray(newline + 1);
        if (!line.startsWith("{")) continue;
        try { deliver(JSON.parse(line)); } catch { /* ignore non-protocol output */ }
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
      try { deliver(JSON.parse(buffer.subarray(start, start + length).toString("utf8"))); } catch { /* ignore malformed frames */ }
      buffer = buffer.subarray(start + length);
    }
  }

  child.stdout.on("data", (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_PROTOCOL_BYTES) {
      rejectAll(new Error("protocol_output_too_large"));
      stop(child);
      return;
    }
    buffer = Buffer.concat([buffer, chunk]);
    drain();
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_BYTES);
  });
  child.once("error", (error) => rejectAll(error));
  child.stdin.on("error", (error) => rejectAll(error));
  child.once("exit", (code) => {
    if (!settled) rejectAll(new Error(`process_exit:${code ?? "signal"}`));
  });

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

  try {
    const init = await request(1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "cnmcp-container", version: "0.1.0" },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const listed = await request(2, "tools/list", {});
    settled = true;
    const tools = Array.isArray(listed.result?.tools) ? listed.result.tools.slice(0, MAX_TOOLS) : [];
    return {
      status: "verified",
      ok: true,
      latencyMs: Date.now() - started,
      protocolVersion: typeof init.result?.protocolVersion === "string" ? init.result.protocolVersion : null,
      tools: tools.flatMap((tool) => tool && typeof tool.name === "string" ? [{
        name: tool.name.slice(0, 300),
        description: typeof tool.description === "string" ? tool.description.slice(0, 2000) : "",
        inputSchema: safeSchema(tool.inputSchema ?? tool.input_schema),
      }] : []),
      containerDeploymentId: process.env.CLOUDFLARE_DEPLOYMENT_ID ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "timeout" ? "startup_timeout" : message.startsWith("protocol_error:") ? "protocol_failed" : classifyExit(stderr);
    return {
      status,
      ok: false,
      error: `${message}${stderr ? ` ${stderr}` : ""}`.slice(0, 1000),
      errorCode: status,
      latencyMs: Date.now() - started,
      protocolVersion: null,
      tools: [],
      containerDeploymentId: process.env.CLOUDFLARE_DEPLOYMENT_ID ?? null,
    };
  } finally {
    settled = true;
    rejectAll(new Error("probe_finished"));
    stop(child);
  }
}

let result;
try {
  result = await probe(decodeJob(process.argv[2] ?? ""));
} catch (error) {
  result = {
    status: "runner_failed",
    ok: false,
    error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    errorCode: "runner_failed",
    latencyMs: null,
    protocolVersion: null,
    tools: [],
    containerDeploymentId: process.env.CLOUDFLARE_DEPLOYMENT_ID ?? null,
  };
}
process.stdout.write(JSON.stringify(result));
