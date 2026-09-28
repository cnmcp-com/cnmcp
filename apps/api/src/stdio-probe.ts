import { getContainer } from "@cloudflare/containers";

import { verifyServer } from "./verify";
import {
  STDIO_PROBE_TIMEOUT_MS,
  STDIO_RUNNER_VERSION,
  resolveStdioLaunch,
  stdioLaunchOf,
  type StdioLaunch,
  type StdioProbeResult,
  type StdioProbeStatus,
} from "./stdio-probe-contract";

type ProbeCandidateRow = {
  server_id: string;
  config_json: string;
  last_status: StdioProbeStatus | null;
  last_completed_at: string | null;
};

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

async function configFor(db: D1Database, serverId: string): Promise<unknown | null> {
  const row = await db
    .prepare(
      `SELECT sc.config_json
       FROM servers s
       JOIN server_configs sc ON sc.server_id = s.id
       WHERE s.id = ? AND s.transport = 'local'`,
    )
    .bind(serverId)
    .first<{ config_json: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.config_json) as unknown;
  } catch {
    return null;
  }
}

async function insertRun(db: D1Database, input: { runId: string; serverId: string; launch?: StdioLaunch }): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stdio_probe_runs (
         id, server_id, runner_version, launcher, package_name, status, started_at
       ) VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
    )
    .bind(
      input.runId,
      input.serverId,
      STDIO_RUNNER_VERSION,
      input.launch?.launcher ?? null,
      input.launch?.packageName ?? null,
      new Date().toISOString(),
    )
    .run();
}

async function finishRun(
  db: D1Database,
  input: {
    runId: string;
    status: StdioProbeStatus;
    result?: StdioProbeResult;
    version?: string | null;
    error?: string | null;
    evidenceKey?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE stdio_probe_runs SET
         container_deployment_id = ?, resolved_package_version = ?, status = ?, protocol_version = ?,
         latency_ms = ?, tool_count = ?, error_code = ?, error_detail = ?, evidence_r2_key = ?,
         metadata_json = ?, completed_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.result?.containerDeploymentId ?? null,
      input.version ?? null,
      input.status,
      input.result?.protocolVersion ?? null,
      input.result?.latencyMs ?? null,
      input.result?.tools.length ?? 0,
      input.result?.errorCode ?? (input.status === "verified" ? null : input.status),
      (input.error ?? input.result?.error ?? null)?.slice(0, 1000) ?? null,
      input.evidenceKey ?? null,
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString(),
      input.runId,
    )
    .run();
}

function registryFailure(error: unknown): { status: StdioProbeStatus; error: string } {
  const message = messageOf(error);
  return {
    status: message.includes("package_not_found") ? "package_not_found" : "install_failed",
    error: message,
  };
}

export async function runCloudStdioProbe(env: CloudflareEnv, serverId: string): Promise<{ runId: string; serverId: string; status: StdioProbeStatus }> {
  const runId = crypto.randomUUID();
  const config = await configFor(env.DB, serverId);
  const decision = stdioLaunchOf(config);
  await insertRun(env.DB, { runId, serverId, launch: decision.ok ? decision.launch : undefined });

  if (!decision.ok) {
    await finishRun(env.DB, { runId, status: decision.status, error: decision.error });
    return { runId, serverId, status: decision.status };
  }
  if (!env.STDIO_PROBE_CONTAINER) {
    await finishRun(env.DB, { runId, status: "runner_failed", error: "container_binding_not_configured" });
    return { runId, serverId, status: "runner_failed" };
  }

  let resolved: { args: string[]; version: string };
  try {
    resolved = await resolveStdioLaunch(decision.launch);
  } catch (error) {
    const failure = registryFailure(error);
    await finishRun(env.DB, { runId, status: failure.status, error: failure.error });
    return { runId, serverId, status: failure.status };
  }

  const container = getContainer(env.STDIO_PROBE_CONTAINER, runId) as unknown as {
    runProbe(job: Parameters<import("./stdio-container").StdioProbeContainer["runProbe"]>[0]): Promise<StdioProbeResult>;
  };
  const result: StdioProbeResult = await container.runProbe({
    runId,
    serverId,
    launcher: decision.launch.launcher,
    args: resolved.args,
    packageName: decision.launch.packageName,
    resolvedPackageVersion: resolved.version,
    timeoutMs: STDIO_PROBE_TIMEOUT_MS,
  });
  const evidence = {
    runId,
    serverId,
    runnerVersion: STDIO_RUNNER_VERSION,
    launcher: decision.launch.launcher,
    packageName: decision.launch.packageName,
    resolvedPackageVersion: resolved.version,
    result,
  };
  const evidenceKey = `evidence/${serverId}/${new Date().toISOString()}/stdio-container.json`;
  if (env.EVIDENCE) await env.EVIDENCE.put(evidenceKey, JSON.stringify(evidence));

  if (result.status === "verified") {
    await verifyServer(env, serverId, result);
  }
  await finishRun(env.DB, {
    runId,
    status: result.status,
    result,
    version: resolved.version,
    evidenceKey: env.EVIDENCE ? evidenceKey : null,
    metadata: { argsCount: resolved.args.length },
  });
  return { runId, serverId, status: result.status };
}

export async function listDueStdioProbeIds(db: D1Database, limit: number, now = Date.now()): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT sc.server_id, sc.config_json,
              (SELECT status FROM stdio_probe_runs r WHERE r.server_id = sc.server_id ORDER BY started_at DESC LIMIT 1) AS last_status,
              (SELECT completed_at FROM stdio_probe_runs r WHERE r.server_id = sc.server_id ORDER BY started_at DESC LIMIT 1) AS last_completed_at
       FROM server_configs sc
       JOIN servers s ON s.id = sc.server_id
       WHERE s.transport = 'local'
       ORDER BY last_completed_at IS NULL DESC, last_completed_at ASC, sc.server_id ASC`,
    )
    .all<ProbeCandidateRow>();

  const weeklyCutoff = now - 7 * 86_400_000;
  const retryCutoff = now - 86_400_000;
  return (rows.results ?? []).flatMap((row) => {
    let config: unknown;
    try {
      config = JSON.parse(row.config_json) as unknown;
    } catch {
      return [];
    }
    const decision = stdioLaunchOf(config);
    if (!decision.ok) return [];
    const completed = Date.parse(row.last_completed_at ?? "");
    if (!Number.isFinite(completed)) return [row.server_id];
    const cutoff = row.last_status === "verified" ? weeklyCutoff : retryCutoff;
    return completed <= cutoff ? [row.server_id] : [];
  }).slice(0, Math.min(100, Math.max(1, limit)));
}

export async function enqueueStdioProbes(env: CloudflareEnv, serverIds: string[]): Promise<number> {
  if (!env.STDIO_PROBE_QUEUE || !serverIds.length) return 0;
  await env.STDIO_PROBE_QUEUE.sendBatch(serverIds.map((serverId) => ({ body: { kind: "stdio" as const, serverId } })));
  return serverIds.length;
}
