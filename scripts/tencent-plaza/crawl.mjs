#!/usr/bin/env node
/**
 * 腾讯云 MCP 广场爬虫。
 * 拉全量卡片 + 详情，输出 CNMCP 第一批目录 JSON。
 *
 *   node scripts/tencent-plaza/crawl.mjs
 *   node scripts/tencent-plaza/crawl.mjs --limit 20 --concurrency 4
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { declaredToolsFromSources, extractReliableConfig } from "../../apps/api/src/plaza-normalize.ts";
import { categoryMap, mapToCnmcpCategories, reliabilityOf } from "./categories.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "data/tencent-plaza");
const RAW_DIR = path.join(OUT_DIR, "raw");

const API_BASE = "https://developer.cloud.tencent.com/api";
const PLAZA_URL = "https://cloud.tencent.com/developer/mcp";
const SOURCE = "tencent-mcp-plaza";
const OFFICIAL_CATEGORY_ID = 100;
const USER_AGENT = "cnmcp-tencent-plaza-crawler/0.1 (+https://www.cnmcp.com)";
const PLACEHOLDER_RE = /[<>{}]|your[-_ ]?token|your_?key|example\.com|placeholder|xxxx|changeme|insert[-_ ]?here/i;

const args = parseArgs(process.argv.slice(2));
const concurrency = Math.max(1, args.concurrency ?? 6);
const limit = args.limit ?? Infinity;
const skipDetails = Boolean(args.skipDetails);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--skip-details") out.skipDetails = true;
    else if (key === "--refresh") out.refresh = true;
    else if (key === "--ids") out.ids = String(argv[++i] ?? "").split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
    else if (key === "--limit") out.limit = Number(argv[++i]);
    else if (key === "--concurrency") out.concurrency = Number(argv[++i]);
    else throw new Error(`未知参数: ${key}`);
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(pathname, body, attempt = 1) {
  let response;
  try {
    response = await fetch(`${API_BASE}${pathname}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://developer.cloud.tencent.com",
        referer: "https://developer.cloud.tencent.com/mcp",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await sleep(600 * 2 ** (attempt - 1));
    return postJson(pathname, body, attempt + 1);
  }
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 6) throw new Error(`${pathname} HTTP ${response.status}`);
    await sleep(400 * 2 ** (attempt - 1));
    return postJson(pathname, body, attempt + 1);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plazaServerId(mcpId) {
  return `cloud.tencent.com/${mcpId}`;
}

function toIsoFromPlaza(value) {
  if (!value || !String(value).trim()) return null;
  const trimmed = String(value).trim().replace(" ", "T");
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : `${trimmed}+08:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function githubRepoUrl(srcUrl) {
  if (!srcUrl) return null;
  try {
    const url = new URL(srcUrl);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  } catch {
    return null;
  }
}

function parseTools(raw) {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item) => ({
      name: asString(item.name) ?? "",
      description: asString(item.description) ?? "",
      inputSchema: item.inputSchema ?? null,
    }))
    .filter((item) => item.name);
}

function parseAuthParams(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item) => ({
      fieldName: asString(item.fieldName) ?? "",
      required: Boolean(item.required),
      isHeader: Boolean(item.isHeader),
      placeholder: asString(item.placeholder),
    }))
    .filter((item) => item.fieldName);
}

function inferPricingModel(params) {
  const names = params.map((item) => item.fieldName.toLowerCase());
  if (names.some((name) => /secret|token|api[_-]?key|authorization|password|access[_-]?key/.test(name))) return "byok";
  return "unknown";
}

function isLikelyMcpEndpoint(url) {
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
    const pathName = parsed.pathname.toLowerCase();
    if (/\.(md|html?|png|jpe?g|svg|json)$/i.test(pathName)) return false;
    if (/readme|swagger|petstore/i.test(`${host}${pathName}`)) return false;
    return /\/mcp(\/|$)/i.test(pathName) || /\/sse(\/|$)/i.test(pathName) || /(^|\.)mcp[.-]/i.test(host) || host.includes("mcp.");
  } catch {
    return false;
  }
}

function extractRemotesFromReadme(readme) {
  if (!readme) return [];
  const found = new Map();
  const patterns = [/"url"\s*:\s*"(https?:\/\/[^"]+)"/gi, /'url'\s*:\s*'(https?:\/\/[^']+)'/gi];
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

function inferTransport({ remotes }) {
  if (remotes.length > 0) return "remote";
  return "local";
}

function mergeCategories(card, detail) {
  const byId = new Map();
  for (const source of [card.categoryList, detail?.categoryList]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const rec = asRecord(item);
      if (!rec || typeof rec.categoryId !== "number") continue;
      byId.set(rec.categoryId, { categoryId: rec.categoryId, name: asString(rec.name) ?? String(rec.categoryId) });
    }
  }
  const ids = [
    ...(Array.isArray(detail?.categoryIds) ? detail.categoryIds : []),
    ...(Array.isArray(card.categoryIds) ? card.categoryIds : []),
  ];
  for (const id of ids) {
    if (typeof id === "number" && !byId.has(id)) byId.set(id, { categoryId: id, name: String(id) });
  }
  return [...byId.values()];
}

async function mapPool(items, width, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => worker()));
  return results;
}

async function fetchHostedCards() {
  const hosted = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await postJson("/mcp/list-by-search", { page, pageSize: 30, isHosted: true });
    const list = Array.isArray(payload?.list) ? payload.list : [];
    hosted.push(...list);
    if (list.length < 30) break;
  }
  return hosted;
}

async function fetchAllCards() {
  const [listPayload, hostedList, categoryPayload] = await Promise.all([
    postJson("/mcp/list", {}),
    fetchHostedCards(),
    postJson("/mcp/categories", {}),
  ]);
  const categories = Array.isArray(categoryPayload?.list) ? categoryPayload.list : [];
  const hostedIds = new Set(hostedList.map((item) => item.mcpId));
  const byId = new Map();
  for (const category of listPayload?.list ?? []) {
    const catMeta = { categoryId: category.categoryId, name: category.name };
    for (const server of category.mcpServers ?? []) {
      const rec = asRecord(server);
      if (!rec || typeof rec.mcpId !== "number") continue;
      const current = byId.get(rec.mcpId) ?? { ...rec, categoryList: [] };
      const names = new Set((current.categoryList ?? []).map((item) => item.categoryId));
      const merged = [...(current.categoryList ?? [])];
      for (const cat of rec.categoryList ?? []) {
        if (!names.has(cat.categoryId)) {
          names.add(cat.categoryId);
          merged.push(cat);
        }
      }
      if (catMeta.categoryId && !names.has(catMeta.categoryId)) merged.push(catMeta);
      current.isHosted = current.isHosted || rec.isHosted || hostedIds.has(rec.mcpId) ? 1 : 0;
      current.categoryList = merged;
      byId.set(rec.mcpId, current);
    }
  }
  for (const hosted of hostedList) {
    const rec = asRecord(hosted);
    if (!rec || typeof rec.mcpId !== "number") continue;
    const current = byId.get(rec.mcpId) ?? rec;
    current.isHosted = 1;
    byId.set(rec.mcpId, current);
  }
  return { cards: [...byId.values()].sort((a, b) => a.mcpId - b.mcpId), categories, hostedIds };
}

function compactDetail(detail, previous) {
  const apiTools = parseTools(detail.tools);
  const readme = asString(detail.readme) ?? asString(detail.rawReadme) ?? "";
  const remotes = extractRemotesFromReadme(readme);
  const readmeTools = apiTools.length
    ? []
    : declaredToolsFromSources({ readme }).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: null }));
  const tools = apiTools.length ? apiTools : previous?.tools?.length ? previous.tools : readmeTools;
  return {
    mcpId: detail.mcpId,
    mcpName: detail.mcpName ?? "",
    title: detail.title ?? "",
    abstract: detail.abstract ?? "",
    srcAuthor: detail.srcAuthor ?? "",
    srcSite: detail.srcSite ?? "",
    srcUrl: detail.srcUrl ?? "",
    iconUrl: detail.iconUrl ?? "",
    isHosted: Number(detail.isHosted) || 0,
    isVerified: Number(detail.isVerified) || 0,
    source: detail.source ?? 0,
    createdAt: detail.createdAt ?? null,
    updatedAt: detail.updatedAt ?? null,
    readNum: Number(detail.readNum) || 0,
    categoryIds: Array.isArray(detail.categoryIds) ? detail.categoryIds : [],
    categoryList: Array.isArray(detail.categoryList) ? detail.categoryList : [],
    mcpParams: parseAuthParams(detail.mcpParams),
    tools,
    reliableConfig: extractReliableConfig({ readme, remotes, serverKey: asString(detail.mcpName) }),
    samplePrompts: Array.isArray(detail.samplePrompts) ? detail.samplePrompts.filter((item) => typeof item === "string") : [],
    remotes,
  };
}

async function loadPreviousDetails() {
  const map = new Map();
  const text = await readFile(path.join(RAW_DIR, "details.jsonl"), "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    if (typeof item.mcpId === "number") map.set(item.mcpId, item);
  }
  return map;
}

function toCatalogServer(card, detail, hostedIds) {
  const mcpId = card.mcpId;
  const plazaUrl = `https://developer.cloud.tencent.com/mcp/server/${mcpId}`;
  const authParams = parseAuthParams(detail?.mcpParams);
  const tools = Array.isArray(detail?.tools) ? detail.tools : [];
  const remotes = detail?.remotes?.length ? detail.remotes : extractRemotesFromReadme(detail?.readme);
  const isHosted = Boolean(card.isHosted) || Boolean(detail?.isHosted) || hostedIds.has(mcpId);
  const plazaCategories = mergeCategories(card, detail);
  const plazaOfficial = plazaCategories.some((item) => item.categoryId === 100);
  const srcUrl = asString(detail?.srcUrl);
  const repoUrl = githubRepoUrl(srcUrl);
  const title = asString(detail?.title) || asString(card.title) || asString(card.mcpName) || String(mcpId);
  const srcAuthor = asString(detail?.srcAuthor) || asString(card.srcAuthor) || "";
  const mcpName = asString(detail?.mcpName) || asString(card.mcpName) || "";
  const srcSite = asString(detail?.srcSite);
  const reliability = reliabilityOf({
    isHosted,
    repoUrl,
    srcAuthor,
    title,
    plazaOfficial,
    srcSite,
  });
  return {
    id: plazaServerId(mcpId),
    plazaMcpId: mcpId,
    namespace: "cloud.tencent.com",
    name: String(mcpId),
    title,
    description: asString(detail?.abstract) || asString(card.abstract) || "",
    mcpName,
    srcAuthor,
    repoUrl,
    srcUrl,
    homepage: plazaUrl,
    plazaUrl,
    iconUrl: asString(detail?.iconUrl) || asString(card.iconUrl),
    isOfficial: plazaOfficial || reliability.reason === "cn-official",
    isHosted,
    isVerified: Boolean(detail?.isVerified) || Boolean(card.isVerified),
    transport: inferTransport({ remotes }),
    pricingModel: inferPricingModel(authParams),
    plazaCategories: plazaCategories.filter((item) => item.categoryId !== 100),
    cnmcpCategories: mapToCnmcpCategories(plazaCategories, { title, srcAuthor, mcpName, plazaOfficial }),
    claimedToolNames: tools.map((item) => item.name),
    tools,
    reliableConfig: detail && Object.prototype.hasOwnProperty.call(detail, "reliableConfig")
      ? detail.reliableConfig
      : extractReliableConfig({ remotes, serverKey: mcpName }),
    samplePrompts: Array.isArray(detail?.samplePrompts) ? detail.samplePrompts : [],
    install: {
      env: authParams.filter((item) => !item.isHeader).map((item) => item.fieldName),
      headers: authParams.filter((item) => item.isHeader).map((item) => item.fieldName),
    },
    authParams,
    remotes,
    sourceRegistries: [SOURCE],
    firstPublishedAt: toIsoFromPlaza(detail?.createdAt || card.createdAt),
    lastPublishedAt: toIsoFromPlaza(detail?.updatedAt || card.updatedAt),
    readNum: Number(detail?.readNum ?? card.readNum) || 0,
    srcSite,
    reliability: reliability.reason,
  };
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  console.log("拉取广场列表…");
  const loaded = args.refresh
    ? JSON.parse(await readFile(path.join(RAW_DIR, "list.json"), "utf8"))
    : null;
  const { cards, categories, hostedIds } = loaded
    ? {
        cards: loaded.servers,
        categories: loaded.categories ?? [],
        hostedIds: new Set(loaded.servers.filter((card) => card.isHosted).map((card) => card.mcpId)),
      }
    : await fetchAllCards();
  const selected = cards.slice(0, Number.isFinite(limit) ? limit : cards.length);
  const hostedCards = selected.filter((card) => Boolean(card.isHosted) || hostedIds.has(card.mcpId));
  const detailTargets = selected.filter((card) => !Boolean(card.isHosted) && !hostedIds.has(card.mcpId));
  await writeFile(path.join(RAW_DIR, "list.json"), JSON.stringify({ total: cards.length, categories, servers: cards }, null, 2));
  console.log(`列表 ${cards.length} 条，云托管跳过 ${hostedCards.length} 条，本次抓取 ${detailTargets.length} 条详情`);

  const details = [];
  const previousDetails = args.refresh || !skipDetails ? await loadPreviousDetails() : new Map();
  const idFilter = Array.isArray(args.ids) ? new Set(args.ids) : null;
  const fetchTargets = idFilter ? detailTargets.filter((card) => idFilter.has(card.mcpId)) : detailTargets;
  if (!skipDetails) {
    let done = 0;
    const fetched = await mapPool(fetchTargets, concurrency, async (card) => {
      const previous = previousDetails.get(card.mcpId);
      try {
        const detail = await postJson("/mcp/detail", { mcpId: card.mcpId });
        done += 1;
        if (done % 50 === 0 || done === fetchTargets.length) {
          console.log(`详情 ${done}/${fetchTargets.length}`);
        }
        return compactDetail(detail, previous);
      } catch (error) {
        done += 1;
        console.warn(`详情 ${card.mcpId} 失败，保留已有记录: ${error instanceof Error ? error.message : String(error)}`);
        return previous ?? null;
      }
    });
    if (idFilter) {
      const fresh = new Map(fetched.map((item) => [item.mcpId, item]));
      for (const card of detailTargets) details.push(fresh.get(card.mcpId) ?? previousDetails.get(card.mcpId));
    } else {
      details.push(...fetched);
    }
    await writeFile(path.join(RAW_DIR, "details.jsonl"), `${details.filter(Boolean).map((item) => JSON.stringify(item)).join("\n")}\n`);
  } else {
    details.push(...detailTargets.map((card) => previousDetails.get(card.mcpId)).filter(Boolean));
  }

  const detailById = new Map(details.filter(Boolean).map((item) => [item.mcpId, item]));
  const mapped = detailTargets.map((card) => toCatalogServer(card, detailById.get(card.mcpId), hostedIds));
  const dropped = { hosted: hostedCards.length, "unverified-source": 0 };
  const servers = [];
  for (const server of mapped) {
    if (server.isHosted || server.reliability === "hosted") {
      dropped.hosted += 1;
      continue;
    }
    if (server.reliability === "unverified-source") {
      dropped["unverified-source"] += 1;
      continue;
    }
    servers.push(server);
  }
  const catalog = {
    source: SOURCE,
    sourceUrl: PLAZA_URL,
    crawledAt: new Date().toISOString(),
    taxonomy: categoryMap.cnmcpCategories,
    plazaMapping: categoryMap.plazaMapping,
    total: servers.length,
    listed: selected.length,
    dropped,
    official: servers.filter((item) => item.isOfficial).length,
    remote: servers.filter((item) => item.transport === "remote").length,
    servers,
  };
  const summary = {
    source: catalog.source,
    sourceUrl: catalog.sourceUrl,
    crawledAt: catalog.crawledAt,
    listed: selected.length,
    kept: servers.length,
    dropped,
    official: catalog.official,
    remote: catalog.remote,
    local: servers.filter((item) => item.transport === "local").length,
    byok: servers.filter((item) => item.pricingModel === "byok").length,
    withRepo: servers.filter((item) => item.repoUrl).length,
    withTools: servers.filter((item) => item.claimedToolNames.length > 0).length,
    withReliableConfig: servers.filter((item) => item.reliableConfig).length,
    withSamplePrompts: servers.filter((item) => item.samplePrompts.length > 0).length,
    reliability: countBy(servers, (item) => item.reliability),
    cnmcpCategories: categoryMap.cnmcpCategories.map((item) => ({
      id: item.id,
      name: item.name,
      count: servers.filter((server) => server.cnmcpCategories.some((cat) => cat.id === item.id)).length,
    })),
    plazaCategories: categories
      .filter((item) => item.categoryId !== OFFICIAL_CATEGORY_ID)
      .map((item) => ({
        categoryId: item.categoryId,
        name: item.name,
        mcpNum: item.mcpNum,
      })),
  };

  await writeFile(path.join(OUT_DIR, "catalog.json"), JSON.stringify(catalog));
  await writeFile(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`已写入 ${path.relative(ROOT, path.join(OUT_DIR, "catalog.json"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
