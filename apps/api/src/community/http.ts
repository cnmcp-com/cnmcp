import { SECURITY_STATUSES, type SecurityStatus } from "@cnmcp/schema";
import { Hono } from "hono";

import { ALGORITHM_VERSION } from "@cnmcp/schema";

import {
  allowedOrigins,
  beginOAuth,
  consumeOAuthState,
  createSession,
  deleteSession,
  exchangeGitHubCode,
  safeReturnTo,
  secretsEqual,
  upsertGitHubUser,
  userFromAuthorization,
  type SessionUser,
} from "./auth";
import { repositoryFromSubmission } from "./github";
import { completeSubmission, runDynamicProbe, runIngest, runMaintenance, runStaticScan } from "./pipeline";
import { sqlFromD1, type SqlDatabase } from "./sql";
import { HttpError } from "./sql";
import {
  acceptSubmission,
  addFavorite,
  addReview,
  communityStats,
  createCollection,
  deleteCategory,
  deleteCollection,
  deleteProjectType,
  dynamicProbeEnabled,
  ensureDefaultCollection,
  getCollection,
  getProjectDetail,
  getStoredProjectBySlug,
  getSubmission,
  listCategories,
  listProjectTypes,
  listProjects,
  myActivity,
  profileForLogin,
  removeFavorite,
  replaceTaxonomy,
  takeDownProject,
  toggleLike,
  updateCollection,
  upsertCategory,
  upsertProjectType,
  upsertRating,
} from "./store";
import { all, get } from "./sql";

type AppEnv = { Bindings: CloudflareEnv };

const app = new Hono<AppEnv>();

function dbOf(env: CloudflareEnv): SqlDatabase {
  return sqlFromD1(env.DB);
}

function applyCors(c: { env: CloudflareEnv; req: { header(name: string): string | undefined }; res: Response }) {
  const origin = c.req.header("Origin") ?? "";
  if (origin && allowedOrigins(c.env.ALLOWED_ORIGINS).includes(origin)) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  c.res.headers.set("Vary", "Origin");
}

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    c.res = c.body(null, 204);
    applyCors(c);
    return c.res;
  }
  try {
    await next();
  } finally {
    applyCors(c);
  }
});

app.use("/internal/*", async (c, next) => {
  const expected = c.env.INTERNAL_API_TOKEN;
  if (!expected) throw new HttpError(503, "内部接口尚未配置");
  const header = c.req.header("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!provided || !(await secretsEqual(provided, expected))) throw new HttpError(401, "无权访问内部接口");
  await next();
});

app.onError((error, c) => {
  const code = error instanceof HttpError
    ? error.status === 401 ? "UNAUTHORIZED" : error.status === 403 ? "FORBIDDEN" : error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : error.status === 429 ? "RATE_LIMITED" : error.status === 503 ? "NOT_CONFIGURED" : "INVALID"
    : "INTERNAL";
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "服务暂时不可用";
  if (!(error instanceof HttpError)) console.error(JSON.stringify({ path: "community-http", error: String(error).slice(0, 300) }));
  const response = c.json({ error: { code, message } }, status as 400);
  applyCors(c);
  return response;
});

function gone(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({ error: { code: "GONE", message: "旧的 MCP 目录接口已停用", replacement: "/v1/projects" } }, 410);
}

app.all("/v1/servers", (c) => gone(c));
app.all("/v1/servers/*", (c) => gone(c));
app.all("/v1/activity", (c) => gone(c));
app.all("/badge/*", (c) => gone(c));
app.all("/data/servers-index.json", (c) => gone(c));
app.all("/internal/verify", (c) => gone(c));
app.all("/internal/stdio-probes", (c) => gone(c));
app.all("/internal/probe-queue", (c) => gone(c));
app.all("/internal/rebuild-index", (c) => gone(c));

app.get("/health", (c) => c.json({ ok: true, service: "community", algorithmVersion: ALGORITHM_VERSION }));

app.get("/v1/stats", async (c) => c.json(await communityStats(dbOf(c.env))));

async function readObject(c: { req: { text(): Promise<string> } }): Promise<Record<string, unknown>> {
  const raw = await c.req.text();
  if (!raw) return {};
  if (raw.length > 20_000) throw new HttpError(400, "提交内容为空或过大");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "提交内容不是有效 JSON");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "提交内容不是有效 JSON");
  }
}

