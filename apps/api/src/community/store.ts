import {
  projectSlugFromRepoKey,
  publicSecurityStatus,
  type ProjectCard,
  type ProjectDetail,
  type ReviewItem,
  type ScanEvidence,
  type SecurityStatus,
  type TaxonomyEntry,
} from "@cnmcp/schema";

import type { GitHubRepository } from "../github-scan";
import type { RepoSnapshot } from "./github";
import { HttpError, all, get, parseJson, run, type SqlDatabase } from "./sql";

type ProjectRow = {
  id: string;
  slug: string;
  repo_key: string;
  repo_url: string;
  title: string;
  summary: string;
  recommendation: string | null;
  homepage: string | null;
  stars: number;
  language: string | null;
  topics_json: string;
  tags_json: string;
  pushed_at: string | null;
  archived: number;
  primary_category_slug: string | null;
  primary_type_slug: string | null;
  status: string;
  heat_score: number;
  submitted_by: string | null;
  created_at: string;
  category_name: string | null;
  type_name: string | null;
  like_count: number;
  rating_count: number;
  rating_avg: number | null;
  favorite_count?: number;
  static_status: string | null;
  dynamic_status: string | null;
};

type ScanRow = {
  id: string;
  project_id: string;
  clues_json: string;
  static_status: string;
  static_evidence_json: string;
  dynamic_status: string;
  dynamic_evidence_json: string;
  created_at: string;
};

const SECURITY_SQL = `
CASE
  WHEN latest.static_status = 'risk' OR latest.dynamic_status = 'risk' THEN 'risk'
  WHEN latest.static_status = 'warn' OR latest.dynamic_status = 'warn' THEN 'warn'
  WHEN latest.project_id IS NULL OR latest.static_status = 'pending' OR latest.dynamic_status = 'pending' THEN 'pending'
  WHEN latest.static_status = 'scan_failed' OR latest.dynamic_status = 'scan_failed' THEN 'scan_failed'
  WHEN latest.static_status = 'clear' AND (latest.dynamic_status = 'clear' OR latest.dynamic_status = 'skipped') THEN 'clear'
  ELSE 'pending'
END
`;

const PROJECT_FROM = `
FROM projects p
LEFT JOIN categories c ON c.slug = p.primary_category_slug
LEFT JOIN project_types t ON t.slug = p.primary_type_slug
LEFT JOIN security_scans latest ON latest.rowid = (
  SELECT s.rowid FROM security_scans s
  WHERE s.project_id = p.id
  ORDER BY s.created_at DESC, s.rowid DESC
  LIMIT 1
)
`;

const PROJECT_SELECT = `
SELECT
  p.id, p.slug, p.repo_key, p.repo_url, p.title, p.summary, p.recommendation, p.homepage,
  p.stars, p.language, p.topics_json, p.tags_json, p.pushed_at, p.archived,
  p.primary_category_slug, p.primary_type_slug, p.status, p.heat_score, p.submitted_by, p.created_at,
  c.name AS category_name,
  t.name AS type_name,
  (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM ratings r WHERE r.project_id = p.id) AS rating_count,
  (SELECT AVG(r.stars) FROM ratings r WHERE r.project_id = p.id) AS rating_avg,
  (SELECT COUNT(*) FROM collection_items ci WHERE ci.project_id = p.id) AS favorite_count,
  latest.static_status AS static_status,
  latest.dynamic_status AS dynamic_status
${PROJECT_FROM}
`;

export type SubmissionRow = {
  id: string;
  project_id: string | null;
  user_id: string | null;
  repo_url: string;
  repo_key: string;
  recommendation: string | null;
  status: string;
  error_code: string | null;
};

export type StoredProject = {
  id: string;
  slug: string;
  repoKey: string;
  title: string;
  primaryCategorySlug: string | null;
  primaryTypeSlug: string | null;
  tags: string[];
  status: string;
};

function cardOf(row: ProjectRow): ProjectCard {
  const securityStatus = publicSecurityStatus(row.static_status, row.dynamic_status);
  return {
    slug: row.slug,
    title: row.title,
    repoKey: row.repo_key,
    repoUrl: row.repo_url,
    summary: row.summary,
    recommendation: row.recommendation,
    stars: row.stars,
    language: row.language,
    category: row.primary_category_slug && row.category_name ? { slug: row.primary_category_slug, name: row.category_name } : null,
    type: row.primary_type_slug && row.type_name ? { slug: row.primary_type_slug, name: row.type_name } : null,
    securityStatus,
    likeCount: row.like_count ?? 0,
    ratingAvg: row.rating_avg == null ? null : Math.round(Number(row.rating_avg) * 10) / 10,
    ratingCount: row.rating_count ?? 0,
    heatScore: Number(row.heat_score ?? 0),
    createdAt: row.created_at,
  };
}

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 40)).slice(0, 24);
}

