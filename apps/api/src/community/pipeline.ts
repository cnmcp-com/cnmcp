import { inferTaxonomy, type ScanEvidence } from "@cnmcp/schema";
import { discoverMcpEndpoints, scanProjectText } from "@cnmcp/checkers";

import type { McpHandshake } from "../mcp";
import { handshakeMcp } from "../mcp";
import { githubRepositoryFromUrl } from "../github-scan";
import { IngestError, loadGitHubRepository, type RepoSnapshot } from "./github";
import {
  appendScan,
  applyRepositorySnapshot,
  dynamicProbeEnabled,
  getStoredProject,
  getSubmission,
  insertMcpProbe,
  latestScan,
  listMaintenance,
  listTaxonomy,
  markSubmission,
  recomputeHeat,
} from "./store";
import { parseJson, type SqlDatabase } from "./sql";

export type PipelineOptions = {
  token?: string;
  fetcher?: typeof fetch;
  probe?: (url: string) => Promise<McpHandshake>;
  evidence?: { put(key: string, value: string): Promise<unknown> };
  now?: Date;
};

function fetcherOf(options: PipelineOptions): typeof fetch {
  return options.fetcher ?? fetch;
}

function failureEvidence(code: string, detail: string): ScanEvidence[] {
  return [{ code, severity: "info", subject: "scanner", detail }];
}

export async function runIngest(db: SqlDatabase, submissionId: string, options: PipelineOptions = {}): Promise<{ projectId: string | null; retry: boolean }> {
  const submission = await getSubmission(db, submissionId);
  if (!submission?.project_id) return { projectId: null, retry: false };
  if (submission.status === "completed" || submission.status === "duplicate") return { projectId: submission.project_id, retry: false };
  const repository = githubRepositoryFromUrl(submission.repo_url);
  if (!repository) {
    await markSubmission(db, submissionId, "retryable", "repo_url_invalid", options.now);
    return { projectId: submission.project_id, retry: true };
  }
  let snapshot: RepoSnapshot;
  try {
    snapshot = await loadGitHubRepository(repository, options.token, fetcherOf(options));
  } catch (error) {
    const code = error instanceof IngestError ? error.code : "github_fetch_failed";
    console.error(JSON.stringify({ path: "community-ingest", submissionId, code, error: String(error).slice(0, 300) }));
    await markSubmission(db, submissionId, "retryable", code, options.now);
    return { projectId: submission.project_id, retry: true };
  }
  const project = await getStoredProject(db, submission.project_id);
  if (!project) return { projectId: null, retry: false };
  const taxonomy = await listTaxonomy(db);
  const inferred = inferTaxonomy(
    [project.title, snapshot.description, snapshot.topics.join(" "), snapshot.readme.slice(0, 8000)].join("\n"),
    taxonomy.categories,
    taxonomy.types,
  );
  await applyRepositorySnapshot(db, project.id, snapshot, inferred, options.now);
  if (options.evidence && snapshot.readme) {
    try {
      await options.evidence.put(`community/${project.id}/readme.md`, snapshot.readme);
    } catch (error) {
      console.error(JSON.stringify({ path: "community-readme", projectId: project.id, error: String(error).slice(0, 200) }));
    }
  }
  await markSubmission(db, submissionId, "metadata_fetched", null, options.now);
  return { projectId: project.id, retry: false };
}

export async function runStaticScan(db: SqlDatabase, projectId: string, options: PipelineOptions = {}): Promise<{ dynamic: boolean }> {
  const project = await getStoredProject(db, projectId);
  if (!project || project.status === "taken_down") return { dynamic: false };
  const repository = githubRepositoryFromUrl(`https://github.com/${project.repoKey}`);
  if (!repository) {
    await appendScan(db, projectId, { staticStatus: "scan_failed", staticEvidence: failureEvidence("SCAN_FAILED", "仓库地址无法解析"), dynamicStatus: "skipped" }, options.now);
    return { dynamic: false };
  }
  let snapshot: RepoSnapshot;
  try {
    snapshot = await loadGitHubRepository(repository, options.token, fetcherOf(options));
  } catch (error) {
    const code = error instanceof IngestError ? error.code : "github_fetch_failed";
    await appendScan(db, projectId, { staticStatus: "scan_failed", staticEvidence: failureEvidence("SCAN_FAILED", code), dynamicStatus: "skipped" }, options.now);
    return { dynamic: false };
  }
  let result;
  try {
    result = scanProjectText({
      description: snapshot.description,
      readme: snapshot.readme,
      archived: snapshot.archived,
      pushedAt: snapshot.pushedAt,
      now: options.now?.toISOString(),
    });
  } catch (error) {
    console.error(JSON.stringify({ path: "community-static", projectId, error: String(error).slice(0, 200) }));
    await appendScan(db, projectId, { staticStatus: "scan_failed", staticEvidence: failureEvidence("SCAN_FAILED", "静态规则执行失败"), dynamicStatus: "skipped" }, options.now);
    return { dynamic: false };
  }
  const endpoints = discoverMcpEndpoints(`${snapshot.description}\n${snapshot.homepage ?? ""}\n${snapshot.readme}`);
  const stored = await getStoredProject(db, projectId);
  const dynamic = await dynamicProbeEnabled(db, stored?.primaryTypeSlug ?? null);
  await appendScan(
    db,
    projectId,
    {
      clues: {
        stars: snapshot.stars,
        forks: snapshot.forks,
        openIssues: snapshot.openIssues,
        license: snapshot.license,
        language: snapshot.language,
        topics: snapshot.topics,
        archived: snapshot.archived,
        pushedAt: snapshot.pushedAt,
        defaultBranch: snapshot.defaultBranch,
        homepage: snapshot.homepage,
        hasReadme: snapshot.readme.trim().length > 0,
        readmeChars: snapshot.readme.length,
        descriptionPresent: snapshot.description.trim().length > 0,
        mcpEndpoints: endpoints,
      },
      staticStatus: result.status,
      staticEvidence: result.evidence,
      dynamicStatus: dynamic ? "pending" : "skipped",
      dynamicEvidence: dynamic ? [] : failureEvidence("DYNAMIC_SKIPPED", "当前类型不做 MCP 动态检查"),
    },
    options.now,
  );
  return { dynamic };
}