function textField(value: unknown, max: number, required = false): string | null {
  if (value == null || value === "") {
    if (required) throw new HttpError(400, "缺少必填字段");
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, "字段格式不正确");
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!text) {
    if (required) throw new HttpError(400, "缺少必填字段");
    return null;
  }
  if (text.length > max) throw new HttpError(400, "字段过长");
  return text;
}

function slugList(value: unknown, max: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "字段格式不正确");
  const slugs = value.map((item) => textField(item, 80, true)).filter((item): item is string => Boolean(item));
  if (slugs.length > max) throw new HttpError(400, "字段过长");
  return [...new Set(slugs)];
}

async function currentUser(c: { env: CloudflareEnv; req: { header(name: string): string | undefined } }): Promise<SessionUser | null> {
  return userFromAuthorization(dbOf(c.env), c.req.header("Authorization"));
}

async function requireUser(c: { env: CloudflareEnv; req: { header(name: string): string | undefined } }): Promise<SessionUser> {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "请先使用 GitHub 登录");
  return user;
}

async function enqueueOrRun(env: CloudflareEnv, submissionId: string, projectId: string): Promise<void> {
  if (env.SUBMISSION_QUEUE) {
    await env.SUBMISSION_QUEUE.send({ kind: "community-ingest", submissionId });
    return;
  }
  const db = dbOf(env);
  const options = { token: env.GITHUB_TOKEN, evidence: env.EVIDENCE ? { put: (key: string, value: string) => env.EVIDENCE!.put(key, value) } : undefined };
  const ingested = await runIngest(db, submissionId, options);
  if (ingested.retry || !ingested.projectId) return;
  const scanned = await runStaticScan(db, ingested.projectId, options);
  if (scanned.dynamic) {
    if (env.VERIFY_QUEUE) await env.VERIFY_QUEUE.send({ kind: "community-dynamic", projectId: ingested.projectId });
    else await runDynamicProbe(db, ingested.projectId, options);
  }
  await completeSubmission(db, submissionId);
  void projectId;
}

async function submitRepo(env: CloudflareEnv, body: Record<string, unknown>, userId: string | null) {
  const repoUrl = textField(body.repoUrl, 300, true);
  const recommendation = textField(body.recommendation, 500);
  const repository = repositoryFromSubmission(repoUrl ?? "");
  const accepted = await acceptSubmission(dbOf(env), { repository, recommendation, userId });
  if (accepted.created) await enqueueOrRun(env, accepted.id, accepted.projectId);
  return accepted;
}

function listQuery(url: URL) {
  const security = url.searchParams.get("security") ?? "";
  if (security && !SECURITY_STATUSES.includes(security as SecurityStatus)) throw new HttpError(400, "安全状态筛选无效");
  const sort = url.searchParams.get("sort") === "hot" ? "hot" : "latest";
  return {
    q: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category") ?? "",
    type: url.searchParams.get("type") ?? "",
    security: security as SecurityStatus | "",
    sort: sort as "latest" | "hot",
    cursor: url.searchParams.get("cursor") ?? "",
    limit: Number(url.searchParams.get("limit") ?? "20"),
  };
}

app.get("/v1/categories", async (c) => {
  const includeEmpty = c.req.query("includeEmpty") === "1";
  return c.json({ items: await listCategories(dbOf(c.env), includeEmpty) });
});

app.get("/v1/project-types", async (c) => c.json({ items: await listProjectTypes(dbOf(c.env)) }));

app.get("/v1/projects", async (c) => c.json(await listProjects(dbOf(c.env), listQuery(new URL(c.req.url)))));
app.get("/v1/search", async (c) => c.json(await listProjects(dbOf(c.env), listQuery(new URL(c.req.url)))));

app.get("/v1/projects/:slug", async (c) => {
  const detail = await getProjectDetail(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!detail) throw new HttpError(404, "项目不存在");
  return c.json(detail);
});

