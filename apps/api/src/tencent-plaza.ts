import type { PricingModel, Transport } from "@cnmcp/schema";

import { upsertServer } from "./db";

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

export function isLikelyMcpEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "::1" || host === "0.0.0.0" || host === "::") return false;
    if (host.includes("xn--") || /[^\u0000-\u007F]/.test(url)) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
    if (host.startsWith("::ffff:")) return false;
    if (/[^\u0000-\u007F]/.test(host)) return false;
    if (/your[-_.]|example|placeholder|changeme|insert[-_]?here/i.test(host)) return false;
    if (/(^|\.)(github\.com|githubusercontent\.com|gitlab\.com|bitbucket\.org|news\.ycombinator\.com)$/i.test(host)) return false;
    if (/[?&](api[_-]?key|token|secret|access[_-]?key|authorization)=/i.test(parsed.search)) return false;
    const path = parsed.pathname.toLowerCase();
    if (/\.(md|html?|png|jpe?g|svg|json)$/i.test(path)) return false;
    if (/readme|swagger|petstore/i.test(`${host}${path}`)) return false;
    return /\/mcp(\/|$)/i.test(path) || /\/sse(\/|$)/i.test(path) || /(^|\.)mcp[.-]/i.test(host) || host.includes("mcp.");
  } catch {
    return false;
  }
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

function claimedNamesOf(server: PlazaCatalogServer): string[] {
  if (Array.isArray(server.claimedToolNames) && server.claimedToolNames.length) return server.claimedToolNames;
  return (server.tools ?? []).map((item) => item.name).filter(Boolean);
}

export async function persistPlazaCatalog(env: CloudflareEnv, catalog: PlazaCatalog): Promise<{ upserted: number; queued: 0; skipped: number }> {
  let upserted = 0;
  let skipped = 0;
  for (const server of catalog.servers) {
    if (!shouldPersistPlazaServer(server)) {
      skipped += 1;
      continue;
    }
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
      isOfficial: server.isOfficial,
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
    upserted += 1;
  }
  return { upserted, queued: 0, skipped };
}