export async function runDynamicProbe(db: SqlDatabase, projectId: string, options: PipelineOptions = {}): Promise<void> {
  const project = await getStoredProject(db, projectId);
  if (!project || project.status === "taken_down") return;
  const enabled = await dynamicProbeEnabled(db, project.primaryTypeSlug);
  if (!enabled) {
    await appendScan(db, projectId, { dynamicStatus: "skipped", dynamicEvidence: failureEvidence("DYNAMIC_SKIPPED", "当前类型不做 MCP 动态检查") }, options.now);
    return;
  }
  const scan = await latestScan(db, projectId);
  const clues = parseJson<Record<string, unknown>>(scan?.clues_json, {});
  const endpoints = Array.isArray(clues.mcpEndpoints) ? clues.mcpEndpoints.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  if (!endpoints.length) {
    const evidence: ScanEvidence[] = [{ code: "NO_PUBLIC_MCP_ENDPOINT", severity: "warn", subject: "mcp", detail: "未发现公开 HTTPS MCP 端点，未做协议握手" }];
    const scanId = await appendScan(db, projectId, { dynamicStatus: "warn", dynamicEvidence: evidence }, options.now);
    await insertMcpProbe(db, { projectId, scanId, status: "no_endpoint", protocolVersion: null, latencyMs: null, tools: [], error: null }, options.now);
    return;
  }
  const probe = options.probe ?? handshakeMcp;
  let handshake: McpHandshake | null = null;
  let endpoint = endpoints[0] ?? "";
  try {
    for (const candidate of endpoints) {
      endpoint = candidate;
      handshake = await probe(candidate);
      if (handshake.ok) break;
    }
  } catch (error) {
    console.error(JSON.stringify({ path: "community-dynamic", projectId, error: String(error).slice(0, 200) }));
    const scanId = await appendScan(db, projectId, { dynamicStatus: "scan_failed", dynamicEvidence: failureEvidence("SCAN_FAILED", "动态检查没有跑成") }, options.now);
    await insertMcpProbe(db, { projectId, scanId, status: "scan_failed", protocolVersion: null, latencyMs: null, tools: [], error: "scan_failed" }, options.now);
    return;
  }
  if (!handshake?.ok) {
    const detail = (handshake?.error ?? "handshake_failed").slice(0, 180);
    const scanId = await appendScan(
      db,
      projectId,
      { dynamicStatus: "scan_failed", dynamicEvidence: failureEvidence("HANDSHAKE_FAILED", `公开端点握手未完成：${detail}`) },
      options.now,
    );
    await insertMcpProbe(db, { projectId, scanId, status: "scan_failed", protocolVersion: null, latencyMs: handshake?.latencyMs ?? null, tools: [], error: detail }, options.now);
    return;
  }
  const tools = handshake.tools.slice(0, 80).map((tool) => ({
    name: tool.name.slice(0, 80),
    description: (tool.description ?? "").slice(0, 500),
  }));
  const toolScan = scanProjectText({
    description: tools.map((tool) => `${tool.name}\n${tool.description}`).join("\n"),
    readme: "",
    archived: false,
    pushedAt: null,
    now: options.now?.toISOString(),
  });
  const evidence = [
    { code: "HANDSHAKE_OK", severity: "info" as const, subject: endpoint, detail: `协议握手成功，工具 ${tools.length} 个` },
    ...toolScan.evidence,
  ];
  const scanId = await appendScan(db, projectId, { dynamicStatus: toolScan.status, dynamicEvidence: evidence }, options.now);
  await insertMcpProbe(
    db,
    { projectId, scanId, status: "ok", protocolVersion: handshake.protocolVersion, latencyMs: handshake.latencyMs, tools, error: null },
    options.now,
  );
}

export async function completeSubmission(db: SqlDatabase, submissionId: string | undefined, now?: Date): Promise<void> {
  if (!submissionId) return;
  const submission = await getSubmission(db, submissionId);
  if (!submission || submission.status === "duplicate" || submission.status === "completed") return;
  await markSubmission(db, submissionId, "completed", null, now);
}

export async function runMaintenance(db: SqlDatabase, now = new Date()): Promise<{ submissions: Array<{ id: string; status: string }>; projects: Array<{ id: string; static_status: string | null; dynamic_status: string | null }> }> {
  const staleBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const due = await listMaintenance(db, staleBefore, 20);
  const recentSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await recomputeHeat(db, recentSince);
  return due;
}
