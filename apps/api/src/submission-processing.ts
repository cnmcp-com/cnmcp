import { checkCatalogServer } from "@cnmcp/checkers";
import { isOfficialPublisher } from "@cnmcp/schema";

import { replacePlazaFacts, upsertReadmes, upsertServer, upsertStaticCheck } from "./db";
import { handshakeMcp } from "./mcp";
import { declaredToolsFromSources, emptySourceInfo, extractReliableConfig } from "./plaza-normalize";
import {
  fetchPublicEvidence,
  normalizeSubmissionPayload,
  resourceIdentityKeys,
  serverIdForIdentity,
  type NormalizedSubmission,
  type SubmissionPayload,
} from "./submission";
import { verifyServer } from "./verify";

type SubmissionRow = {
  id: string;
  payload: string;
  status: string;
  resource_id: string | null;
  attempts: number;
};

function errorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.slice(0, 160).replace(/[^a-zA-Z0-9_:\-]/g, "_");
}

function isTransient(error: unknown): boolean {
  const code = errorCode(error);
  return (
    error instanceof TypeError ||
    /public_evidence_unavailable:(?:403|429|5\d\d)/.test(code) ||
    /timeout|network|fetch_failed/i.test(code)
  );
}

function parsePayload(raw: string): NormalizedSubmission {
  let parsed: SubmissionPayload;
  try {
    parsed = JSON.parse(raw) as SubmissionPayload;
  } catch {
    throw new Error("submission_payload_invalid");
  }
  return normalizeSubmissionPayload(parsed);
}

async function existingServerId(db: D1Database, payload: NormalizedSubmission): Promise<string | null> {
  if (payload.repoUrl) {
    const row = await db
      .prepare(`SELECT id FROM servers WHERE LOWER(RTRIM(repo_url, '/')) IN (LOWER(?), LOWER(?)) LIMIT 1`)
      .bind(payload.repoUrl, `${payload.repoUrl}.git`)
      .first<{ id: string }>();
    if (row?.id) return row.id;
  }
  if (payload.packageName) {
    const row = await db.prepare(`SELECT id FROM servers WHERE LOWER(package_name) = LOWER(?) LIMIT 1`).bind(payload.packageName).first<{ id: string }>();
    if (row?.id) return row.id;
  }
  if (payload.remoteUrl) {
    const row = await db
      .prepare(`SELECT server_id FROM endpoints WHERE RTRIM(url, '/') = ? LIMIT 1`)
      .bind(payload.remoteUrl)
      .first<{ server_id: string }>();
    if (row?.server_id) return row.server_id;
  }
  for (const identityKey of resourceIdentityKeys(payload)) {
    const row = await db.prepare(`SELECT server_id FROM resource_identities WHERE identity_key = ?`).bind(identityKey).first<{ server_id: string }>();
    if (row?.server_id) return row.server_id;
  }
  return null;
}

async function existingServerState(db: D1Database, serverId: string | null): Promise<{
  repoUrl: string | null;
  packageName: string | null;
  homepage: string | null;
  versionCount: number;
  sourceRegistries: string[];
} | null> {
  if (!serverId) return null;
  const row = await db
    .prepare(`SELECT repo_url, package_name, homepage, version_count, source_registries FROM servers WHERE id = ?`)
    .bind(serverId)
    .first<{ repo_url: string | null; package_name: string | null; homepage: string | null; version_count: number; source_registries: string }>();
  if (!row) return null;
  let sourceRegistries: string[] = [];
  try {
    const parsed = JSON.parse(row.source_registries) as unknown;
    if (Array.isArray(parsed)) sourceRegistries = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // Preserve processing even if an old source field is malformed.
  }
  return {
    repoUrl: row.repo_url,
    packageName: row.package_name,
    homepage: row.homepage,
    versionCount: row.version_count,
    sourceRegistries,
  };
}

async function rememberIdentities(db: D1Database, serverId: string, payload: NormalizedSubmission): Promise<void> {
  const keys = resourceIdentityKeys(payload);
  if (!keys.length) return;
  await db.batch(
    keys.map((identityKey) =>
      db
        .prepare(`INSERT INTO resource_identities (identity_key, server_id, created_at) VALUES (?, ?, ?) ON CONFLICT(identity_key) DO NOTHING`)
        .bind(identityKey, serverId, new Date().toISOString()),
    ),
  );
}

async function enqueueVerification(env: CloudflareEnv, serverId: string, transport: "remote" | "local", hasConfig: boolean): Promise<void> {
  if (transport === "remote" && env.VERIFY_QUEUE) {
    await env.VERIFY_QUEUE.send({ serverId });
    return;
  }
  if (transport === "local" && hasConfig && env.STDIO_PROBE_ENABLED === "true" && env.STDIO_PROBE_QUEUE) {
    await env.STDIO_PROBE_QUEUE.send({ kind: "stdio", serverId });
  }
}

