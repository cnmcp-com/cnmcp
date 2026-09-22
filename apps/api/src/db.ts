import type { CatalogIndexEntry, DirectoryQuery, Grade, ServerDetail, ServerStatus, ServerSummary, Transport } from "@cnmcp/schema";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function splitId(id: string): { namespace: string; name: string } {
  const index = id.lastIndexOf("/");
  if (index <= 0) return { namespace: id, name: id };
  return { namespace: id.slice(0, index), name: id.slice(index + 1) };
}

type ServerRow = {
  id: string;
  namespace: string;
  name: string;
  title: string;
  description: string;
  repo_url: string | null;
  package_name: string | null;
  latest_version: string | null;
  version_count: number;
  first_published_at: string | null;
  last_published_at: string | null;
  is_official: number;
  source_registries: string;
  transport: Transport;
  protocol_version: string | null;
  capabilities: string;
  license: string | null;
  homepage: string | null;
  docs_url: string | null;
  claimed_tool_names: string;
  status: ServerStatus;
  score: number | null;
  grade: Grade | null;
  algorithm_version: string | null;
  score_reason: string | null;
  verified_at: string | null;
};

function toSummary(row: ServerRow, extra?: { reachableProbe?: boolean | null; latencyMs?: number | null; pricingModel?: string }): ServerSummary {
  return {
    id: row.id,
    namespace: row.namespace,
    name: row.name,
    title: row.title,
    description: row.description,
    transport: row.transport,
    isOfficial: Boolean(row.is_official),
    status: row.status,
    score: row.score,
    grade: row.grade,
    algorithmVersion: row.algorithm_version ?? "v1.0",
    reachableProbe: extra?.reachableProbe ?? null,
    latencyMs: extra?.latencyMs ?? null,
    pricingModel: (extra?.pricingModel as ServerSummary["pricingModel"]) ?? "unknown",
    verifiedAt: row.verified_at,
    lastPublishedAt: row.last_published_at,
    protocolVersion: row.protocol_version,
    sourceRegistries: parseJson(row.source_registries, ["official-registry"]),
  };
}

