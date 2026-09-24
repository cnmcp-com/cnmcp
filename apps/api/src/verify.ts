import { ALGORITHM_VERSION } from "@cnmcp/schema";
import { computeTrustScore } from "@cnmcp/checkers";

import { handshakeMcp, type McpHandshake, type McpTool } from "./mcp";

function nextVerifyAt(now: Date, popular: boolean): string {
  const days = popular ? 1 : 7;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function toolsOf(value: unknown): McpTool[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const tool = item as Record<string, unknown>;
    if (typeof tool.name !== "string" || !tool.name.trim()) return [];
    return [{ name: tool.name, description: typeof tool.description === "string" ? tool.description : "", inputSchema: tool.inputSchema ?? tool.input_schema }];
  });
}

export function stdioHandshakeOf(value: unknown): McpHandshake | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.ok !== "boolean") return null;
  return {
    ok: item.ok,
    error: typeof item.error === "string" ? item.error.slice(0, 300) : undefined,
    latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : null,
    protocolVersion: typeof item.protocolVersion === "string" ? item.protocolVersion : null,
    tools: toolsOf(item.tools),
  };
}

export async function verifyServer(env: CloudflareEnv, serverId: string, stdioHandshake: McpHandshake | null = null): Promise<{ serverId: string; reason: string; score: number | null }> {
  const server = await env.DB.prepare(
    `SELECT id, transport, claimed_tool_names, last_published_at, version_count FROM servers WHERE id = ?`,
  )
    .bind(serverId)
    .first<{
      id: string;
      transport: "remote" | "local" | "unknown";
      claimed_tool_names: string;
      last_published_at: string | null;
      version_count: number;
    }>();
  if (!server) throw new Error("SERVER_NOT_FOUND");

  const endpoint = await env.DB.prepare(`SELECT id, url FROM endpoints WHERE server_id = ? ORDER BY id LIMIT 1`)
    .bind(serverId)
    .first<{ id: number; url: string }>();

  const claimed = (() => {
    try {
      return JSON.parse(server.claimed_tool_names) as string[];
    } catch {
      return [];
    }
  })();

  const now = new Date();
  let handshake: {
    ok: boolean;
    error?: string;
    latencyMs: number | null;
    protocolVersion: string | null;
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  } = { ok: false, error: "no_endpoint", latencyMs: null, protocolVersion: null, tools: [] };

  const ranStdio = server.transport === "local" && stdioHandshake !== null;
  if (ranStdio && stdioHandshake) {
    handshake = stdioHandshake;
  } else if (server.transport === "remote" && endpoint?.url) {
    handshake = await handshakeMcp(endpoint.url);
    await env.DB.prepare(
      `UPDATE endpoints SET reachable_probe = ?, latency_ms = ?, last_checked_at = ?, last_error = ? WHERE id = ?`,
    )
      .bind(handshake.ok ? 1 : 0, handshake.latencyMs, now.toISOString(), handshake.ok ? null : handshake.error ?? "fail", endpoint.id)
      .run();
  }

  const snapshot = computeTrustScore({
    transport: server.transport,
    alive: { ok: handshake.ok, error: handshake.error, protocolVersion: handshake.protocolVersion, latencyMs: handshake.latencyMs },
    toolsActual: handshake.tools,
    toolsClaimed: claimed,
    probe: {
      reachable: server.transport === "remote" ? (endpoint?.url ? handshake.ok : null) : ranStdio ? handshake.ok : null,
      latencyMs: handshake.latencyMs,
      error: handshake.error,
    },
    lastPublishedAt: server.last_published_at,
    versionCount: server.version_count,
    now: now.getTime(),
  });
  snapshot.serverId = serverId;

  const status =
    snapshot.reason === "scored" ? "verified" : snapshot.reason === "dead" ? "dead" : snapshot.reason === "unverified_local" ? "local_untested" : "unverifiable";

  const runAt = now.toISOString();
  for (const [checker, component] of Object.entries(snapshot.components)) {
    const evidence = JSON.stringify(component.evidence);
    const r2Key = `evidence/${serverId}/${runAt}/${checker}.json`;
    if (env.EVIDENCE) await env.EVIDENCE.put(r2Key, evidence);
    await env.DB.prepare(
      `INSERT INTO verifications (id, server_id, run_at, checker, status, score, evidence_json, evidence_r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), serverId, runAt, checker, component.status, component.score, evidence, env.EVIDENCE ? r2Key : null)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO score_snapshots (server_id, score, grade, algorithm_version, computed_at, reason, components_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(serverId, snapshot.score, snapshot.grade, ALGORITHM_VERSION, runAt, snapshot.reason, JSON.stringify(snapshot.components))
    .run();

  const previousTools = await env.DB.prepare(`SELECT name FROM tools WHERE server_id = ?`).bind(serverId).all<{ name: string }>();
  const previousNames = new Set((previousTools.results ?? []).map((row) => row.name));
  const nextNames = new Set(handshake.tools.map((tool) => tool.name));
  for (const tool of handshake.tools) {
    await env.DB.prepare(
      `INSERT INTO tools (server_id, name, description, input_schema, poisoning_flags, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, '[]', ?, ?)
       ON CONFLICT(server_id, name) DO UPDATE SET description = excluded.description, input_schema = excluded.input_schema, last_seen_at = excluded.last_seen_at`,
    )
      .bind(serverId, tool.name, tool.description ?? "", JSON.stringify(tool.inputSchema ?? null), runAt, runAt)
      .run();
  }
  for (const name of nextNames) {
    if (!previousNames.has(name) && previousNames.size > 0) {
      await env.DB.prepare(`INSERT INTO change_events (server_id, type, severity, diff_json, detected_at) VALUES (?, 'tool_added', 'info', ?, ?)`)
        .bind(serverId, JSON.stringify({ name }), runAt)
        .run();
    }
  }
  for (const name of previousNames) {
    if (!nextNames.has(name) && nextNames.size > 0) {
      await env.DB.prepare(`INSERT INTO change_events (server_id, type, severity, diff_json, detected_at) VALUES (?, 'tool_removed', 'warn', ?, ?)`)
        .bind(serverId, JSON.stringify({ name }), runAt)
        .run();
    }
  }

  await env.DB.prepare(
    `UPDATE servers SET status = ?, score = ?, grade = ?, algorithm_version = ?, score_reason = ?, protocol_version = ?, verified_at = ?, next_verify_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(status, snapshot.score, snapshot.grade, ALGORITHM_VERSION, snapshot.reason, handshake.protocolVersion, runAt, nextVerifyAt(now, false), runAt, serverId)
    .run();

  return { serverId, reason: snapshot.reason, score: snapshot.score };
}
