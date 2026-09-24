import { Hono } from "hono";

import { ALGORITHM_VERSION, type ReliableConfig } from "@cnmcp/schema";

import { renderBadge } from "./badge";
import { getDirectory, getRecentActivity, getServerDetail, getStats, listDueServerIds, listProbeQueue, upsertReadmes } from "./db";
import { IngestWorkflow, ingestPages } from "./ingest";
import { buildCatalogIndex, putCatalogIndex } from "./index-file";
import { scanGitHubRepositories } from "./github-scan";
import { persistPlazaCatalog, type PlazaCatalog } from "./tencent-plaza";
import { stdioHandshakeOf, verifyServer } from "./verify";

export { IngestWorkflow };

type Bindings = CloudflareEnv;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  const allowed = new Set(
    (c.env.ALLOWED_ORIGINS ?? "http://localhost:3000,https://www.cnmcp.com")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const origin = c.req.header("Origin") ?? "";
  if (origin && allowed.has(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
  }
  c.header("Vary", "Origin");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

app.use("/internal/*", async (c, next) => {
  const expected = c.env.INTERNAL_API_TOKEN;
  const provided = c.req.header("Authorization");
  if (!expected) {
    return c.json({ error: { code: "NOT_CONFIGURED", message: "内部接口尚未配置" } }, 503);
  }
  if (provided !== `Bearer ${expected}`) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "无权访问内部接口" } }, 401);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, algorithmVersion: ALGORITHM_VERSION }));

app.get("/v1/stats", async (c) => {
  const stats = await getStats(c.env.DB);
  return c.json({ ...stats, algorithmVersion: ALGORITHM_VERSION, probeLabel: "本站探测可达" });
});

app.get("/v1/servers", async (c) => {
  const url = new URL(c.req.url);
  const result = await getDirectory(c.env.DB, {
    q: url.searchParams.get("q") ?? "",
    business: url.searchParams.get("business") ?? "",
    grade: (url.searchParams.get("grade") ?? "") as never,
    reachable: (url.searchParams.get("reachable") ?? "") as never,
    transport: (url.searchParams.get("transport") ?? "") as never,
    official: (url.searchParams.get("official") ?? "") as never,
    pricing: (url.searchParams.get("pricing") ?? "") as never,
    verification: (url.searchParams.get("verification") ?? "") as never,
    sort: (url.searchParams.get("sort") ?? "") as never,
    cursor: url.searchParams.get("cursor") ?? "",
    limit: Number(url.searchParams.get("limit") ?? "30"),
  });
  return c.json(result);
});

app.get("/v1/activity", async (c) => {
  const limit = Number(c.req.query("limit") ?? "30");
  return c.json({ items: await getRecentActivity(c.env.DB, limit) });
});

app.get("/v1/servers/:id", async (c) => {
  const detail = await getServerDetail(c.env.DB, decodeURIComponent(c.req.param("id")));
  if (!detail) return c.json({ error: { code: "NOT_FOUND", message: "server 未收录" } }, 404);
  return c.json(detail);
});

app.get("/data/servers-index.json", async (c) => {
  if (c.env.EVIDENCE) {
    const object = await c.env.EVIDENCE.get("servers-index.json");
    if (object) {
      return new Response(object.body, {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
      });
    }
  }
  const index = await buildCatalogIndex(c.env.DB);
  return c.json(index);
});

app.get("/badge/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (!pathname.endsWith(".svg")) {
    return c.json({ error: { code: "NOT_FOUND", message: "badge 路径必须以 .svg 结尾" } }, 404);
  }
  const id = decodeURIComponent(pathname.slice("/badge/".length, -".svg".length));
  const detail = await getServerDetail(c.env.DB, id);
  const svg = renderBadge(detail);
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
});

