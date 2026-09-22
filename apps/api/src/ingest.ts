import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { listRemoteServerIds, upsertServer } from "./db";
import { fetchRegistryPage, type NormalizedRegistryServer } from "./registry";

export type IngestParams = { cursor: string | null };

function transportOf(server: NormalizedRegistryServer): "remote" | "local" | "unknown" {
  if (server.remotes.length > 0) return "remote";
  if (server.packages.length > 0) return "local";
  return "unknown";
}

export async function persistRegistryServers(env: CloudflareEnv, servers: NormalizedRegistryServer[]): Promise<{ upserted: number; queued: number }> {
  const latest = new Map<string, NormalizedRegistryServer>();
  for (const server of servers) {
    const existing = latest.get(server.id);
    if (!existing || server.isLatest || (server.updatedAt ?? "") > (existing.updatedAt ?? "")) {
      latest.set(server.id, server);
    }
  }

  let upserted = 0;
  const queued: string[] = [];
  for (const server of latest.values()) {
    const transport = transportOf(server);
    await upsertServer(env.DB, {
      id: server.id,
      title: server.title,
      description: server.description,
      repoUrl: server.repoUrl,
      packageName: server.packageName,
      latestVersion: server.version,
      versionCount: Math.max(1, server.version ? 1 : 0),
      firstPublishedAt: server.publishedAt,
      lastPublishedAt: server.updatedAt ?? server.publishedAt,
      isOfficial: server.isOfficial,
      transport,
      homepage: server.homepage,
      remoteUrl: server.remotes[0]?.url ?? null,
      remoteTransport: server.remotes[0]?.type ?? null,
    });
    upserted += 1;
    if (transport === "remote") queued.push(server.id);
  }

  if (env.VERIFY_QUEUE && queued.length) {
    await env.VERIFY_QUEUE.sendBatch(queued.slice(0, 100).map((serverId) => ({ body: { serverId } })));
  }

  return { upserted, queued: queued.length };
}

export async function ingestPages(env: CloudflareEnv, startCursor: string | null, pageLimit: number): Promise<{ upserted: number; queued: number; nextCursor: string | null; pages: number }> {
  let cursor = startCursor;
  let pages = 0;
  let upserted = 0;
  let queued = 0;
  while (pages < pageLimit) {
    const page = await fetchRegistryPage(fetch, cursor);
    const persisted = await persistRegistryServers(env, page.servers);
    upserted += persisted.upserted;
    queued += persisted.queued;
    pages += 1;
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  await env.DB.prepare(`INSERT OR REPLACE INTO ingest_state (key, value) VALUES ('cursor', ?)`).bind(cursor ?? "").run();
  return { upserted, queued, nextCursor: cursor, pages };
}

export class IngestWorkflow extends WorkflowEntrypoint<CloudflareEnv, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep): Promise<{ upserted: number; pages: number }> {
    let cursor = event.payload.cursor;
    let page = 0;
    let upserted = 0;
    while (page < 400) {
      const result = await step.do(
        `ingest-${page}`,
        { retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "5 minutes" },
        async () => ingestPages(this.env, cursor, 5),
      );
      upserted += result.upserted;
      page += result.pages;
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    const due = await listRemoteServerIds(this.env.DB, 300);
    if (this.env.VERIFY_QUEUE && due.length) {
      await this.env.VERIFY_QUEUE.sendBatch(due.slice(0, 100).map((serverId) => ({ body: { serverId } })));
    }
    return { upserted, pages: page };
  }
}