app.get("/v1/projects/:slug/me", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project) throw new HttpError(404, "项目不存在");
  const db = dbOf(c.env);
  const liked = await get<{ n: number }>(db, `SELECT 1 AS n FROM likes WHERE project_id = ? AND user_id = ?`, project.id, user.id);
  const rating = await get<{ stars: number; note: string | null }>(db, `SELECT stars, note FROM ratings WHERE project_id = ? AND user_id = ?`, project.id, user.id);
  const collections = await all<{ id: string }>(
    db,
    `SELECT c.id FROM collections c JOIN collection_items ci ON ci.collection_id = c.id WHERE ci.project_id = ? AND c.user_id = ?`,
    project.id,
    user.id,
  );
  return c.json({ liked: Boolean(liked), rating: rating ? { stars: rating.stars, note: rating.note } : null, collectionIds: collections.map((item) => item.id), canEdit: project.submittedBy === user.id });
});

app.post("/v1/submissions", async (c) => {
  const user = await requireUser(c);
  const accepted = await submitRepo(c.env, await readObject(c), user.id);
  return c.json({ id: accepted.id, status: accepted.status, projectSlug: accepted.projectSlug }, accepted.created ? 202 : 200);
});

app.get("/v1/submissions/:id", async (c) => {
  const user = await requireUser(c);
  const row = await getSubmission(dbOf(c.env), c.req.param("id"));
  if (!row || row.user_id !== user.id) throw new HttpError(404, "提交记录不存在");
  const project = row.project_id ? await get<{ slug: string }>(dbOf(c.env), `SELECT slug FROM projects WHERE id = ?`, row.project_id) : null;
  return c.json({ id: row.id, status: row.status, projectSlug: project?.slug ?? null, errorCode: row.error_code });
});

app.put("/v1/projects/:slug/rating", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project || project.status !== "listed") throw new HttpError(404, "项目不存在");
  const body = await readObject(c);
  const stars = body.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, "评分需要是 1 到 5 的整数");
  await upsertRating(dbOf(c.env), { projectId: project.id, userId: user.id, stars, note: textField(body.note, 200) });
  return c.json({ ok: true });
});

app.post("/v1/projects/:slug/reviews", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project || project.status !== "listed") throw new HttpError(404, "项目不存在");
  const body = await readObject(c);
  const id = await addReview(dbOf(c.env), { projectId: project.id, userId: user.id, title: textField(body.title, 80), body: textField(body.body, 4000, true) ?? "" });
  return c.json({ id }, 201);
});

app.post("/v1/projects/:slug/like", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project || project.status !== "listed") throw new HttpError(404, "项目不存在");
  const liked = await toggleLike(dbOf(c.env), project.id, user.id);
  return c.json({ liked });
});

app.post("/v1/projects/:slug/favorite", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project || project.status !== "listed") throw new HttpError(404, "项目不存在");
  const body = await readObject(c);
  const requested = textField(body.collectionId, 80);
  const collectionId = requested ?? (await ensureDefaultCollection(dbOf(c.env), user.id));
  await addFavorite(dbOf(c.env), { collectionId, projectId: project.id, userId: user.id });
  return c.json({ collectionId });
});

app.delete("/v1/projects/:slug/favorite", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project) throw new HttpError(404, "项目不存在");
  const collectionId = c.req.query("collectionId");
  if (!collectionId) throw new HttpError(400, "缺少收藏夹");
  await removeFavorite(dbOf(c.env), collectionId, project.id, user.id);
  return c.json({ ok: true });
});

