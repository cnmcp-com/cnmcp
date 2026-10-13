import { Hono } from "hono";

import { ALGORITHM_VERSION } from "@cnmcp/schema";

import { renderBadge } from "./badge";
import { getDirectory, getRecentActivity, getServerDetail, getStats, listDueServerIds, listProbeQueue } from "./db";
import { buildCatalogIndex, putCatalogIndex } from "./index-file";
import { listRecoverableSubmissionIds, processSubmission } from "./submission-processing";
import { normalizeSubmissionPayload, type SubmissionPayload } from "./submission";
import { stdioHandshakeOf, verifyServer } from "./verify";
import { enqueueStdioProbes, listDueStdioProbeIds, runCloudStdioProbe } from "./stdio-probe";

export { ContainerProxy, StdioProbeContainer } from "./stdio-container";

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
  const raw = await c.req.text();
  if (!raw || raw.length > 20_000) return c.json({ error: { code: "INVALID", message: "提交内容为空或过大" } }, 400);
  let body: SubmissionPayload;
  try {
    body = JSON.parse(raw) as SubmissionPayload;
  } catch {
    return c.json({ error: { code: "INVALID", message: "提交内容不是有效 JSON" } }, 400);
  }
  let payload;
  try {
    payload = normalizeSubmissionPayload(body);
  } catch (error) {
    const code = error instanceof Error ? error.message : "submission_invalid";
    const messages: Record<string, string> = {
      credential_material_not_allowed: "配置中包含疑似真实凭证，请改用环境变量占位符",
      public_locator_required: "请至少填写公开仓库、包名或 MCP 端点",
      endpoint_not_public_mcp: "端点必须是公开可访问的 MCP URL",
      repo_url_invalid: "仓库地址必须是完整的 http 或 https URL",
      endpoint_url_invalid: "端点地址必须是完整的 http 或 https URL",
    };
    return c.json({ error: { code: "INVALID", message: messages[code] ?? "提交内容不符合要求" } }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, type, payload, status, submitted_at) VALUES (?, ?, ?, 'queued', ?)`,
  )
    .bind(id, payload.type, JSON.stringify(payload), new Date().toISOString())
    .run();
  if (c.env.SUBMISSION_QUEUE) {
    try {
      await c.env.SUBMISSION_QUEUE.send({ kind: "submission", submissionId: id });
    } catch (error) {
      console.error(JSON.stringify({ path: "submission-enqueue", submissionId: id, error: String(error) }));
    }
  }
  return c.json({ id, status: "queued" }, 202);
});

app.get("/v1/submissions/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT id, status, resource_id, submitted_at, processed_at, error_code FROM submissions WHERE id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; status: string; resource_id: string | null; submitted_at: string; processed_at: string | null; error_code: string | null }>();
  if (!row) return c.json({ error: { code: "NOT_FOUND", message: "提交记录不存在" } }, 404);
  return c.json({
    id: row.id,
    status: row.status,
    resourceId: row.resource_id,
    submittedAt: row.submitted_at,
    processedAt: row.processed_at,
    errorCode: row.error_code,
  });
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

app.post("/internal/stdio-probes", async (c) => {
  if (!c.env.STDIO_PROBE_QUEUE) return c.json({ error: { code: "NOT_CONFIGURED", message: "stdio 探测队列尚未配置" } }, 503);
  const body = await c.req.json<{ serverId?: string; limit?: number }>().catch(() => null);
  const ids = body?.serverId
    ? [body.serverId]
    : await listDueStdioProbeIds(c.env.DB, Math.min(100, Math.max(1, Number(body?.limit ?? 10))));
  const queued = await enqueueStdioProbes(c.env, ids);
  return c.json({ queued, ids }, 202);
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
        if (env.SUBMISSION_QUEUE) {
          const submissions = await listRecoverableSubmissionIds(env.DB, 50);
          if (submissions.length) {
            await env.SUBMISSION_QUEUE.sendBatch(
              submissions.map((submissionId) => ({ body: { kind: "submission" as const, submissionId } })),
            );
          }
        }
        const due = await listDueServerIds(env.DB, 200);
        if (due.length && env.VERIFY_QUEUE) {
          await env.VERIFY_QUEUE.sendBatch(due.map((serverId) => ({ body: { serverId } })));
        }
        if (env.STDIO_PROBE_ENABLED === "true" && env.STDIO_PROBE_QUEUE) {
          const limit = Math.min(100, Math.max(1, Number(env.STDIO_PROBE_BATCH_SIZE ?? "10")));
          const stdioDue = await listDueStdioProbeIds(env.DB, limit);
          await enqueueStdioProbes(env, stdioDue);
        }
      })(),
    );
  },
  async queue(batch: MessageBatch<unknown>, env: Bindings): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as { kind?: "stdio" | "submission"; serverId?: string; submissionId?: string };
      if (body.kind === "submission" && body.submissionId) {
        try {
          await processSubmission(env, body.submissionId);
          message.ack();
        } catch (error) {
          console.error(JSON.stringify({ path: "submission-queue", submissionId: body.submissionId, error: String(error) }));
          message.retry();
        }
        continue;
      }
      if (!body.serverId) {
        message.ack();
        continue;
      }
      try {
        if (body.kind === "stdio") await runCloudStdioProbe(env, body.serverId);
        else await verifyServer(env, body.serverId);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({ path: "queue", serverId: body.serverId, error: String(error) }));
        message.retry();
      }
    }
    await putCatalogIndex(env);
  },
} satisfies ExportedHandler<Bindings>;