export async function listTaxonomy(db: SqlDatabase): Promise<{ categories: TaxonomyEntry[]; types: Array<TaxonomyEntry & { enablesDynamicProbe: boolean }> }> {
  const categories = await all<{ slug: string; name: string; keywords_json: string }>(db, `SELECT slug, name, keywords_json FROM categories ORDER BY sort_order, name`);
  const types = await all<{ slug: string; name: string; keywords_json: string; enables_dynamic_probe: number }>(
    db,
    `SELECT slug, name, keywords_json, enables_dynamic_probe FROM project_types ORDER BY sort_order, name`,
  );
  return {
    categories: categories.map((row) => ({ slug: row.slug, name: row.name, keywords: cleanKeywords(parseJson(row.keywords_json, [])) })),
    types: types.map((row) => ({
      slug: row.slug,
      name: row.name,
      keywords: cleanKeywords(parseJson(row.keywords_json, [])),
      enablesDynamicProbe: row.enables_dynamic_probe === 1,
    })),
  };
}

export async function listCategories(db: SqlDatabase, includeEmpty: boolean) {
  const rows = await all<{ slug: string; name: string; description: string; sort_order: number; project_count: number }>(
    db,
    `SELECT c.slug, c.name, c.description, c.sort_order,
            (
              SELECT COUNT(*) FROM projects p
              WHERE p.status = 'listed' AND (
                p.primary_category_slug = c.slug
                OR EXISTS (SELECT 1 FROM project_categories pc WHERE pc.project_id = p.id AND pc.category_slug = c.slug)
              )
            ) AS project_count
     FROM categories c
     ORDER BY c.sort_order, c.name`,
  );
  return rows
    .filter((row) => includeEmpty || row.project_count > 0)
    .map((row) => ({ slug: row.slug, name: row.name, description: row.description, sortOrder: row.sort_order, projectCount: row.project_count }));
}

export async function listProjectTypes(db: SqlDatabase) {
  const rows = await all<{ slug: string; name: string; sort_order: number; enables_dynamic_probe: number }>(
    db,
    `SELECT slug, name, sort_order, enables_dynamic_probe FROM project_types ORDER BY sort_order, name`,
  );
  return rows.map((row) => ({ slug: row.slug, name: row.name, sortOrder: row.sort_order, enablesDynamicProbe: row.enables_dynamic_probe === 1 }));
}

