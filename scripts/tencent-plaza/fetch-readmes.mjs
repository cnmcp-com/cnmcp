#!/usr/bin/env node
/**
 * 给还没有可靠接入配置的广场条目补 README。
 * 广场详情里的 README 已经是中文，直接存原文，并再抽一次 mcpServers。
 *
 *   node scripts/tencent-plaza/fetch-readmes.mjs
 *   node scripts/tencent-plaza/fetch-readmes.mjs --all
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractReliableConfig } from "../../apps/api/src/plaza-normalize.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG = path.join(ROOT, "data/tencent-plaza/catalog.json");
const OUT = path.join(ROOT, "data/tencent-plaza/readmes.jsonl");
const API = "https://developer.cloud.tencent.com/api/mcp/detail";
const all = process.argv.includes("--all");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postDetail(mcpId, attempt = 1) {
  let response;
  try {
    response = await fetch(API, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://developer.cloud.tencent.com",
        referer: "https://developer.cloud.tencent.com/mcp",
        "user-agent": "cnmcp-tencent-plaza-crawler/0.1 (+https://www.cnmcp.com)",
      },
      body: JSON.stringify({ mcpId }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (attempt >= 4) throw error;
    await sleep(400 * 2 ** (attempt - 1));
    return postDetail(mcpId, attempt + 1);
  }
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error(`HTTP ${response.status}`);
    await sleep(400 * 2 ** (attempt - 1));
    return postDetail(mcpId, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
const targets = catalog.servers.filter((server) => all || !server.reliableConfig);
const collectedAt = new Date().toISOString();
let foundConfig = 0;
let withBody = 0;
let failed = 0;
const lines = [];

await mapPool(targets, 6, async (server, index) => {
  const mcpId = server.plazaMcpId;
  try {
    const detail = await postDetail(mcpId);
    const body = String(detail.readme ?? detail.rawReadme ?? "").trim().slice(0, 24000);
    const reliableConfig = server.reliableConfig
      ? null
      : extractReliableConfig({ readme: body, remotes: server.remotes, serverKey: server.mcpName || server.name });
    if (body.length >= 40) {
      lines.push(JSON.stringify({ serverId: server.id, body, collectedAt, reliableConfig }));
      withBody += 1;
      if (reliableConfig) foundConfig += 1;
    }
  } catch (error) {
    failed += 1;
    console.error(`fail ${mcpId} ${error instanceof Error ? error.message : error}`);
  }
  if ((index + 1) % 50 === 0) console.log(`进度 ${index + 1}/${targets.length} 有正文 ${withBody} 新配置 ${foundConfig} 失败 ${failed}`);
});

await writeFile(OUT, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ targets: targets.length, withBody, foundConfig, failed, out: OUT }, null, 2));
