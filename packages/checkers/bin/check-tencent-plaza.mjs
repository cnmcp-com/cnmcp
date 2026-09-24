#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractReliableConfig, parseDeclaredToolsFromReadme } from "../../../apps/api/src/plaza-normalize.ts";
import { checkCatalogServer, summarizeCatalogChecks } from "../src/static.ts";

const root = resolve(import.meta.dirname, "../../..");
const inputPath = resolve(root, process.argv[2] ?? "data/tencent-plaza/catalog.json");
const outputPath = resolve(root, process.argv[3] ?? "data/tencent-plaza/checks.jsonl");
const summaryPath = resolve(root, process.argv[4] ?? "data/tencent-plaza/check-summary.json");
const readmesPath = resolve(root, process.argv[5] ?? "data/tencent-plaza/readmes.jsonl");

const catalog = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(catalog?.servers)) throw new Error("catalog.servers must be an array");
const readmes = new Map(
  (await readFile(readmesPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((item) => item?.serverId && typeof item.body === "string")
    .map((item) => [item.serverId, item.body]),
);

const referenceTime = Number.isFinite(Date.parse(catalog.crawledAt)) ? Date.parse(catalog.crawledAt) : Date.now();
const checks = catalog.servers.map((server) => {
  const readme = readmes.get(server.id) ?? "";
  const tools = Array.isArray(server.tools) && server.tools.length ? server.tools : parseDeclaredToolsFromReadme(readme);
  const reliableConfig =
    server.reliableConfig ??
    extractReliableConfig({ readme, remotes: server.remotes ?? [], serverKey: server.mcpName || server.name });
  return checkCatalogServer(
    {
      id: server.id,
      transport: server.transport,
      repoUrl: server.repoUrl ?? null,
      reliability: server.reliability ?? null,
      isOfficial: Boolean(server.isOfficial),
      pricingModel: server.pricingModel ?? "unknown",
      lastPublishedAt: server.lastPublishedAt ?? null,
      tools,
      reliableConfig,
      authParams: Array.isArray(server.authParams) ? server.authParams : [],
      install: server.install ?? { env: [], headers: [] },
      readme,
    },
    referenceTime,
  );
});

const summary = {
  checkerVersion: "static-v1",
  source: catalog.source ?? null,
  sourceCrawledAt: catalog.crawledAt ?? null,
  generatedAt: new Date().toISOString(),
  ...summarizeCatalogChecks(checks),
};

await writeFile(outputPath, `${checks.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ outputPath, summaryPath, ...summary }, null, 2));