async function uniqueSlug(db: SqlDatabase, repoKey: string): Promise<string> {
  const base = projectSlugFromRepoKey(repoKey);
  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await get<{ repo_key: string }>(db, `SELECT repo_key FROM projects WHERE slug = ?`, slug);
    if (!existing || existing.repo_key === repoKey) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function acceptSubmission(
  db: SqlDatabase,
  input: { repository: GitHubRepository; recommendation: string | null; userId: string | null },
  now = new Date(),
): Promise<{ id: string; status: string; projectSlug: string; projectId: string; created: boolean }> {
  const timestamp = now.toISOString();
  if (input.userId) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const count = await get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM submissions WHERE user_id = ? AND created_at >= ?`, input.userId, since);
    if ((count?.n ?? 0) >= 30) throw new HttpError(429, "今天的提交次数已用完，请明天再试");
  }

  const existing = await get<{ id: string; slug: string }>(db, `SELECT id, slug FROM projects WHERE repo_key = ?`, input.repository.key);
  if (existing) {
    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO submissions (id, project_id, user_id, repo_url, repo_key, recommendation, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'duplicate', ?, ?)`,
      id,
      existing.id,
      input.userId,
      input.repository.url,
      input.repository.key,
      input.recommendation,
      timestamp,
      timestamp,
    );
    return { id, status: "duplicate", projectSlug: existing.slug, projectId: existing.id, created: false };
  }

  const projectId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const slug = await uniqueSlug(db, input.repository.key);
  const title = input.repository.key.split("/")[1] || input.repository.key;
  try {
    await run(
      db,
      `INSERT INTO projects (
         id, slug, repo_key, repo_url, title, summary, recommendation, stars, topics_json, tags_json,
         archived, status, heat_score, submitted_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, '[]', '[]', 0, 'listed', 0, ?, ?, ?)`,
      projectId,
      slug,
      input.repository.key,
      input.repository.url,
      title,
      title,
      input.recommendation,
      input.userId,
      timestamp,
      timestamp,
    );
  } catch (error) {
    const raced = await get<{ id: string; slug: string }>(db, `SELECT id, slug FROM projects WHERE repo_key = ?`, input.repository.key);
    if (!raced) throw error;
    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO submissions (id, project_id, user_id, repo_url, repo_key, recommendation, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'duplicate', ?, ?)`,
      id,
      raced.id,
      input.userId,
      input.repository.url,
      input.repository.key,
      input.recommendation,
      timestamp,
      timestamp,
    );
    return { id, status: "duplicate", projectSlug: raced.slug, projectId: raced.id, created: false };
  }

  await run(
    db,
    `INSERT INTO security_scans (id, project_id, clues_json, static_status, static_evidence_json, dynamic_status, dynamic_evidence_json, created_at)
     VALUES (?, ?, '{}', 'pending', '[]', 'skipped', '[]', ?)`,
    crypto.randomUUID(),
    projectId,
    timestamp,
  );
  await run(
    db,
    `INSERT INTO submissions (id, project_id, user_id, repo_url, repo_key, recommendation, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)`,
    submissionId,
    projectId,
    input.userId,
    input.repository.url,
    input.repository.key,
    input.recommendation,
    timestamp,
    timestamp,
  );
  return { id: submissionId, status: "received", projectSlug: slug, projectId, created: true };
}

export async function getSubmission(db: SqlDatabase, id: string): Promise<SubmissionRow | null> {
  return get<SubmissionRow>(
    db,
    `SELECT id, project_id, user_id, repo_url, repo_key, recommendation, status, error_code FROM submissions WHERE id = ?`,
    id,
  );
}

export async function markSubmission(db: SqlDatabase, id: string, status: string, errorCode: string | null, now = new Date()): Promise<void> {
  await run(db, `UPDATE submissions SET status = ?, error_code = ?, updated_at = ? WHERE id = ?`, status, errorCode, now.toISOString(), id);
}

export async function getStoredProject(db: SqlDatabase, id: string): Promise<StoredProject | null> {
  const row = await get<{
    id: string;
    slug: string;
    repo_key: string;
    title: string;
    primary_category_slug: string | null;
    primary_type_slug: string | null;
    tags_json: string;
    status: string;
  }>(db, `SELECT id, slug, repo_key, title, primary_category_slug, primary_type_slug, tags_json, status FROM projects WHERE id = ?`, id);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    repoKey: row.repo_key,
    title: row.title,
    primaryCategorySlug: row.primary_category_slug,
    primaryTypeSlug: row.primary_type_slug,
    tags: parseJson<string[]>(row.tags_json, []),
    status: row.status,
  };
}

export async function getStoredProjectBySlug(db: SqlDatabase, slug: string): Promise<(StoredProject & { submittedBy: string | null }) | null> {
  const row = await get<{
    id: string;
    slug: string;
    repo_key: string;
    title: string;
    primary_category_slug: string | null;
    primary_type_slug: string | null;
    tags_json: string;
    status: string;
    submitted_by: string | null;
  }>(
    db,
    `SELECT id, slug, repo_key, title, primary_category_slug, primary_type_slug, tags_json, status, submitted_by FROM projects WHERE slug = ?`,
    slug,
  );
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    repoKey: row.repo_key,
    title: row.title,
    primaryCategorySlug: row.primary_category_slug,
    primaryTypeSlug: row.primary_type_slug,
    tags: parseJson<string[]>(row.tags_json, []),
    status: row.status,
    submittedBy: row.submitted_by,
  };
}

export async function applyRepositorySnapshot(
  db: SqlDatabase,
  projectId: string,
  snapshot: RepoSnapshot,
  inferred: { categorySlug: string | null; typeSlug: string | null },
  now = new Date(),
): Promise<void> {
  const project = await getStoredProject(db, projectId);
  if (!project) return;
  const summary = snapshot.description.trim().slice(0, 280) || project.title;
  const topics = JSON.stringify(snapshot.topics);
  const tags = project.tags.length ? JSON.stringify(project.tags) : JSON.stringify(snapshot.topics.slice(0, 8));
  const category = project.primaryCategorySlug ?? inferred.categorySlug;
  const type = project.primaryTypeSlug ?? inferred.typeSlug;
  await run(
    db,
    `UPDATE projects
     SET summary = ?, homepage = ?, stars = ?, language = ?, topics_json = ?, tags_json = ?,
         default_branch = ?, pushed_at = ?, archived = ?, primary_category_slug = ?, primary_type_slug = ?, updated_at = ?
     WHERE id = ?`,
    summary,
    snapshot.homepage,
    snapshot.stars,
    snapshot.language,
    topics,
    tags,
    snapshot.defaultBranch,
    snapshot.pushedAt,
    snapshot.archived ? 1 : 0,
    category,
    type,
    now.toISOString(),
    projectId,
  );
  if (!project.primaryCategorySlug && category) await setPrimaryCategoryLink(db, projectId, category);
}

async function setPrimaryCategoryLink(db: SqlDatabase, projectId: string, slug: string): Promise<void> {
  await run(db, `DELETE FROM project_categories WHERE project_id = ? AND is_primary = 1 AND category_slug <> ?`, projectId, slug);
  await run(
    db,
    `INSERT INTO project_categories (project_id, category_slug, is_primary) VALUES (?, ?, 1)
     ON CONFLICT(project_id, category_slug) DO UPDATE SET is_primary = 1`,
    projectId,
    slug,
  );
}

export async function latestScan(db: SqlDatabase, projectId: string): Promise<ScanRow | null> {
  return get<ScanRow>(
    db,
    `SELECT id, project_id, clues_json, static_status, static_evidence_json, dynamic_status, dynamic_evidence_json, created_at
     FROM security_scans WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    projectId,
  );
}

