import { blockedSourceSql, matchPublisher, sourceLabelOf, type ActivityItem, type CatalogIndexEntry, type DeclaredTool, type DirectoryQuery, type Grade, type ReliableConfig, type ServerDetail, type ServerStatus, type ServerSummary, type SourceInfo, type ToolParameter, type Transport } from "@cnmcp/schema";
import type { StaticCatalogCheck } from "@cnmcp/checkers";

import { emptySourceInfo, isLikelyMcpEndpoint, parametersFromSchema } from "./plaza-normalize";

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

function toSummary(
  row: ServerRow,
  extra?: { reachableProbe?: boolean | null; latencyMs?: number | null; pricingModel?: string; sourceLabel?: string | null; srcUrl?: string | null; staticScore?: number | null },
): ServerSummary {
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
    staticScore: extra?.staticScore ?? null,
    grade: row.grade,
    algorithmVersion: row.algorithm_version ?? "v1.0",
    reachableProbe: extra?.reachableProbe ?? null,
    latencyMs: extra?.latencyMs ?? null,
    pricingModel: (extra?.pricingModel as ServerSummary["pricingModel"]) ?? "unknown",
    verifiedAt: row.verified_at,
    lastPublishedAt: row.last_published_at,
    protocolVersion: row.protocol_version,
    sourceRegistries: parseJson(row.source_registries, ["official-registry"]),
    sourceLabel: extra?.sourceLabel ?? sourceLabelOf({ namespace: row.namespace }),
    publisher: matchPublisher(extra?.srcUrl),
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

export async function upsertStaticCheck(db: D1Database, check: StaticCatalogCheck, checkedAt: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO static_checks (
         server_id, checker_version, status, dynamic_mode, risk_level, confidence_score,
         warning_count, high_count, evidence_json, checked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET
         checker_version = excluded.checker_version,
         status = excluded.status,
         dynamic_mode = excluded.dynamic_mode,
         risk_level = excluded.risk_level,
         confidence_score = excluded.confidence_score,
         warning_count = excluded.warning_count,
         high_count = excluded.high_count,
         evidence_json = excluded.evidence_json,
         checked_at = excluded.checked_at`,
    )
    .bind(
      check.serverId,
      check.checkerVersion,
      check.status,
      check.dynamicMode,
      check.risk.level,
      check.confidence.score,
      check.risk.warnings,
      check.risk.high,
      JSON.stringify(check),
      checkedAt,
    )
    .run();
}

export async function replacePlazaFacts(
  db: D1Database,
  input: {
    serverId: string;
    source: SourceInfo;
    declaredTools: DeclaredTool[];
    reliableConfig: ReliableConfig | null;
    collectedAt: string;
  },
): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO server_sources (
          server_id, author, icon_url, src_url, src_site, plaza_url, categories_json, plaza_categories_json, collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          author = excluded.author,
          icon_url = excluded.icon_url,
          src_url = excluded.src_url,
          src_site = excluded.src_site,
          plaza_url = excluded.plaza_url,
          categories_json = excluded.categories_json,
          plaza_categories_json = excluded.plaza_categories_json,
          collected_at = excluded.collected_at`,
      )
      .bind(
        input.serverId,
        input.source.author,
        input.source.iconUrl,
        input.source.srcUrl,
        input.source.srcSite,
        input.source.plazaUrl,
        JSON.stringify(input.source.categories),
        JSON.stringify(input.source.plazaCategories),
        input.collectedAt,
      ),
    db.prepare(`DELETE FROM declared_tools WHERE server_id = ?`).bind(input.serverId),
    db.prepare(`DELETE FROM server_configs WHERE server_id = ?`).bind(input.serverId),
    ...input.declaredTools.map((tool) =>
      db
        .prepare(
          `INSERT INTO declared_tools (server_id, name, description, input_schema, parameters_json)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          input.serverId,
          tool.name,
          tool.description,
          tool.inputSchema == null ? null : JSON.stringify(tool.inputSchema),
          JSON.stringify(tool.parameters),
        ),
    ),
  ];
  if (input.reliableConfig) {
    statements.push(
      db
        .prepare(`INSERT INTO server_configs (server_id, config_json, source, collected_at) VALUES (?, ?, ?, ?)`)
        .bind(input.serverId, JSON.stringify(input.reliableConfig.config), input.reliableConfig.source, input.collectedAt),
    );
  }
  for (let index = 0; index < statements.length; index += 40) {
    await db.batch(statements.slice(index, index + 40));
  }
}

function remoteUrlOf(config: ReliableConfig | null): string | null {
  if (!config) return null;
  for (const raw of Object.values(config.config.mcpServers)) {
    const entry = asRecord(raw);
    const url = typeof entry?.url === "string" ? entry.url : "";
    if (url && isLikelyMcpEndpoint(url)) return url;
  }
  return null;
}

export async function upsertReadmes(
  db: D1Database,
  items: Array<{ serverId: string; body: string; collectedAt: string; reliableConfig: ReliableConfig | null }>,
): Promise<{ readmes: number; configs: number }> {
  let readmes = 0;
  let configs = 0;
  for (const item of items) {
    const body = item.body.trim().slice(0, 24_000);
    if (!item.serverId || body.length < 40) continue;
    const server = await db.prepare(`SELECT id FROM servers WHERE id = ?`).bind(item.serverId).first<{ id: string }>();
    if (!server) continue;
    await db
      .prepare(
        `INSERT INTO server_readmes (server_id, body, collected_at) VALUES (?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET body = excluded.body, collected_at = excluded.collected_at`,
      )
      .bind(item.serverId, body, item.collectedAt)
      .run();
    readmes += 1;
    if (!item.reliableConfig) continue;
    const existing = await db.prepare(`SELECT server_id FROM server_configs WHERE server_id = ?`).bind(item.serverId).first();
    if (existing) continue;
    await db
      .prepare(`INSERT INTO server_configs (server_id, config_json, source, collected_at) VALUES (?, ?, ?, ?)`)
      .bind(item.serverId, JSON.stringify(item.reliableConfig.config), item.reliableConfig.source, item.collectedAt)
      .run();
    configs += 1;
    const url = remoteUrlOf(item.reliableConfig);
    if (!url) continue;
    await db.prepare(`UPDATE servers SET transport = 'remote', updated_at = ? WHERE id = ? AND transport != 'remote'`).bind(item.collectedAt, item.serverId).run();
    const endpoint = await db.prepare(`SELECT id FROM endpoints WHERE server_id = ? AND url = ?`).bind(item.serverId, url).first();
    if (!endpoint) {
      await db.prepare(`INSERT INTO endpoints (server_id, url, transport) VALUES (?, ?, 'streamable-http')`).bind(item.serverId, url).run();
    }
  }
  return { readmes, configs };
}

export async function getDirectory(db: D1Database, query: DirectoryQuery): Promise<{ items: ServerSummary[]; nextCursor: string | null; total: number }> {
  const limit = Math.min(50, Math.max(1, Number.isFinite(query.limit) ? query.limit : 30));
  const offset = query.cursor && /^\d+$/.test(query.cursor) ? Number(query.cursor) : 0;
  const clauses: string[] = [];
  const binds: Array<string | number> = [];

  if (query.q.trim()) {
    clauses.push(`(
      s.title LIKE ? OR s.name LIKE ? OR s.namespace LIKE ? OR s.description LIKE ? OR
      src.author LIKE ? OR
      EXISTS (
        SELECT 1 FROM declared_tools dt
        WHERE dt.server_id = s.id AND (dt.name LIKE ? OR dt.description LIKE ?)
      )
    )`);
    const like = `%${query.q.trim()}%`;
    binds.push(like, like, like, like, like, like, like);
  }
  const businessKeywords: Record<string, string[]> = {
    development: ["code", "coding", "developer", "github", "git", "software", "debug", "代码", "开发", "编程"],
    data: ["database", "data", "sql", "postgres", "mysql", "analytics", "数据", "分析", "数据库"],
    research: ["research", "search", "knowledge", "paper", "document", "研究", "检索", "知识", "文档"],
    content: ["content", "image", "video", "media", "writing", "design", "内容", "图像", "视频", "写作", "设计"],
    operations: ["marketing", "seo", "sales", "crm", "customer", "运营", "营销", "销售", "客户"],
    productivity: ["productivity", "calendar", "email", "notion", "slack", "project", "办公", "日历", "邮件", "协作", "项目"],
    automation: ["automation", "workflow", "browser", "agent", "自动化", "工作流", "浏览器", "智能体"],
    security: ["security", "scan", "audit", "risk", "安全", "审计", "风险", "扫描"],
  };
  const categoryKeywords = businessKeywords[query.business];
  if (categoryKeywords?.length) {
    clauses.push(`(${categoryKeywords.map(() => `(s.title LIKE ? OR s.name LIKE ? OR s.description LIKE ?)`).join(" OR ")})`);
    for (const keyword of categoryKeywords) {
      const like = `%${keyword}%`;
      binds.push(like, like, like);
    }
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
  if (query.verification === "dynamic") clauses.push(`s.score IS NOT NULL`);
  if (query.verification === "static") clauses.push(`sc.confidence_score IS NOT NULL`);
  if (query.verification === "incomplete") clauses.push(`s.score IS NULL AND s.status IN ('dead', 'local_untested', 'unverifiable', 'unverified')`);
  const blocked = blockedSourceSql();
  if (blocked) {
    clauses.push(blocked.sql);
    binds.push(...blocked.binds);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM servers s
       LEFT JOIN pricing p ON p.server_id = s.id
       LEFT JOIN static_checks sc ON sc.server_id = s.id
       LEFT JOIN endpoints e ON e.server_id = s.id AND e.id = (
         SELECT id FROM endpoints WHERE server_id = s.id ORDER BY last_checked_at DESC LIMIT 1
       )
       LEFT JOIN server_sources src ON src.server_id = s.id
       ${where}`,
    )
    .bind(...binds)
    .first<{ total: number }>();

  const sortOrders = {
    static: `sc.confidence_score DESC, (s.score IS NULL), s.score DESC, s.id ASC`,
    recent: `COALESCE(s.verified_at, sc.checked_at, s.updated_at) DESC, s.id ASC`,
    official: `s.is_official DESC, (s.score IS NULL), s.score DESC, sc.confidence_score DESC, s.id ASC`,
    dynamic: `(s.score IS NULL), s.score DESC, sc.confidence_score DESC, s.id ASC`,
  } as const;
  const sortKey = query.sort && query.sort in sortOrders ? query.sort : "static";
  const orderBy = sortOrders[sortKey as keyof typeof sortOrders];
  const searchOrder = query.q.trim()
    ? `CASE
         WHEN LOWER(s.title) = LOWER(?) OR LOWER(s.name) = LOWER(?) THEN 0
         WHEN LOWER(s.title) LIKE LOWER(?) OR LOWER(s.name) LIKE LOWER(?) THEN 1
         ELSE 2
       END, `
    : "";
  const searchOrderBinds = query.q.trim()
    ? [query.q.trim(), query.q.trim(), `${query.q.trim()}%`, `${query.q.trim()}%`]
    : [];

  const rows = await db
    .prepare(
      `SELECT s.*, p.model AS pricing_model, e.reachable_probe, e.latency_ms, src.src_url, src.author AS source_author,
              sc.confidence_score AS static_score
       FROM servers s
       LEFT JOIN pricing p ON p.server_id = s.id
       LEFT JOIN static_checks sc ON sc.server_id = s.id
       LEFT JOIN endpoints e ON e.server_id = s.id AND e.id = (
         SELECT id FROM endpoints WHERE server_id = s.id ORDER BY last_checked_at DESC LIMIT 1
       )
       LEFT JOIN server_sources src ON src.server_id = s.id
       ${where}
       ORDER BY ${searchOrder}${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, ...searchOrderBinds, limit, offset)
    .all<ServerRow & { pricing_model: string | null; reachable_probe: number | null; latency_ms: number | null; src_url: string | null; source_author: string | null; static_score: number | null }>();

  const items = (rows.results ?? []).map((row) =>
    toSummary(row, {
      pricingModel: row.pricing_model ?? "unknown",
      reachableProbe: row.reachable_probe === null ? null : Boolean(row.reachable_probe),
      latencyMs: row.latency_ms,
      sourceLabel: sourceLabelOf({ namespace: row.namespace, srcUrl: row.src_url, author: row.source_author }),
      srcUrl: row.src_url,
      staticScore: row.static_score,
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
  const source = await db.prepare(`SELECT * FROM server_sources WHERE server_id = ?`).bind(id).first<{
    author: string | null;
    icon_url: string | null;
    src_url: string | null;
    src_site: string | null;
    plaza_url: string | null;
    categories_json: string;
    plaza_categories_json: string;
  }>();
  const declared = await db.prepare(`SELECT * FROM declared_tools WHERE server_id = ? ORDER BY name`).bind(id).all<{
    name: string;
    description: string;
    input_schema: string | null;
    parameters_json: string;
  }>();
  const config = await db.prepare(`SELECT config_json, source FROM server_configs WHERE server_id = ?`).bind(id).first<{
    config_json: string;
    source: string;
  }>();
  const readme = await db.prepare(`SELECT body, collected_at FROM server_readmes WHERE server_id = ?`).bind(id).first<{
    body: string;
    collected_at: string | null;
  }>();
  const staticCheck = await db.prepare(`SELECT confidence_score FROM static_checks WHERE server_id = ?`).bind(id).first<{
    confidence_score: number;
  }>();

  const primary = endpoints.results?.[0];
  const summary = toSummary(row, {
    pricingModel: pricing?.model ?? "unknown",
    reachableProbe: primary?.reachable_probe === null || primary?.reachable_probe === undefined ? null : Boolean(primary.reachable_probe),
    latencyMs: primary?.latency_ms ?? null,
    sourceLabel: sourceLabelOf({
      namespace: row.namespace,
      srcUrl: source?.src_url,
      author: source?.author,
    }),
    srcUrl: source?.src_url,
    staticScore: staticCheck?.confidence_score ?? null,
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
    declaredTools: (declared.results ?? []).map((tool) => {
      const inputSchema = parseJson(tool.input_schema, null);
      const parameters = parseJson<ToolParameter[]>(tool.parameters_json, []);
      return {
        name: tool.name,
        description: tool.description,
        inputSchema,
        parameters: parameters.length ? parameters : parametersFromSchema(inputSchema),
      };
    }),
    source: source
      ? {
          author: source.author,
          iconUrl: source.icon_url,
          srcUrl: source.src_url,
          srcSite: source.src_site,
          plazaUrl: source.plaza_url,
          categories: parseJson(source.categories_json, []),
          plazaCategories: parseJson(source.plaza_categories_json, []),
        }
      : emptySourceInfo(),
    reliableConfig:
      config && (config.source === "readme" || config.source === "remote")
        ? { source: config.source, config: parseJson(config.config_json, { mcpServers: {} }) }
        : null,
    readme: readme?.body ? { body: readme.body, collectedAt: readme.collected_at } : null,
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
  localUntested: number;
  unverifiable: number;
  official: number;
  staticChecked: number;
  configured: number;
  pricingKnown: number;
  gradeA: number;
  gradeB: number;
  lastVerifiedAt: string | null;
}> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN transport = 'remote' THEN 1 ELSE 0 END) AS remote,
        SUM(CASE WHEN s.status = 'verified' THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN s.status = 'dead' THEN 1 ELSE 0 END) AS dead,
        SUM(CASE WHEN s.status = 'local_untested' THEN 1 ELSE 0 END) AS local_untested,
        SUM(CASE WHEN s.status = 'unverifiable' THEN 1 ELSE 0 END) AS unverifiable,
        SUM(CASE WHEN s.is_official = 1 THEN 1 ELSE 0 END) AS official,
        SUM(CASE WHEN sc.server_id IS NOT NULL THEN 1 ELSE 0 END) AS static_checked,
        SUM(CASE WHEN cfg.server_id IS NOT NULL THEN 1 ELSE 0 END) AS configured,
        SUM(CASE WHEN COALESCE(p.model, 'unknown') != 'unknown' THEN 1 ELSE 0 END) AS pricing_known,
        SUM(CASE WHEN s.grade = 'A' THEN 1 ELSE 0 END) AS grade_a,
        SUM(CASE WHEN s.grade = 'B' THEN 1 ELSE 0 END) AS grade_b,
        MAX(s.verified_at) AS last_verified_at
       FROM servers s
       LEFT JOIN static_checks sc ON sc.server_id = s.id
       LEFT JOIN server_configs cfg ON cfg.server_id = s.id
       LEFT JOIN pricing p ON p.server_id = s.id`,
    )
    .first<{
      total: number; remote: number; verified: number; dead: number; local_untested: number; unverifiable: number;
      official: number; static_checked: number; configured: number; pricing_known: number; grade_a: number; grade_b: number;
      last_verified_at: string | null;
    }>();
  const reachable = await db
    .prepare(`SELECT COUNT(DISTINCT server_id) AS n FROM endpoints WHERE reachable_probe = 1`)
    .first<{ n: number }>();
  return {
    total: row?.total ?? 0,
    remote: row?.remote ?? 0,
    verified: row?.verified ?? 0,
    reachable: reachable?.n ?? 0,
    dead: row?.dead ?? 0,
    localUntested: row?.local_untested ?? 0,
    unverifiable: row?.unverifiable ?? 0,
    official: row?.official ?? 0,
    staticChecked: row?.static_checked ?? 0,
    configured: row?.configured ?? 0,
    pricingKnown: row?.pricing_known ?? 0,
    gradeA: row?.grade_a ?? 0,
    gradeB: row?.grade_b ?? 0,
    lastVerifiedAt: row?.last_verified_at ?? null,
  };
}

export async function getRecentActivity(db: D1Database, limit: number): Promise<ActivityItem[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 30;
  const rows = await db
    .prepare(
      `SELECT kind, server_id, title, status, severity, score, grade, detail, occurred_at FROM (
         SELECT 'verification' AS kind, s.id AS server_id, s.title, s.status,
                CASE WHEN s.status = 'dead' THEN 'high' WHEN s.score IS NULL THEN 'warn' ELSE 'info' END AS severity,
                s.score, s.grade, COALESCE(s.score_reason, s.status) AS detail, s.verified_at AS occurred_at
         FROM servers s WHERE s.verified_at IS NOT NULL
         UNION ALL
         SELECT 'change' AS kind, ce.server_id, s.title, s.status, ce.severity,
                NULL AS score, NULL AS grade, ce.type AS detail, ce.detected_at AS occurred_at
         FROM change_events ce JOIN servers s ON s.id = ce.server_id
       ) activity
       ORDER BY occurred_at DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<{
      kind: ActivityItem["kind"]; server_id: string; title: string; status: ServerStatus | null;
      severity: ActivityItem["severity"]; score: number | null; grade: Grade | null; detail: string; occurred_at: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    kind: row.kind,
    serverId: row.server_id,
    title: row.title,
    status: row.status,
    severity: row.severity,
    score: row.score,
    grade: row.grade,
    detail: row.detail,
    occurredAt: row.occurred_at,
  }));
}

export async function listProbeQueue(db: D1Database, transport: "local" | "remote", limit: number): Promise<string[]> {
  const blocked = blockedSourceSql();
  const due = transport === "remote" ? `AND (s.next_verify_at IS NULL OR s.next_verify_at <= ?)` : `AND s.status IN ('unverified', 'local_untested')`;
  const binds: Array<string | number> = [transport];
  if (transport === "remote") binds.push(new Date().toISOString());
  if (blocked) binds.push(...blocked.binds);
  const rows = await db
    .prepare(
      `SELECT s.id, src.src_url FROM servers s
       LEFT JOIN server_sources src ON src.server_id = s.id
       WHERE s.transport = ?
         ${due}
         ${blocked ? `AND ${blocked.sql}` : ""}
       ORDER BY s.next_verify_at IS NULL DESC, s.next_verify_at ASC, s.id ASC`,
    )
    .bind(...binds)
    .all<{ id: string; src_url: string | null }>();
  return (rows.results ?? [])
    .sort((a, b) => Number(matchPublisher(b.src_url)?.tier === "known") - Number(matchPublisher(a.src_url)?.tier === "known"))
    .slice(0, limit)
    .map((row) => row.id);
}

export async function listDueServerIds(db: D1Database, limit: number): Promise<string[]> {
  return listProbeQueue(db, "remote", limit);
}

export async function listRemoteServerIds(db: D1Database, limit: number): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT id FROM servers WHERE transport = 'remote' ORDER BY updated_at DESC LIMIT ?`)
    .bind(limit)
    .all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

export { asRecord, parseJson, splitId };
