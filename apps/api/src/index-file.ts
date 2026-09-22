import { ALGORITHM_VERSION, type CatalogIndex } from "@cnmcp/schema";

import { listCatalogEntries } from "./db";

export async function buildCatalogIndex(db: D1Database): Promise<CatalogIndex> {
  const servers = await listCatalogEntries(db);
  return {
    generatedAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
    servers,
  };
}

export async function putCatalogIndex(env: CloudflareEnv): Promise<CatalogIndex> {
  const index = await buildCatalogIndex(env.DB);
  if (env.EVIDENCE) {
    await env.EVIDENCE.put("servers-index.json", JSON.stringify(index), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }
  return index;
}