export async function appendScan(
  db: SqlDatabase,
  projectId: string,
  patch: {
    clues?: Record<string, unknown>;
    staticStatus?: string;
    staticEvidence?: ScanEvidence[];
    dynamicStatus?: string;
    dynamicEvidence?: ScanEvidence[];
  },
  now = new Date(),
): Promise<string> {
  const latest = await latestScan(db, projectId);
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO security_scans (id, project_id, clues_json, static_status, static_evidence_json, dynamic_status, dynamic_evidence_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    JSON.stringify(patch.clues ?? parseJson(latest?.clues_json, {})),
    patch.staticStatus ?? latest?.static_status ?? "pending",
    JSON.stringify(patch.staticEvidence ?? parseJson(latest?.static_evidence_json, [])),
    patch.dynamicStatus ?? latest?.dynamic_status ?? "skipped",
    JSON.stringify(patch.dynamicEvidence ?? parseJson(latest?.dynamic_evidence_json, [])),
    now.toISOString(),
  );
  return id;
}

export async function dynamicProbeEnabled(db: SqlDatabase, typeSlug: string | null): Promise<boolean> {
  if (!typeSlug) return false;
  const row = await get<{ enables_dynamic_probe: number }>(db, `SELECT enables_dynamic_probe FROM project_types WHERE slug = ?`, typeSlug);
  return row?.enables_dynamic_probe === 1;
}