app.patch("/v1/projects/:slug", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project) throw new HttpError(404, "项目不存在");
  if (project.submittedBy !== user.id) throw new HttpError(403, "只能修改自己提交的项目");
  const body = await readObject(c);
  const detail = await getProjectDetail(dbOf(c.env), project.slug);
  const primaryCategorySlug = "primaryCategorySlug" in body ? textField(body.primaryCategorySlug, 80) : project.primaryCategorySlug;
  const primaryTypeSlug = "primaryTypeSlug" in body ? textField(body.primaryTypeSlug, 80) : project.primaryTypeSlug;
  const secondary = "secondaryCategorySlugs" in body
    ? slugList(body.secondaryCategorySlugs, 3).filter((slug) => slug !== primaryCategorySlug)
    : (detail?.project.secondaryCategories.map((category) => category.slug) ?? []);
  const tags = "tags" in body ? slugList(body.tags, 8).map((tag) => tag.slice(0, 24)) : project.tags;
  const wasDynamic = await dynamicProbeEnabled(dbOf(c.env), project.primaryTypeSlug);
  await replaceTaxonomy(dbOf(c.env), project.id, { primaryCategorySlug, secondaryCategorySlugs: secondary, primaryTypeSlug, tags });
  const nowDynamic = await dynamicProbeEnabled(dbOf(c.env), primaryTypeSlug);
  if (nowDynamic && !wasDynamic) {
    if (c.env.SUBMISSION_QUEUE) await c.env.SUBMISSION_QUEUE.send({ kind: "community-static", projectId: project.id });
    else {
      const options = { token: c.env.GITHUB_TOKEN };
      const scanned = await runStaticScan(dbOf(c.env), project.id, options);
      if (scanned.dynamic) await runDynamicProbe(dbOf(c.env), project.id, options);
    }
  }
  return c.json({ ok: true });
});

app.post("/v1/collections", async (c) => {
  const user = await requireUser(c);
  const body = await readObject(c);
  const id = await createCollection(dbOf(c.env), { userId: user.id, title: textField(body.title, 80, true) ?? "收藏夹", isPublic: body.isPublic === true });
  return c.json({ id }, 201);
});

app.patch("/v1/collections/:id", async (c) => {
  const user = await requireUser(c);
  const body = await readObject(c);
  const updated = await updateCollection(dbOf(c.env), {
    id: c.req.param("id"),
    userId: user.id,
    title: body.title == null ? undefined : textField(body.title, 80, true) ?? undefined,
    isPublic: body.isPublic == null ? undefined : body.isPublic === true,
  });
  if (!updated) throw new HttpError(404, "收藏夹不存在");
  return c.json({ ok: true });
});

app.delete("/v1/collections/:id", async (c) => {
  const user = await requireUser(c);
  const deleted = await deleteCollection(dbOf(c.env), c.req.param("id"), user.id);
  if (!deleted) throw new HttpError(404, "收藏夹不存在");
  return c.json({ ok: true });
});

app.get("/v1/collections/:id", async (c) => {
  const user = await currentUser(c);
  const collection = await getCollection(dbOf(c.env), c.req.param("id"), user?.id ?? null);
  if (!collection) throw new HttpError(404, "收藏夹不存在");
  return c.json(collection);
});

app.post("/v1/collections/:id/items", async (c) => {
  const user = await requireUser(c);
  const body = await readObject(c);
  const slug = textField(body.slug, 120, true);
  const project = await getStoredProjectBySlug(dbOf(c.env), slug ?? "");
  if (!project || project.status !== "listed") throw new HttpError(404, "项目不存在");
  await addFavorite(dbOf(c.env), { collectionId: c.req.param("id"), projectId: project.id, userId: user.id });
  return c.json({ ok: true });
});

app.delete("/v1/collections/:id/items/:slug", async (c) => {
  const user = await requireUser(c);
  const project = await getStoredProjectBySlug(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (!project) throw new HttpError(404, "项目不存在");
  await removeFavorite(dbOf(c.env), c.req.param("id"), project.id, user.id);
  return c.json({ ok: true });
});

app.get("/v1/me", async (c) => {
  const user = await requireUser(c);
  const profile = await myActivity(dbOf(c.env), user.id);
  if (!profile) throw new HttpError(404, "用户不存在");
  return c.json({ id: user.id, ...profile });
});

app.get("/v1/users/:login", async (c) => {
  const profile = await profileForLogin(dbOf(c.env), decodeURIComponent(c.req.param("login")), false);
  if (!profile) throw new HttpError(404, "用户不存在");
  return c.json(profile);
});

app.get("/v1/auth/github", async (c) => {
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) throw new HttpError(503, "GitHub 登录尚未配置");
  const origins = allowedOrigins(c.env.ALLOWED_ORIGINS);
  const returnTo = safeReturnTo(c.req.query("return_to"), origins);
  const state = await beginOAuth(dbOf(c.env), returnTo);
  const redirectUri = new URL("/v1/auth/github/callback", c.req.url).toString();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  return c.redirect(authorize.toString(), 302);
});