export async function processSubmission(
  env: CloudflareEnv,
  submissionId: string,
): Promise<{ submissionId: string; status: "processed" | "rejected"; resourceId: string | null }> {
  const row = await env.DB.prepare(`SELECT id, payload, status, resource_id, attempts FROM submissions WHERE id = ?`)
    .bind(submissionId)
    .first<SubmissionRow>();
  if (!row) throw new Error("submission_not_found");
  if (row.status === "processed") return { submissionId, status: "processed", resourceId: row.resource_id };
  if (row.status === "rejected") return { submissionId, status: "rejected", resourceId: null };

  const startedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE submissions SET status = 'processing', processing_started_at = ?, attempts = attempts + 1, error_code = NULL WHERE id = ?`,
  )
    .bind(startedAt, submissionId)
    .run();

  try {
    const payload = parsePayload(row.payload);
    const evidence = await fetchPublicEvidence(payload, fetch, handshakeMcp);
    const evidencePayload: NormalizedSubmission = {
      ...payload,
      ...(evidence.repoUrl ? { repoUrl: evidence.repoUrl } : {}),
      ...(evidence.packageName ? { packageName: evidence.packageName } : {}),
      ...(evidence.packageRegistry ? { packageRegistry: evidence.packageRegistry } : {}),
    };
    const identityKeys = resourceIdentityKeys(evidencePayload);
    if (!identityKeys.length) throw new Error("resource_identity_missing");
    const existingId = await existingServerId(env.DB, evidencePayload);
    const resourceId = existingId ?? (await serverIdForIdentity(identityKeys[0]!));
    const collectedAt = new Date().toISOString();
    if (existingId && !evidence.repoUrl && !evidence.packageName) {
      await rememberIdentities(env.DB, resourceId, evidencePayload);
      if (evidence.handshake) await verifyServer(env, resourceId, evidence.handshake);
      await env.DB.prepare(
        `UPDATE submissions SET status = 'processed', resource_id = ?, processed_at = ?, error_code = NULL WHERE id = ?`,
      )
        .bind(resourceId, collectedAt, submissionId)
        .run();
      return { submissionId, status: "processed", resourceId };
    }
    const existing = await existingServerState(env.DB, existingId);
    const remotes = payload.remoteUrl ? [{ url: payload.remoteUrl }] : [];
    const reliableConfig = extractReliableConfig({ readme: evidence.readme, remotes, serverKey: evidence.title });
    const declaredTools = declaredToolsFromSources({ tools: evidence.tools, readme: evidence.readme });
    const transport = payload.remoteUrl ? "remote" : "local";
    const repoUrl = evidence.repoUrl ?? existing?.repoUrl ?? null;
    const packageName = evidence.packageName ?? payload.packageName ?? existing?.packageName ?? null;
    const sourceRegistries = [...new Set([...(existing?.sourceRegistries ?? []), "direct-public-evidence"])];
    const source = emptySourceInfo();
    source.author = evidence.author;
    source.srcUrl = evidence.sourceUrl;
    source.srcSite = new URL(evidence.sourceUrl).hostname;

    await upsertServer(env.DB, {
      id: resourceId,
      title: evidence.title,
      description: evidence.description,
      repoUrl,
      packageName,
      latestVersion: evidence.latestVersion,
      versionCount: Math.max(existing?.versionCount ?? 0, evidence.latestVersion ? 1 : 0),
      firstPublishedAt: evidence.firstPublishedAt,
      lastPublishedAt: evidence.lastPublishedAt,
      isOfficial: isOfficialPublisher(repoUrl),
      transport,
      homepage: evidence.homepage ?? existing?.homepage ?? null,
      remoteUrl: payload.remoteUrl ?? null,
      remoteTransport: payload.remoteUrl?.toLowerCase().includes("/sse") ? "sse" : "streamable-http",
      sourceRegistries,
      claimedToolNames: declaredTools.map((tool) => tool.name),
    });
    await replacePlazaFacts(env.DB, { serverId: resourceId, source, declaredTools, reliableConfig, collectedAt });
    if (evidence.readme) {
      await upsertReadmes(env.DB, [{ serverId: resourceId, body: evidence.readme, collectedAt, reliableConfig }]);
    }
    const staticCheck = checkCatalogServer(
      {
        id: resourceId,
        transport,
        repoUrl,
        reliability: repoUrl?.includes("github.com/") ? "github" : null,
        isOfficial: isOfficialPublisher(repoUrl),
        pricingModel: "unknown",
        lastPublishedAt: evidence.lastPublishedAt,
        tools: declaredTools,
        reliableConfig,
        readme: evidence.readme,
      },
      Date.parse(collectedAt),
    );
    await upsertStaticCheck(env.DB, staticCheck, collectedAt);
    await rememberIdentities(env.DB, resourceId, evidencePayload);
    if (evidence.handshake) await verifyServer(env, resourceId, evidence.handshake);
    await env.DB.prepare(
      `UPDATE submissions SET status = 'processed', resource_id = ?, processed_at = ?, error_code = NULL WHERE id = ?`,
    )
      .bind(resourceId, collectedAt, submissionId)
      .run();
    try {
      if (!evidence.handshake) await enqueueVerification(env, resourceId, transport, Boolean(reliableConfig));
    } catch (error) {
      console.error(JSON.stringify({ path: "submission-verify-enqueue", submissionId, resourceId, error: String(error) }));
    }
    return { submissionId, status: "processed", resourceId };
  } catch (error) {
    const code = errorCode(error);
    const transient = isTransient(error) && row.attempts + 1 < 5;
    await env.DB.prepare(
      `UPDATE submissions SET status = ?, error_code = ?, processed_at = ? WHERE id = ?`,
    )
      .bind(transient ? "queued" : "rejected", code, transient ? null : new Date().toISOString(), submissionId)
      .run();
    if (transient) throw error;
    return { submissionId, status: "rejected", resourceId: null };
  }
}

export async function listRecoverableSubmissionIds(db: D1Database, limit: number): Promise<string[]> {
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const rows = await db
    .prepare(
      `SELECT id FROM submissions
       WHERE attempts < 5 AND (status = 'queued' OR (status = 'processing' AND processing_started_at < ?))
       ORDER BY submitted_at ASC LIMIT ?`,
    )
    .bind(staleBefore, Math.min(100, Math.max(1, limit)))
    .all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}