export async function upsertServer(
  db: D1Database,
  input: {
    id: string;
    title: string;
    description: string;
    repoUrl: string | null;
    packageName: string | null;
    latestVersion: string | null;
    versionCount: number;
    firstPublishedAt: string | null;
    lastPublishedAt: string | null;
    isOfficial: boolean;
    transport: Transport;
    homepage: string | null;
    remoteUrl: string | null;
    remoteTransport: string | null;
    sourceRegistries?: string[];
    claimedToolNames?: string[];
  },
): Promise<{ inserted: boolean }> {
  const now = new Date().toISOString();
  const { namespace, name } = splitId(input.id);
  const existing = await db.prepare(`SELECT id FROM servers WHERE id = ?`).bind(input.id).first<{ id: string }>();
  const sources = input.sourceRegistries?.length ? input.sourceRegistries : ["official-registry"];
  const claimed = JSON.stringify(input.claimedToolNames ?? []);
  const replaceClaimed = Array.isArray(input.claimedToolNames) ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO servers (
        id, namespace, name, title, description, repo_url, package_name, latest_version, version_count,
        first_published_at, last_published_at, is_official, source_registries, transport, capabilities,
        homepage, claimed_tool_names, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, COALESCE((SELECT status FROM servers WHERE id = ?), 'unverified'), ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        repo_url = excluded.repo_url,
        package_name = excluded.package_name,
        latest_version = excluded.latest_version,
        version_count = excluded.version_count,
        last_published_at = excluded.last_published_at,
        is_official = excluded.is_official,
        source_registries = excluded.source_registries,
        transport = excluded.transport,
        homepage = excluded.homepage,
        claimed_tool_names = CASE WHEN ? = 1 THEN excluded.claimed_tool_names ELSE servers.claimed_tool_names END,
        updated_at = excluded.updated_at`,
    )
    .bind(
      input.id,
      namespace,
      name,
      input.title,
      input.description,
      input.repoUrl,
      input.packageName,
      input.latestVersion,
      input.versionCount,
      input.firstPublishedAt,
      input.lastPublishedAt,
      input.isOfficial ? 1 : 0,
      JSON.stringify(sources),
      input.transport,
      input.homepage,
      claimed,
      input.id,
      now,
      now,
      replaceClaimed,
    )
    .run();

  await db.prepare(`INSERT OR IGNORE INTO pricing (server_id, model, source) VALUES (?, 'unknown', 'unverified')`).bind(input.id).run();

  if (input.remoteUrl) {
    const endpoint = await db
      .prepare(`SELECT id FROM endpoints WHERE server_id = ? AND url = ?`)
      .bind(input.id, input.remoteUrl)
      .first<{ id: number }>();
    if (!endpoint) {
      await db
        .prepare(`INSERT INTO endpoints (server_id, url, transport) VALUES (?, ?, ?)`)
        .bind(input.id, input.remoteUrl, input.remoteTransport ?? "streamable-http")
        .run();
    }
  }

  return { inserted: !existing };
}

export async function getDirectory(db: D1Database, query: DirectoryQuery): Promise<{ items: ServerSummary[]; nextCursor: string | null; total: number }> {
  const limit = Math.min(50, Math.max(1, Number.isFinite(query.limit) ? query.limit : 30));
  const offset = query.cursor && /^\d+$/.test(query.cursor) ? Number(query.cursor) : 0;
  const clauses: string[] = [];
  const binds: Array<string | number> = [];

  if (query.q.trim()) {
    clauses.push(`(s.title LIKE ? OR s.name LIKE ? OR s.namespace LIKE ? OR s.description LIKE ?)`);
    const like = `%${query.q.trim()}%`;
    binds.push(like, like, like, like);
  }
  if (query.grade) {
    clauses.push(`s.grade = ?`);
    binds.push(query.grade);
  }
  if (query.transport) {
    clauses.push(`s.transport = ?`);
    binds.push(query.transport);
  }
  if (query.official === "yes") clauses.push(`s.is_official = 1`);
  if (query.official === "no") clauses.push(`s.is_official = 0`);
  if (query.pricing) {
    clauses.push(`COALESCE(p.model, 'unknown') = ?`);
    binds.push(query.pricing);
  }
  if (query.reachable === "yes") clauses.push(`e.reachable_probe = 1`);
  if (query.reachable === "no") clauses.push(`e.reachable_probe = 0`);

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM servers s
       LEFT JOIN pricing p ON p.server_id = s.id
       LEFT JOIN endpoints e ON e.server_id = s.id AND e.id = (
         SELECT id FROM endpoints WHERE server_id = s.id ORDER BY last_checked_at DESC LIMIT 1
       )
       ${where}`,
    )
    .bind(...binds)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT s.*, p.model AS pricing_model, e.reachable_probe, e.latency_ms
       FROM servers s
       LEFT JOIN pricing p ON p.server_id = s.id
       LEFT JOIN endpoints e ON e.server_id = s.id AND e.id = (
         SELECT id FROM endpoints WHERE server_id = s.id ORDER BY last_checked_at DESC LIMIT 1
       )
       ${where}
       ORDER BY (s.score IS NULL), s.score DESC, s.id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<ServerRow & { pricing_model: string | null; reachable_probe: number | null; latency_ms: number | null }>();

  const items = (rows.results ?? []).map((row) =>
    toSummary(row, {
      pricingModel: row.pricing_model ?? "unknown",
      reachableProbe: row.reachable_probe === null ? null : Boolean(row.reachable_probe),
      latencyMs: row.latency_ms,
    }),
  );
  const total = countRow?.total ?? items.length;
  return { items, total, nextCursor: offset + items.length < total ? String(offset + items.length) : null };
}