app.get("/v1/auth/github/callback", async (c) => {
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) throw new HttpError(503, "GitHub 登录尚未配置");
  const state = c.req.query("state") ?? "";
  const returnTo = await consumeOAuthState(dbOf(c.env), state);
  const destination = returnTo ?? safeReturnTo(null, allowedOrigins(c.env.ALLOWED_ORIGINS));
  const code = c.req.query("code");
  if (!returnTo || !code) return c.redirect(`${destination}#error=login`, 302);
  try {
    const profile = await exchangeGitHubCode({
      clientId: c.env.GITHUB_CLIENT_ID,
      clientSecret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirectUri: new URL("/v1/auth/github/callback", c.req.url).toString(),
    });
    await upsertGitHubUser(dbOf(c.env), profile);
    const sessionId = await createSession(dbOf(c.env), profile.id);
    return c.redirect(`${destination}#session=${sessionId}`, 302);
  } catch (error) {
    console.error(JSON.stringify({ path: "github-oauth", error: error instanceof HttpError ? error.message : "oauth_failed" }));
    return c.redirect(`${destination}#error=login`, 302);
  }
});

app.post("/v1/auth/logout", async (c) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (token) await deleteSession(dbOf(c.env), token);
  return c.json({ ok: true });
});

app.post("/internal/projects/ingest", async (c) => {
  const accepted = await submitRepo(c.env, await readObject(c), null);
  return c.json({ id: accepted.id, status: accepted.status, projectSlug: accepted.projectSlug }, accepted.created ? 202 : 200);
});

app.post("/internal/projects/:slug/takedown", async (c) => {
  const body = await readObject(c);
  const updated = await takeDownProject(dbOf(c.env), decodeURIComponent(c.req.param("slug")), textField(body.reason, 200));
  if (!updated) throw new HttpError(404, "项目不存在");
  return c.json({ ok: true });
});

app.post("/internal/taxonomy/categories", async (c) => {
  const body = await readObject(c);
  const slug = textField(body.slug, 80, true);
  const name = textField(body.name, 80, true);
  await upsertCategory(dbOf(c.env), {
    slug: slug ?? "",
    name: name ?? "",
    description: textField(body.description, 200) ?? "",
    sortOrder: typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? Math.floor(body.sortOrder) : 0,
    keywords: slugList(body.keywords, 24),
  });
  return c.json({ ok: true });
});