app.post("/v1/submissions", async (c) => {
  const body = await c.req.json<{ type?: string; endpoint?: string; namespace?: string; note?: string }>().catch(() => null);
  if (!body?.endpoint && !body?.namespace) {
    return c.json({ error: { code: "INVALID", message: "需要 endpoint 或 namespace" } }, 400);
  }
  const allowedTypes = new Set(["new_server", "claim", "appeal", "rule", "opt_out"]);
  if (body.type && !allowedTypes.has(body.type)) {
    return c.json({ error: { code: "INVALID", message: "不支持的提交类型" } }, 400);
  }
  if (body.endpoint) {
    try {
      const endpoint = new URL(body.endpoint);
      if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("protocol");
    } catch {
      return c.json({ error: { code: "INVALID", message: "endpoint 必须是完整的 http 或 https URL" } }, 400);
    }
  }
  if ((body.note?.length ?? 0) > 2000) {
    return c.json({ error: { code: "INVALID", message: "说明不能超过 2000 字" } }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, type, payload, status, submitted_at) VALUES (?, ?, ?, 'queued', ?)`,
  )
    .bind(id, body.type ?? "new_server", JSON.stringify({ endpoint: body.endpoint ?? null, namespace: body.namespace ?? null, note: body.note ?? null }), new Date().toISOString())
    .run();
  return c.json({ id, status: "queued" }, 202);
});

app.post("/internal/ingest", async (c) => {
  const pages = Math.min(20, Math.max(1, Number(new URL(c.req.url).searchParams.get("pages") ?? "2")));
  const result = await ingestPages(c.env, null, pages);
  return c.json(result);
});

app.post("/internal/ingest-plaza", async (c) => {
  const body = await c.req.json<PlazaCatalog>().catch(() => null);
  if (!body?.servers || !Array.isArray(body.servers)) {
    return c.json({ error: { code: "INVALID", message: "需要 PlazaCatalog.servers" } }, 400);
  }
  const result = await persistPlazaCatalog(c.env, body);
  return c.json(result);
});

app.post("/internal/ingest-readmes", async (c) => {
  const body = await c.req.json<{ readmes?: Array<{ serverId?: string; body?: string; collectedAt?: string; reliableConfig?: ReliableConfig | null }> }>().catch(() => null);
  const readmes = (body?.readmes ?? []).flatMap((item) => {
    if (!item.serverId || !item.body) return [];
    const config = item.reliableConfig;
    const reliableConfig = config && (config.source === "readme" || config.source === "remote") ? config : null;
    return [{ serverId: item.serverId, body: item.body, collectedAt: item.collectedAt || new Date().toISOString(), reliableConfig }];
  });
  if (!readmes.length) return c.json({ error: { code: "INVALID", message: "需要 readmes" } }, 400);
  return c.json(await upsertReadmes(c.env.DB, readmes));
});

app.get("/internal/probe-queue", async (c) => {
  const transport = c.req.query("transport") === "local" ? "local" : "remote";
  const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit") ?? "20")));
  return c.json({ transport, ids: await listProbeQueue(c.env.DB, transport, limit) });
});

app.post("/internal/verify", async (c) => {
  const body = await c.req.json<{ serverId?: string; stdioHandshake?: unknown }>().catch(() => null);
  if (!body?.serverId) return c.json({ error: { code: "INVALID", message: "serverId required" } }, 400);
  const result = await verifyServer(c.env, body.serverId, stdioHandshakeOf(body.stdioHandshake));
  return c.json(result);
});

app.post("/internal/rebuild-index", async (c) => {
  const index = await putCatalogIndex(c.env);
  return c.json({ generatedAt: index.generatedAt, count: index.servers.length });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // The production catalog currently uses the curated local dataset as its
        // source of truth. Keep the registry workflow available for a future
        // opt-in import, but do not merge Official Registry records on schedule.
        const due = await listDueServerIds(env.DB, 200);
        if (due.length && env.VERIFY_QUEUE) {
          await env.VERIFY_QUEUE.sendBatch(due.map((serverId) => ({ body: { serverId } })));
        }
        const github = await scanGitHubRepositories(env);
        console.log(JSON.stringify({ path: "scheduled-github-scan", ...github }));
      })(),
    );
  },
  async queue(batch: MessageBatch<unknown>, env: Bindings): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as { serverId?: string };
      if (!body.serverId) {
        message.ack();
        continue;
      }
      try {
        await verifyServer(env, body.serverId);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({ path: "queue", serverId: body.serverId, error: String(error) }));
        message.retry();
      }
    }
    await putCatalogIndex(env);
  },
} satisfies ExportedHandler<Bindings>;