export async function getServerDetail(db: D1Database, id: string): Promise<ServerDetail | null> {
  const row = await db.prepare(`SELECT * FROM servers WHERE id = ?`).bind(id).first<ServerRow>();
  if (!row) return null;
  const pricing = await db.prepare(`SELECT * FROM pricing WHERE server_id = ?`).bind(id).first<{
    model: ServerDetail["pricing"]["model"];
    detail: string | null;
    billing_party: string | null;
    free_quota: string | null;
    source: ServerDetail["pricing"]["source"];
    collected_at: string | null;
  }>();
  const endpoints = await db.prepare(`SELECT * FROM endpoints WHERE server_id = ?`).bind(id).all<{
    url: string;
    transport: string;
    region: string | null;
    reachable_probe: number | null;
    latency_ms: number | null;
    last_checked_at: string | null;
    last_error: string | null;
  }>();
  const tools = await db.prepare(`SELECT * FROM tools WHERE server_id = ? ORDER BY name`).bind(id).all<{
    name: string;
    description: string;
    input_schema: string | null;
    poisoning_flags: string;
    first_seen_at: string;
    last_seen_at: string;
  }>();
  const verifications = await db
    .prepare(`SELECT * FROM verifications WHERE server_id = ? ORDER BY run_at DESC LIMIT 32`)
    .bind(id)
    .all<{ id: string; server_id: string; run_at: string; checker: "alive" | "contract" | "probe" | "freshness"; status: "pass" | "warn" | "fail" | "skip"; score: number; evidence_json: string }>();
  const snapshots = await db
    .prepare(`SELECT * FROM score_snapshots WHERE server_id = ? ORDER BY computed_at DESC LIMIT 90`)
    .bind(id)
    .all<{ server_id: string; score: number | null; grade: Grade | null; algorithm_version: string; computed_at: string; reason: ServerDetail["snapshots"][number]["reason"]; components_json: string }>();
  const events = await db
    .prepare(`SELECT * FROM change_events WHERE server_id = ? ORDER BY detected_at DESC LIMIT 20`)
    .bind(id)
    .all<{ server_id: string; type: ServerDetail["changeEvents"][number]["type"]; severity: ServerDetail["changeEvents"][number]["severity"]; diff_json: string; detected_at: string }>();

  const primary = endpoints.results?.[0];
  const summary = toSummary(row, {
    pricingModel: pricing?.model ?? "unknown",
    reachableProbe: primary?.reachable_probe === null || primary?.reachable_probe === undefined ? null : Boolean(primary.reachable_probe),
    latencyMs: primary?.latency_ms ?? null,
  });

  return {
    ...summary,
    repoUrl: row.repo_url,
    packageName: row.package_name,
    latestVersion: row.latest_version,
    versionCount: row.version_count,
    firstPublishedAt: row.first_published_at,
    license: row.license,
    homepage: row.homepage,
    docsUrl: row.docs_url,
    capabilities: parseJson(row.capabilities, []),
    vendor: null,
    pricing: {
      serverId: id,
      model: pricing?.model ?? "unknown",
      detail: pricing?.detail ?? null,
      billingParty: pricing?.billing_party ?? null,
      freeQuota: pricing?.free_quota ?? null,
      source: pricing?.source ?? "unverified",
      collectedAt: pricing?.collected_at ?? null,
    },
    endpoints: (endpoints.results ?? []).map((endpoint) => ({
      url: endpoint.url,
      transport: endpoint.transport,
      region: endpoint.region,
      reachableProbe: endpoint.reachable_probe === null ? null : Boolean(endpoint.reachable_probe),
      latencyMs: endpoint.latency_ms,
      lastCheckedAt: endpoint.last_checked_at,
      lastError: endpoint.last_error,
    })),
    tools: (tools.results ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: parseJson(tool.input_schema, null),
      poisoningFlags: parseJson(tool.poisoning_flags, []),
      firstSeenAt: tool.first_seen_at,
      lastSeenAt: tool.last_seen_at,
    })),
    claimedToolNames: parseJson(row.claimed_tool_names, []),
    verifications: (verifications.results ?? []).map((item) => ({
      id: item.id,
      serverId: item.server_id,
      runAt: item.run_at,
      checker: item.checker,
      status: item.status,
      score: item.score,
      evidence: parseJson(item.evidence_json, {}),
    })),
    snapshots: (snapshots.results ?? []).map((item) => ({
      serverId: item.server_id,
      score: item.score,
      grade: item.grade,
      algorithmVersion: item.algorithm_version,
      computedAt: item.computed_at,
      reason: item.reason,
      components: parseJson(item.components_json, {
        alive: { status: "skip", score: 0, evidence: {} },
        contract: { status: "skip", score: 0, evidence: {} },
        probe: { status: "skip", score: 0, evidence: {} },
        freshness: { status: "skip", score: 0, evidence: {} },
      }),
    })),
    changeEvents: (events.results ?? []).map((item) => ({
      serverId: item.server_id,
      type: item.type,
      severity: item.severity,
      diff: parseJson(item.diff_json, {}),
      detectedAt: item.detected_at,
    })),
  };
}