export async function insertMcpProbe(
  db: SqlDatabase,
  input: {
    projectId: string;
    scanId: string | null;
    status: string;
    protocolVersion: string | null;
    latencyMs: number | null;
    tools: Array<{ name: string; description: string }>;
    error: string | null;
  },
  now = new Date(),
): Promise<void> {
  await run(
    db,
    `INSERT INTO mcp_probes (id, project_id, scan_id, status, protocol_version, latency_ms, tools_json, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    input.projectId,
    input.scanId,
    input.status,
    input.protocolVersion,
    input.latencyMs,
    JSON.stringify(input.tools.slice(0, 80)),
    input.error,
    now.toISOString(),
  );
}

export type ListProjectsQuery = {
  q?: string;
  category?: string;
  type?: string;
  security?: SecurityStatus | "";
  sort?: "latest" | "hot";
  cursor?: string;
  limit?: number;
};

function likePattern(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function encodeCursor(sort: string, value: string, id: string): string {
  return btoa(JSON.stringify({ sort, value, id })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCursor(cursor: string, sort: string): { value: string; id: string } | null {
  try {
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(padded)) as { sort?: string; value?: string; id?: string };
    if (json.sort !== sort || typeof json.value !== "string" || typeof json.id !== "string") return null;
    if (!json.id || json.id.length > 80 || json.value.length > 80) return null;
    return { value: json.value, id: json.id };
  } catch {
    return null;
  }
}

export async function listProjects(db: SqlDatabase, query: ListProjectsQuery): Promise<{ items: ProjectCard[]; total: number; nextCursor: string | null }> {
  const sort = query.sort === "hot" ? "hot" : "latest";
  const limit = Math.min(48, Math.max(1, query.limit ?? 20));
  const where = ["p.status = 'listed'"];
  const binds: unknown[] = [];
  const q = query.q?.trim();
  if (q) {
    const pattern = likePattern(q);
    where.push(
      `(lower(p.title) LIKE ? ESCAPE '\\' OR lower(p.summary) LIKE ? ESCAPE '\\' OR lower(p.repo_key) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.recommendation, '')) LIKE ? ESCAPE '\\' OR lower(p.tags_json) LIKE ? ESCAPE '\\')`,
    );
    binds.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (query.category) {
    where.push(
      `(p.primary_category_slug = (SELECT slug FROM categories WHERE slug = ? OR name = ? LIMIT 1)
        OR EXISTS (
          SELECT 1 FROM project_categories pc
          JOIN categories c2 ON c2.slug = pc.category_slug
          WHERE pc.project_id = p.id AND (c2.slug = ? OR c2.name = ?)
        ))`,
    );
    binds.push(query.category, query.category, query.category, query.category);
  }
  if (query.type) {
    where.push(`p.primary_type_slug = (SELECT slug FROM project_types WHERE slug = ? OR name = ? LIMIT 1)`);
    binds.push(query.type, query.type);
  }
  if (query.security) {
    where.push(`${SECURITY_SQL} = ?`);
    binds.push(query.security);
  }
  const totalRow = await get<{ n: number }>(db, `SELECT COUNT(*) AS n ${PROJECT_FROM} WHERE ${where.join(" AND ")}`, ...binds);
  const cursor = query.cursor ? decodeCursor(query.cursor, sort) : null;
  if (query.cursor && !cursor) throw new HttpError(400, "分页游标无效");
  const pageBinds = [...binds];
  if (cursor && sort === "latest") {
    where.push(`(p.created_at < ? OR (p.created_at = ? AND p.id < ?))`);
    pageBinds.push(cursor.value, cursor.value, cursor.id);
  }
  if (cursor && sort === "hot") {
    where.push(`(p.heat_score < ? OR (p.heat_score = ? AND p.id < ?))`);
    pageBinds.push(Number(cursor.value), Number(cursor.value), cursor.id);
  }
  const order = sort === "hot" ? "p.heat_score DESC, p.id DESC" : "p.created_at DESC, p.id DESC";
  const rows = await all<ProjectRow>(db, `${PROJECT_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`, ...pageBinds, limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeCursor(sort, sort === "hot" ? String(last.heat_score) : last.created_at, last.id) : null;
  return { items: page.map(cardOf), total: totalRow?.n ?? 0, nextCursor };
}

export async function getProjectDetail(db: SqlDatabase, slug: string): Promise<{ project: ProjectDetail; reviews: ReviewItem[] } | null> {
  const row = await get<ProjectRow>(db, `${PROJECT_SELECT} WHERE p.slug = ?`, slug);
  if (!row) return null;
  const secondary = await all<{ slug: string; name: string }>(
    db,
    `SELECT c.slug, c.name FROM project_categories pc JOIN categories c ON c.slug = pc.category_slug
     WHERE pc.project_id = ? AND pc.is_primary = 0 ORDER BY c.sort_order, c.name`,
    row.id,
  );
  const scan = await latestScan(db, row.id);
  const typeEnabled = await dynamicProbeEnabled(db, row.primary_type_slug);
  const probe = typeEnabled
    ? await get<{ status: string; protocol_version: string | null; latency_ms: number | null; tools_json: string; error: string | null }>(
        db,
        `SELECT status, protocol_version, latency_ms, tools_json, error FROM mcp_probes WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        row.id,
      )
    : null;
  const reviews = await listReviews(db, row.id);
  const card = cardOf(row);
  const project: ProjectDetail = {
    ...card,
    status: row.status === "taken_down" ? "taken_down" : "listed",
    topics: parseJson<string[]>(row.topics_json, []),
    tags: parseJson<string[]>(row.tags_json, []),
    homepage: row.homepage,
    archived: row.archived === 1,
    pushedAt: row.pushed_at,
    secondaryCategories: secondary,
    submittedBy: row.submitted_by,
    security: {
      status: card.securityStatus,
      staticStatus: scan?.static_status ?? "pending",
      dynamicStatus: scan?.dynamic_status ?? "skipped",
      clues: parseJson<Record<string, unknown>>(scan?.clues_json, {}),
      evidence: parseJson<ScanEvidence[]>(scan?.static_evidence_json, []),
      dynamicEvidence: parseJson<ScanEvidence[]>(scan?.dynamic_evidence_json, []),
      scannedAt: scan?.created_at ?? null,
    },
    mcp: probe
      ? {
          status: probe.status,
          protocolVersion: probe.protocol_version,
          latencyMs: probe.latency_ms,
          tools: parseJson<Array<{ name: string; description: string }>>(probe.tools_json, []),
          error: probe.error,
        }
      : null,
    favoriteCount: row.favorite_count ?? 0,
  };
  return { project, reviews };
}

export async function listReviews(db: SqlDatabase, projectId: string): Promise<ReviewItem[]> {
  const rows = await all<{ id: string; title: string | null; body: string; created_at: string; login: string; avatar_url: string | null }>(
    db,
    `SELECT r.id, r.title, r.body, r.created_at, u.login, u.avatar_url
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.project_id = ? ORDER BY r.created_at DESC LIMIT 50`,
    projectId,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    author: { login: row.login, avatarUrl: row.avatar_url },
  }));
}

