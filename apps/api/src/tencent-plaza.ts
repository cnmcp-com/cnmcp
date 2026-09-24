import { isOfficialPublisher, type DeclaredTool, type PricingModel, type ReliableConfig, type SourceInfo, type Transport } from "@cnmcp/schema";
import { checkCatalogServer, type StaticCatalogCheck, type StaticCatalogInput } from "@cnmcp/checkers";

import { replacePlazaFacts, upsertServer, upsertStaticCheck } from "./db";
import { declaredToolsFromSources, extractReliableConfig, httpUrl, isLikelyMcpEndpoint } from "./plaza-normalize";

export { isLikelyMcpEndpoint };

export const TENCENT_PLAZA_SOURCE = "tencent-mcp-plaza";
export const TENCENT_PLAZA_URL = "https://cloud.tencent.com/developer/mcp";
export const TENCENT_OFFICIAL_CATEGORY_ID = 100;

export type PlazaAuthParam = {
  fieldName: string;
  required: boolean;
  isHeader: boolean;
  placeholder: string | null;
};

export type PlazaTool = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export type CnmcpCategoryRef = {
  id: string;
  name: string;
};

export type PlazaCatalogServer = {
  id: string;
  plazaMcpId: number;
  namespace: string;
  name: string;
  title: string;
  description: string;
  mcpName: string;
  srcAuthor: string;
  repoUrl: string | null;
  srcUrl?: string | null;
  homepage: string;
  plazaUrl: string;
  iconUrl: string | null;
  isOfficial: boolean;
  isHosted: boolean;
  isVerified: boolean;
  transport: Transport;
  pricingModel: PricingModel;
  plazaCategories?: Array<{ categoryId: number; name: string }>;
  categories?: Array<{ categoryId: number; name: string }>;
  cnmcpCategories?: CnmcpCategoryRef[];
  claimedToolNames: string[];
  tools?: PlazaTool[];
  declaredTools?: DeclaredTool[];
  reliableConfig?: ReliableConfig | null;
  samplePrompts?: string[];
  install?: { env: string[]; headers: string[] };
  authParams: PlazaAuthParam[];
  remotes: Array<{ type: string; url: string }>;
  sourceRegistries: string[];
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  readNum: number;
  srcSite: string | null;
  reliability?: "github" | "cn-official" | "hosted" | "unverified-source";
};

export type PlazaCatalog = {
  source: typeof TENCENT_PLAZA_SOURCE;
  sourceUrl: typeof TENCENT_PLAZA_URL;
  crawledAt: string;
  total: number;
  hosted?: number;
  official: number;
  remote: number;
  listed?: number;
  dropped?: Record<string, number>;
  taxonomy?: unknown;
  plazaMapping?: unknown;
  servers: PlazaCatalogServer[];
};

const PLACEHOLDER_RE = /[<>{}]|your[-_ ]?token|your_?key|example\.com|placeholder|xxxx|changeme|insert[-_ ]?here/i;

export function plazaServerId(mcpId: number): string {
  return `cloud.tencent.com/${mcpId}`;
}

export function toIsoFromPlaza(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim().replace(" ", "T");
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : `${trimmed}+08:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function githubRepoUrl(srcUrl: string | null | undefined): string | null {
  if (!srcUrl) return null;
  try {
    const url = new URL(srcUrl);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return `https://github.com/${owner}/${repo}`;
  } catch {
    return null;
  }
}

export function inferPricingModel(params: PlazaAuthParam[]): PricingModel {
  const names = params.map((item) => item.fieldName.toLowerCase());
  if (names.some((name) => /secret|token|api[_-]?key|authorization|password|access[_-]?key/.test(name))) {
    return "byok";
  }
  return "unknown";
}

export function inferTransport(input: {
  isHosted: boolean;
  remotes: Array<{ url: string }>;
  authParams: PlazaAuthParam[];
}): Transport {
  if (input.remotes.length > 0) return "remote";
  return "local";
}

export function extractRemotesFromReadme(readme: string | null | undefined): Array<{ type: string; url: string }> {
  if (!readme) return [];
  const found = new Map<string, { type: string; url: string }>();
  const patterns = [
    /"url"\s*:\s*"(https?:\/\/[^"]+)"/gi,
    /'url'\s*:\s*'(https?:\/\/[^']+)'/gi,
  ];
  for (const pattern of patterns) {
    for (const match of readme.matchAll(pattern)) {
      const url = match[1]?.trim();
      if (!url || PLACEHOLDER_RE.test(url)) continue;
      if (/mcp-api\.tencent-cloud\.com\/sse\//i.test(url)) continue;
      if (!isLikelyMcpEndpoint(url)) continue;
      const type = /\/sse(\/|$)/i.test(new URL(url).pathname) ? "sse" : "streamable-http";
      found.set(url, { type, url });
    }
  }
  return [...found.values()];
}