export async function listCatalogEntries(db: D1Database): Promise<CatalogIndexEntry[]> {
  const rows = await db
    .prepare(
      `SELECT s.id, s.name, s.namespace, s.title, s.score, s.grade, s.transport, s.status, s.version_count,
              s.protocol_version, p.model AS pricing_model, p.billing_party, e.reachable_probe, e.latency_ms, e.url
       FROM servers s
       LEFT JOIN pricing p ON p.server_id = s.id
       LEFT JOIN endpoints e ON e.server_id = s.id AND e.id = (
         SELECT id FROM endpoints WHERE server_id = s.id ORDER BY last_checked_at DESC LIMIT 1
       )`,
    )
    .all<{
      id: string;
      name: string;
      namespace: string;
      title: string;
      score: number | null;
      grade: Grade | null;
      transport: Transport;
      status: ServerStatus;
      version_count: number;
      protocol_version: string | null;
      pricing_model: CatalogIndexEntry["pricingModel"] | null;
      billing_party: string | null;
      reachable_probe: number | null;
      latency_ms: number | null;
      url: string | null;
    }>();

  return (rows.results ?? []).map((row) => {
    let endpointHost: string | null = null;
    if (row.url) {
      try {
        endpointHost = new URL(row.url).host;
      } catch {
        endpointHost = null;
      }
    }
    return {
      id: row.id,
      name: row.name,
      namespace: row.namespace,
      title: row.title,
      score: row.score,
      grade: row.grade,
      transport: row.transport,
      status: row.status,
      reachableProbe: row.reachable_probe === null || row.reachable_probe === undefined ? null : Boolean(row.reachable_probe),
      latencyMs: row.latency_ms,
      auth: null,
      region: null,
      versionCount: row.version_count,
      protocolVersion: row.protocol_version,
      pricingModel: row.pricing_model ?? "unknown",
      billingParty: row.billing_party,
      poisoned: false,
      endpointHost,
    };
  });
}

export async function getStats(db: D1Database): Promise<{
  total: number;
  remote: number;
  verified: number;
  reachable: number;
  dead: number;
  lastVerifiedAt: string | null;
}> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN transport = 'remote' THEN 1 ELSE 0 END) AS remote,
        SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead,
        MAX(verified_at) AS last_verified_at
       FROM servers`,
    )
    .first<{ total: number; remote: number; verified: number; dead: number; last_verified_at: string | null }>();
  const reachable = await db
    .prepare(`SELECT COUNT(DISTINCT server_id) AS n FROM endpoints WHERE reachable_probe = 1`)
    .first<{ n: number }>();
  return {
    total: row?.total ?? 0,
    remote: row?.remote ?? 0,
    verified: row?.verified ?? 0,
    reachable: reachable?.n ?? 0,
    dead: row?.dead ?? 0,
    lastVerifiedAt: row?.last_verified_at ?? null,
  };
}

export async function listDueServerIds(db: D1Database, limit: number): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT id FROM servers
       WHERE transport = 'remote'
         AND (next_verify_at IS NULL OR next_verify_at <= ?)
       ORDER BY next_verify_at IS NULL DESC, next_verify_at ASC
       LIMIT ?`,
    )
    .bind(new Date().toISOString(), limit)
    .all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

export async function listRemoteServerIds(db: D1Database, limit: number): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT id FROM servers WHERE transport = 'remote' ORDER BY updated_at DESC LIMIT ?`)
    .bind(limit)
    .all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

export { asRecord, parseJson, splitId };