export async function communityStats(db: SqlDatabase) {
  const row = await get<{ projects: number; pending: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM projects WHERE status = 'listed') AS projects,
       (SELECT COUNT(*) ${PROJECT_FROM} WHERE p.status = 'listed' AND ${SECURITY_SQL} = 'pending') AS pending`,
  );
  return { projects: row?.projects ?? 0, pendingScans: row?.pending ?? 0 };
}

export async function upsertRating(db: SqlDatabase, input: { projectId: string; userId: string; stars: number; note: string | null }, now = new Date()) {
  const timestamp = now.toISOString();
  await run(
    db,
    `INSERT INTO ratings (id, project_id, user_id, stars, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET stars = excluded.stars, note = excluded.note, updated_at = excluded.updated_at`,
    crypto.randomUUID(),
    input.projectId,
    input.userId,
    input.stars,
    input.note,
    timestamp,
    timestamp,
  );
}

export async function addReview(db: SqlDatabase, input: { projectId: string; userId: string; title: string | null; body: string }, now = new Date()) {
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO reviews (id, project_id, user_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.projectId,
    input.userId,
    input.title,
    input.body,
    now.toISOString(),
    now.toISOString(),
  );
  return id;
}

export async function toggleLike(db: SqlDatabase, projectId: string, userId: string, now = new Date()): Promise<boolean> {
  const removed = await run(db, `DELETE FROM likes WHERE project_id = ? AND user_id = ?`, projectId, userId);
  if (removed > 0) return false;
  await run(db, `INSERT INTO likes (project_id, user_id, created_at) VALUES (?, ?, ?)`, projectId, userId, now.toISOString());
  return true;
}

export async function ensureDefaultCollection(db: SqlDatabase, userId: string, now = new Date()): Promise<string> {
  const existing = await get<{ id: string }>(db, `SELECT id FROM collections WHERE user_id = ? AND title = '默认收藏夹' ORDER BY created_at LIMIT 1`, userId);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  await run(db, `INSERT INTO collections (id, user_id, title, is_public, created_at, updated_at) VALUES (?, ?, '默认收藏夹', 0, ?, ?)`, id, userId, timestamp, timestamp);
  return id;
}

export async function addFavorite(db: SqlDatabase, input: { collectionId: string; projectId: string; userId: string }, now = new Date()): Promise<void> {
  const collection = await get<{ user_id: string }>(db, `SELECT user_id FROM collections WHERE id = ?`, input.collectionId);
  if (!collection || collection.user_id !== input.userId) throw new HttpError(404, "收藏夹不存在");
  await run(
    db,
    `INSERT INTO collection_items (collection_id, project_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(collection_id, project_id) DO NOTHING`,
    input.collectionId,
    input.projectId,
    now.toISOString(),
  );
}

export async function removeFavorite(db: SqlDatabase, collectionId: string, projectId: string, userId: string): Promise<void> {
  const collection = await get<{ user_id: string }>(db, `SELECT user_id FROM collections WHERE id = ?`, collectionId);
  if (!collection || collection.user_id !== userId) return;
  await run(db, `DELETE FROM collection_items WHERE collection_id = ? AND project_id = ?`, collectionId, projectId);
}

export async function createCollection(db: SqlDatabase, input: { userId: string; title: string; isPublic: boolean }, now = new Date()) {
  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  await run(
    db,
    `INSERT INTO collections (id, user_id, title, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    input.userId,
    input.title,
    input.isPublic ? 1 : 0,
    timestamp,
    timestamp,
  );
  return id;
}

export async function updateCollection(db: SqlDatabase, input: { id: string; userId: string; title?: string; isPublic?: boolean }, now = new Date()) {
  const collection = await get<{ user_id: string }>(db, `SELECT user_id FROM collections WHERE id = ?`, input.id);
  if (!collection || collection.user_id !== input.userId) return false;
  if (input.title != null) await run(db, `UPDATE collections SET title = ?, updated_at = ? WHERE id = ?`, input.title, now.toISOString(), input.id);
  if (input.isPublic != null) await run(db, `UPDATE collections SET is_public = ?, updated_at = ? WHERE id = ?`, input.isPublic ? 1 : 0, now.toISOString(), input.id);
  return true;
}

export async function deleteCollection(db: SqlDatabase, id: string, userId: string): Promise<boolean> {
  const changes = await run(db, `DELETE FROM collections WHERE id = ? AND user_id = ?`, id, userId);
  return changes > 0;
}

export async function getCollection(db: SqlDatabase, id: string, viewerId: string | null) {
  const row = await get<{ id: string; title: string; is_public: number; user_id: string; login: string }>(
    db,
    `SELECT c.id, c.title, c.is_public, c.user_id, u.login FROM collections c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    id,
  );
  if (!row) return null;
  if (row.is_public !== 1 && row.user_id !== viewerId) return null;
  const items = await all<ProjectRow>(
    db,
    `${PROJECT_SELECT}
     JOIN collection_items ci ON ci.project_id = p.id
     WHERE ci.collection_id = ? AND p.status = 'listed'
     ORDER BY ci.created_at DESC`,
    id,
  );
  return {
    id: row.id,
    title: row.title,
    isPublic: row.is_public === 1,
    owner: { login: row.login },
    items: items.map(cardOf),
  };
}

export async function replaceTaxonomy(
  db: SqlDatabase,
  projectId: string,
  input: { primaryCategorySlug: string | null; secondaryCategorySlugs: string[]; primaryTypeSlug: string | null; tags: string[] },
  now = new Date(),
): Promise<void> {
  if (input.primaryCategorySlug) {
    const category = await get<{ slug: string }>(db, `SELECT slug FROM categories WHERE slug = ?`, input.primaryCategorySlug);
    if (!category) throw new HttpError(400, "一级分类不存在");
  }
  for (const slug of input.secondaryCategorySlugs) {
    const category = await get<{ slug: string }>(db, `SELECT slug FROM categories WHERE slug = ?`, slug);
    if (!category) throw new HttpError(400, "次分类不存在");
  }
  if (input.primaryTypeSlug) {
    const type = await get<{ slug: string }>(db, `SELECT slug FROM project_types WHERE slug = ?`, input.primaryTypeSlug);
    if (!type) throw new HttpError(400, "项目类型不存在");
  }
  await run(
    db,
    `UPDATE projects SET primary_category_slug = ?, primary_type_slug = ?, tags_json = ?, updated_at = ? WHERE id = ?`,
    input.primaryCategorySlug,
    input.primaryTypeSlug,
    JSON.stringify(input.tags),
    now.toISOString(),
    projectId,
  );
  await run(db, `DELETE FROM project_categories WHERE project_id = ?`, projectId);
  if (input.primaryCategorySlug) {
    await run(db, `INSERT INTO project_categories (project_id, category_slug, is_primary) VALUES (?, ?, 1)`, projectId, input.primaryCategorySlug);
  }
  for (const slug of input.secondaryCategorySlugs) {
    if (slug === input.primaryCategorySlug) continue;
    await run(
      db,
      `INSERT INTO project_categories (project_id, category_slug, is_primary) VALUES (?, ?, 0)
       ON CONFLICT(project_id, category_slug) DO NOTHING`,
      projectId,
      slug,
    );
  }
}

export async function takeDownProject(db: SqlDatabase, slug: string, reason: string | null, now = new Date()): Promise<boolean> {
  const changes = await run(db, `UPDATE projects SET status = 'taken_down', takedown_reason = ?, updated_at = ? WHERE slug = ?`, reason, now.toISOString(), slug);
  return changes > 0;
}

export async function upsertCategory(
  db: SqlDatabase,
  input: { slug: string; name: string; description: string; sortOrder: number; keywords: string[] },
  now = new Date(),
) {
  const timestamp = now.toISOString();
  await run(
    db,
    `INSERT INTO categories (slug, name, description, sort_order, keywords_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
       keywords_json = excluded.keywords_json, updated_at = excluded.updated_at`,
    input.slug,
    input.name,
    input.description,
    input.sortOrder,
    JSON.stringify(input.keywords),
    timestamp,
    timestamp,
  );
}

export async function upsertProjectType(db: SqlDatabase, input: { slug: string; name: string; sortOrder: number; enablesDynamicProbe: boolean; keywords: string[] }) {
  await run(
    db,
    `INSERT INTO project_types (slug, name, sort_order, enables_dynamic_probe, keywords_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order,
       enables_dynamic_probe = excluded.enables_dynamic_probe, keywords_json = excluded.keywords_json`,
    input.slug,
    input.name,
    input.sortOrder,
    input.enablesDynamicProbe ? 1 : 0,
    JSON.stringify(input.keywords),
  );
}

export async function deleteCategory(db: SqlDatabase, slug: string): Promise<"missing" | "in_use" | "deleted"> {
  const row = await get<{ slug: string }>(db, `SELECT slug FROM categories WHERE slug = ?`, slug);
  if (!row) return "missing";
  const used = await get<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM projects p
     WHERE p.primary_category_slug = ? OR EXISTS (SELECT 1 FROM project_categories pc WHERE pc.project_id = p.id AND pc.category_slug = ?)`,
    slug,
    slug,
  );
  if ((used?.n ?? 0) > 0) return "in_use";
  await run(db, `DELETE FROM categories WHERE slug = ?`, slug);
  return "deleted";
}

export async function deleteProjectType(db: SqlDatabase, slug: string): Promise<"missing" | "in_use" | "deleted"> {
  const row = await get<{ slug: string }>(db, `SELECT slug FROM project_types WHERE slug = ?`, slug);
  if (!row) return "missing";
  const used = await get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM projects WHERE primary_type_slug = ?`, slug);
  if ((used?.n ?? 0) > 0) return "in_use";
  await run(db, `DELETE FROM project_types WHERE slug = ?`, slug);
  return "deleted";
}

export async function recomputeHeat(db: SqlDatabase, recentSince: string): Promise<void> {
  await run(
    db,
    `UPDATE projects
     SET heat_score =
       MIN(stars, 5000) * 0.01
       + (SELECT COUNT(*) FROM likes WHERE likes.project_id = projects.id) * 2
       + (SELECT COUNT(*) FROM collection_items WHERE collection_items.project_id = projects.id) * 2
       + (SELECT COUNT(*) FROM ratings WHERE ratings.project_id = projects.id AND ratings.created_at >= ?) * 3
       + COALESCE((SELECT AVG(stars) FROM ratings WHERE ratings.project_id = projects.id), 0)`,
    recentSince,
  );
}

export async function listMaintenance(db: SqlDatabase, staleBefore: string, limit: number) {
  const submissions = await all<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM submissions WHERE status IN ('received', 'retryable', 'metadata_fetched') ORDER BY updated_at ASC LIMIT ?`,
    limit,
  );
  const projects = await all<{ id: string; static_status: string | null; dynamic_status: string | null; created_at: string | null }>(
    db,
    `SELECT p.id, latest.static_status, latest.dynamic_status, latest.created_at
     ${PROJECT_FROM}
     WHERE p.status = 'listed' AND (
       latest.project_id IS NULL
       OR latest.static_status IN ('pending', 'scan_failed')
       OR latest.dynamic_status IN ('pending', 'scan_failed')
       OR latest.created_at < ?
     )
     ORDER BY COALESCE(latest.created_at, p.created_at) ASC
     LIMIT ?`,
    staleBefore,
    limit,
  );
  return { submissions, projects };
}

export async function profileForLogin(db: SqlDatabase, login: string, viewerOwns: boolean) {
  const user = await get<{ id: string; login: string; avatar_url: string | null; name: string | null }>(
    db,
    `SELECT id, login, avatar_url, name FROM users WHERE lower(login) = lower(?)`,
    login,
  );
  if (!user) return null;
  const projects = await all<ProjectRow>(db, `${PROJECT_SELECT} WHERE p.submitted_by = ? AND p.status = 'listed' ORDER BY p.created_at DESC LIMIT 50`, user.id);
  const reviews = await all<{ id: string; title: string | null; body: string; created_at: string; slug: string; project_title: string }>(
    db,
    `SELECT r.id, r.title, r.body, r.created_at, p.slug, p.title AS project_title
     FROM reviews r JOIN projects p ON p.id = r.project_id
     WHERE r.user_id = ? AND p.status = 'listed'
     ORDER BY r.created_at DESC LIMIT 50`,
    user.id,
  );
  const collections = await all<{ id: string; title: string; is_public: number; n: number }>(
    db,
    `SELECT c.id, c.title, c.is_public, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS n
     FROM collections c WHERE c.user_id = ? ${viewerOwns ? "" : "AND c.is_public = 1"} ORDER BY c.created_at DESC`,
    user.id,
  );
  return {
    login: user.login,
    avatarUrl: user.avatar_url,
    name: user.name,
    projects: projects.map(cardOf),
    reviews: reviews.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      author: { login: user.login, avatarUrl: user.avatar_url },
      projectSlug: row.slug,
      projectTitle: row.project_title,
    })),
    collections: collections.map((row) => ({ id: row.id, title: row.title, isPublic: row.is_public === 1, itemCount: row.n })),
  };
}

