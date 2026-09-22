import { Hono } from "hono";

import { ALGORITHM_VERSION } from "@cnmcp/schema";

import { renderBadge } from "./badge";
import { getDirectory, getServerDetail, getStats, listDueServerIds } from "./db";
import { IngestWorkflow, ingestPages } from "./ingest";
import { buildCatalogIndex, putCatalogIndex } from "./index-file";
import { persistPlazaCatalog, type PlazaCatalog } from "./tencent-plaza";
import { verifyServer } from "./verify";

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

app.get("/health", (c) => c.json({ ok: true, algorithmVersion: ALGORITHM_VERSION }));

app.get("/v1/stats", async (c) => {
  const stats = await getStats(c.env.DB);
  return c.json({ ...stats, algorithmVersion: ALGORITHM_VERSION, probeLabel: "本站探测可达" });
});

app.get("/v1/servers", async (c) => {
  const url = new URL(c.req.url);
  const result = await getDirectory(c.env.DB, {
    q: url.searchParams.get("q") ?? "",
    grade: (url.searchParams.get("grade") ?? "") as never,
    reachable: (url.searchParams.get("reachable") ?? "") as never,
    transport: (url.searchParams.get("transport") ?? "") as never,
    official: (url.searchParams.get("official") ?? "") as never,
    pricing: (url.searchParams.get("pricing") ?? "") as never,
    cursor: url.searchParams.get("cursor") ?? "",
    limit: Number(url.searchParams.get("limit") ?? "30"),
  });
  return c.json(result);
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

app.post("/internal/verify", async (c) => {
  const body = await c.req.json<{ serverId?: string }>().catch(() => null);
  if (!body?.serverId) return c.json({ error: { code: "INVALID", message: "serverId required" } }, 400);
  const result = await verifyServer(c.env, body.serverId);
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
        await env.INGEST_WORKFLOW.create({ params: { cursor: null } });
        const due = await listDueServerIds(env.DB, 200);
        if (due.length && env.VERIFY_QUEUE) {
          await env.VERIFY_QUEUE.sendBatch(due.map((serverId) => ({ body: { serverId } })));
        }
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