export function shouldPersistPlazaServer(server: PlazaCatalogServer): boolean {
  if (server.isHosted || server.reliability === "hosted") return false;
  if (server.reliability === "unverified-source") return false;
  if (server.reliability === "github" || server.reliability === "cn-official") return true;
  return Boolean(server.repoUrl) || server.isOfficial;
}

export function sourceInfoOf(server: PlazaCatalogServer): SourceInfo {
  const plazaCategories = (server.plazaCategories ?? server.categories ?? []).filter(
    (item) => typeof item.categoryId === "number" && Boolean(item.name),
  );
  return {
    author: server.srcAuthor?.trim() || null,
    iconUrl: httpUrl(server.iconUrl),
    srcUrl: httpUrl(server.srcUrl) ?? httpUrl(server.repoUrl),
    srcSite: server.srcSite?.trim() || null,
    plazaUrl: httpUrl(server.plazaUrl) ?? httpUrl(server.homepage),
    categories: (server.cnmcpCategories ?? []).filter((item) => item.id && item.name),
    plazaCategories,
  };
}

export function declaredToolsOf(server: PlazaCatalogServer): DeclaredTool[] {
  const tools = server.declaredTools?.length ? server.declaredTools : declaredToolsFromSources({ tools: server.tools ?? [] });
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (!tool.name || seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
}

export function reliableConfigOf(server: PlazaCatalogServer): ReliableConfig | null {
  if ("reliableConfig" in server) return server.reliableConfig ?? null;
  return extractReliableConfig({ remotes: server.remotes, serverKey: server.mcpName || server.name });
}

export function staticCheckInputOf(
  server: PlazaCatalogServer,
  readme: string | null = null,
  isOfficial = server.isOfficial,
): StaticCatalogInput {
  return {
    id: server.id,
    transport: server.transport,
    repoUrl: server.repoUrl,
    reliability: server.reliability ?? null,
    isOfficial,
    pricingModel: server.pricingModel,
    lastPublishedAt: server.lastPublishedAt,
    tools: declaredToolsOf(server),
    reliableConfig: reliableConfigOf(server),
    authParams: server.authParams,
    install: server.install ?? { env: [], headers: [] },
    readme,
  };
}

export function staticCheckOf(input: StaticCatalogInput, checkedAt: string): StaticCatalogCheck {
  const parsed = Date.parse(checkedAt);
  return checkCatalogServer(input, Number.isFinite(parsed) ? parsed : Date.now());
}

function claimedNamesOf(server: PlazaCatalogServer): string[] {
  const declared = declaredToolsOf(server);
  if (declared.length) return declared.map((item) => item.name);
  if (Array.isArray(server.claimedToolNames) && server.claimedToolNames.length) return server.claimedToolNames;
  return [];
}

export async function persistPlazaCatalog(env: CloudflareEnv, catalog: PlazaCatalog): Promise<{ upserted: number; queued: 0; skipped: number }> {
  let upserted = 0;
  let skipped = 0;
  for (const server of catalog.servers) {
    if (!shouldPersistPlazaServer(server)) {
      skipped += 1;
      continue;
    }
    const isOfficial = server.isOfficial || isOfficialPublisher(server.srcUrl ?? server.repoUrl);
    await upsertServer(env.DB, {
      id: server.id,
      title: server.title,
      description: server.description,
      repoUrl: server.repoUrl,
      packageName: server.mcpName || null,
      latestVersion: null,
      versionCount: 1,
      firstPublishedAt: server.firstPublishedAt,
      lastPublishedAt: server.lastPublishedAt,
      isOfficial,
      transport: server.transport,
      homepage: server.homepage,
      remoteUrl: server.remotes.find((item) => isLikelyMcpEndpoint(item.url))?.url ?? null,
      remoteTransport: server.remotes.find((item) => isLikelyMcpEndpoint(item.url))?.type ?? null,
      sourceRegistries: server.sourceRegistries.length ? server.sourceRegistries : [TENCENT_PLAZA_SOURCE],
      claimedToolNames: claimedNamesOf(server),
    });
    if (server.pricingModel !== "unknown") {
      await env.DB.prepare(
        `INSERT INTO pricing (server_id, model, source, collected_at) VALUES (?, ?, 'vendor', ?)
         ON CONFLICT(server_id) DO UPDATE SET model = excluded.model, source = excluded.source, collected_at = excluded.collected_at`,
      )
        .bind(server.id, server.pricingModel, catalog.crawledAt)
        .run();
    }
    await replacePlazaFacts(env.DB, {
      serverId: server.id,
      source: sourceInfoOf(server),
      declaredTools: declaredToolsOf(server),
      reliableConfig: reliableConfigOf(server),
      collectedAt: catalog.crawledAt,
    });
    const readme = await env.DB.prepare(`SELECT body FROM server_readmes WHERE server_id = ?`).bind(server.id).first<{ body: string }>();
    await upsertStaticCheck(env.DB, staticCheckOf(staticCheckInputOf(server, readme?.body ?? null, isOfficial), catalog.crawledAt), catalog.crawledAt);
    upserted += 1;
  }
  return { upserted, queued: 0, skipped };
}