export async function myActivity(db: SqlDatabase, userId: string) {
  const user = await get<{ login: string }>(db, `SELECT login FROM users WHERE id = ?`, userId);
  if (!user) return null;
  const profile = await profileForLogin(db, user.login, true);
  const ratings = await all<{ stars: number; note: string | null; slug: string; title: string; updated_at: string }>(
    db,
    `SELECT r.stars, r.note, p.slug, p.title, r.updated_at
     FROM ratings r JOIN projects p ON p.id = r.project_id
     WHERE r.user_id = ? ORDER BY r.updated_at DESC LIMIT 50`,
    userId,
  );
  const likes = await all<ProjectRow>(
    db,
    `${PROJECT_SELECT} JOIN likes l ON l.project_id = p.id WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT 50`,
    userId,
  );
  const submissions = await all<{ id: string; status: string; repo_url: string; created_at: string; slug: string | null }>(
    db,
    `SELECT s.id, s.status, s.repo_url, s.created_at, p.slug
     FROM submissions s LEFT JOIN projects p ON p.id = s.project_id
     WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 50`,
    userId,
  );
  return {
    ...profile,
    ratings: ratings.map((row) => ({ stars: row.stars, note: row.note, projectSlug: row.slug, projectTitle: row.title, updatedAt: row.updated_at })),
    likes: likes.map(cardOf),
    submissions: submissions.map((row) => ({ id: row.id, status: row.status, repoUrl: row.repo_url, projectSlug: row.slug, createdAt: row.created_at })),
  };
}