app.delete("/internal/taxonomy/categories/:slug", async (c) => {
  const result = await deleteCategory(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (result === "missing") throw new HttpError(404, "分类不存在");
  if (result === "in_use") throw new HttpError(409, "仍有项目使用该分类");
  return c.json({ ok: true });
});

app.post("/internal/taxonomy/types", async (c) => {
  const body = await readObject(c);
  const slug = textField(body.slug, 80, true) ?? "";
  const enablesDynamicProbe = body.enablesDynamicProbe === true;
  if (enablesDynamicProbe && slug !== "mcp") throw new HttpError(400, "只有 mcp 类型可以打开动态检查");
  await upsertProjectType(dbOf(c.env), {
    slug,
    name: textField(body.name, 80, true) ?? slug,
    sortOrder: typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? Math.floor(body.sortOrder) : 0,
    enablesDynamicProbe,
    keywords: slugList(body.keywords, 24),
  });
  return c.json({ ok: true });
});

app.delete("/internal/taxonomy/types/:slug", async (c) => {
  const result = await deleteProjectType(dbOf(c.env), decodeURIComponent(c.req.param("slug")));
  if (result === "missing") throw new HttpError(404, "类型不存在");
  if (result === "in_use") throw new HttpError(409, "仍有项目使用该类型");
  return c.json({ ok: true });
});

function sideEffects(env: CloudflareEnv) {
  return {
    token: env.GITHUB_TOKEN,
    evidence: env.EVIDENCE ? { put: (key: string, value: string) => env.EVIDENCE!.put(key, value) } : undefined,
  };
}

export async function handleQueue(batch: MessageBatch<unknown>, env: CloudflareEnv): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body as { kind?: string; submissionId?: string; projectId?: string; serverId?: string };
    try {
      if (body.kind === "community-ingest" && body.submissionId) {
        const result = await runIngest(dbOf(env), body.submissionId, sideEffects(env));
        if (result.retry) throw new Error("ingest_retry");
        if (result.projectId) {
          if (env.SUBMISSION_QUEUE) await env.SUBMISSION_QUEUE.send({ kind: "community-static", projectId: result.projectId, submissionId: body.submissionId });
          else {
            const scanned = await runStaticScan(dbOf(env), result.projectId, sideEffects(env));
            if (scanned.dynamic) await runDynamicProbe(dbOf(env), result.projectId, sideEffects(env));
            await completeSubmission(dbOf(env), body.submissionId);
          }
        }
        message.ack();
        continue;
      }
      if (body.kind === "community-static" && body.projectId) {
        const scanned = await runStaticScan(dbOf(env), body.projectId, sideEffects(env));
        if (scanned.dynamic) {
          if (env.VERIFY_QUEUE) await env.VERIFY_QUEUE.send({ kind: "community-dynamic", projectId: body.projectId });
          else await runDynamicProbe(dbOf(env), body.projectId, sideEffects(env));
        }
        await completeSubmission(dbOf(env), body.submissionId);
        message.ack();
        continue;
      }
      if (body.kind === "community-dynamic" && body.projectId) {
        await runDynamicProbe(dbOf(env), body.projectId, sideEffects(env));
        message.ack();
        continue;
      }
      message.ack();
    } catch (error) {
      console.error(JSON.stringify({ path: "community-queue", kind: body.kind ?? "legacy", error: String(error).slice(0, 200) }));
      message.retry();
    }
  }
}

export async function handleScheduled(_controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(
    (async () => {
      const due = await runMaintenance(dbOf(env));
      for (const submission of due.submissions) {
        if (env.SUBMISSION_QUEUE) {
          const kind = submission.status === "metadata_fetched" ? "community-static" : "community-ingest";
          if (kind === "community-static") {
            const row = await getSubmission(dbOf(env), submission.id);
            if (row?.project_id) await env.SUBMISSION_QUEUE.send({ kind, projectId: row.project_id, submissionId: submission.id });
          } else {
            await env.SUBMISSION_QUEUE.send({ kind: "community-ingest", submissionId: submission.id });
          }
        } else if (submission.status === "metadata_fetched") {
          const row = await getSubmission(dbOf(env), submission.id);
          if (row?.project_id) {
            const scanned = await runStaticScan(dbOf(env), row.project_id, sideEffects(env));
            if (scanned.dynamic) await runDynamicProbe(dbOf(env), row.project_id, sideEffects(env));
            await completeSubmission(dbOf(env), submission.id);
          }
        } else {
          const ingested = await runIngest(dbOf(env), submission.id, sideEffects(env));
          if (!ingested.retry && ingested.projectId) {
            const scanned = await runStaticScan(dbOf(env), ingested.projectId, sideEffects(env));
            if (scanned.dynamic) await runDynamicProbe(dbOf(env), ingested.projectId, sideEffects(env));
            await completeSubmission(dbOf(env), submission.id);
          }
        }
      }
      for (const project of due.projects) {
        const needsStatic = !project.static_status || project.static_status === "pending" || project.static_status === "scan_failed" || project.static_status === "clear" || project.static_status === "warn" || project.static_status === "risk";
        if (needsStatic) {
          if (env.SUBMISSION_QUEUE) await env.SUBMISSION_QUEUE.send({ kind: "community-static", projectId: project.id });
          else {
            const scanned = await runStaticScan(dbOf(env), project.id, sideEffects(env));
            if (scanned.dynamic) await runDynamicProbe(dbOf(env), project.id, sideEffects(env));
          }
          continue;
        }
        if (project.dynamic_status === "pending" || project.dynamic_status === "scan_failed") {
          if (env.VERIFY_QUEUE) await env.VERIFY_QUEUE.send({ kind: "community-dynamic", projectId: project.id });
          else await runDynamicProbe(dbOf(env), project.id, sideEffects(env));
        }
      }
    })(),
  );
}

export { app };
