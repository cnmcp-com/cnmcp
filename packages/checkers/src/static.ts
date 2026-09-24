import type { PricingModel, ReliableConfig, Transport } from "@cnmcp/schema";

export type StaticCatalogTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type StaticCatalogInput = {
  id: string;
  transport: Transport;
  repoUrl: string | null;
  reliability?: "github" | "cn-official" | "hosted" | "unverified-source" | null;
  isOfficial: boolean;
  pricingModel: PricingModel;
  lastPublishedAt: string | null;
  tools: StaticCatalogTool[];
  reliableConfig: ReliableConfig | null;
  authParams?: Array<{ fieldName: string; required: boolean; isHeader: boolean; placeholder: string | null }>;
  install?: { env: string[]; headers: string[] };
  readme?: string | null;
};

export type StaticSignalCode =
  | "PROVENANCE_UNKNOWN"
  | "TOOLS_UNKNOWN"
  | "CONFIG_UNKNOWN"
  | "PRICING_UNKNOWN"
  | "FRESHNESS_UNKNOWN"
  | "STALE_SOURCE"
  | "DEPRECATED_SOURCE"
  | "CREDENTIAL_REQUIRED"
  | "PROMPT_INJECTION_PATTERN"
  | "DESTRUCTIVE_CAPABILITY"
  | "WRITE_CAPABILITY"
  | "EXTERNAL_NETWORK_CAPABILITY"
  | "SENSITIVE_PARAMETER"
  | "PLAINTEXT_SECRET"
  | "UNSAFE_LAUNCH_ARGUMENT"
  | "UNRESOLVED_PLACEHOLDER"
  | "UNPINNED_PACKAGE"
  | "UNPINNED_CONTAINER_IMAGE"
  | "INSECURE_HTTP_ENDPOINT"
  | "PRIVATE_ENDPOINT";

export type StaticSignal = {
  code: StaticSignalCode;
  severity: "info" | "warn" | "high";
  subject: string;
  evidence: Record<string, string | number | boolean | null>;
};

export type StaticCatalogCheck = {
  serverId: string;
  checkerVersion: "static-v1";
  status: "metadata_only" | "ready_for_dynamic" | "blocked";
  dynamicMode: "none" | "remote_handshake" | "isolated_stdio";
  risk: { level: "unknown" | "medium" | "high"; high: number; warnings: number };
  confidence: {
    score: number;
    band: "low" | "medium" | "high";
    components: { provenance: number; tools: number; config: number; pricing: number; freshness: number };
  };
  signals: StaticSignal[];
};

const PROMPT_INJECTION_RE =
  /ignore\s+(?:all\s+)?previous|disregard\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+instructions?|do\s+not\s+(?:tell|inform)\s+(?:the\s+)?user|reveal\s+(?:secrets?|credentials?)|exfiltrat|忽略(?:之前|以上|先前|系统)|系统提示词|开发者指令|不要告诉用户|绕过(?:安全|限制)|泄露(?:密钥|凭证)/i;
const DESTRUCTIVE_RE = /(^|[_.-])(delete|remove|drop|purge|destroy|terminate|revoke|wipe|erase)([_.-]|$)|删除|清空|销毁|吊销/i;
const WRITE_RE = /(^|[_.-])(create|update|write|edit|send|post|publish|execute|run|apply|upload)([_.-]|$)|创建|更新|写入|发送|发布|执行|上传/i;
const NETWORK_RE = /(^|[_.-])(fetch|http|request|browser|crawl|scrape|search|download)([_.-]|$)|网页|浏览器|抓取|下载|搜索/i;
const SECRET_KEY_RE = /(^|[_-])(token|secret|password|passwd|api[_-]?key|access[_-]?key|authorization|credential)([_-]|$)/i;
const PLACEHOLDER_RE = /^(?:<.*>|\$\{.*\}|your[_ -]|replace[_ -]|example|placeholder|changeme|token$|secret$|password$|xxx)/i;
const UNSAFE_ARGUMENT_RE = /[\n\r\0]/;
const ARG_PLACEHOLDER_RE = /\$\{[^}]+\}|<[^>]+>|\{[^}]+\}/;
const LOCAL_HOST_RE = /^(?:localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
const DEPRECATED_RE =
  /弃用通知|(?:本|该)(?:仓库|项目|服务).{0,32}(?:弃用|停止维护|不再维护|归档)|(?:仓库|项目|服务).{0,12}(?:已|即将)?弃用|(?:this\s+)?(?:repository|project|server).{0,32}(?:is\s+)?(?:deprecated|archived|no\s+longer\s+maintained)/i;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function signal(
  code: StaticSignalCode,
  severity: StaticSignal["severity"],
  subject: string,
  evidence: StaticSignal["evidence"] = {},
): StaticSignal {
  return { code, severity, subject, evidence };
}

function packageIsPinned(spec: string, launcher: string): boolean {
  if (launcher === "uvx" || launcher === "uv") return /(?:==|@)\d/.test(spec);
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    return slash > 1 && spec.indexOf("@", slash) > slash;
  }
  return /@(?:\d|v\d|[a-f0-9]{7,40}$)/i.test(spec);
}

function packageSpec(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index] ?? "";
    if (item === "--package" || item === "-p") return args[index + 1] ?? null;
    if (!item.startsWith("-")) return item;
  }
  return null;
}

function looksLikePlaintextSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 12 || PLACEHOLDER_RE.test(trimmed) || /\s/.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed) && /\d/.test(trimmed);
}

function inspectSecretRecord(value: unknown, subject: string, signals: StaticSignal[]): void {
  const record = asRecord(value);
  if (!record) return;
  for (const [key, raw] of Object.entries(record)) {
    if (!SECRET_KEY_RE.test(key) || typeof raw !== "string" || !looksLikePlaintextSecret(raw)) continue;
    signals.push(signal("PLAINTEXT_SECRET", "high", subject, { field: key, redacted: true }));
  }
}

function inspectUrl(raw: string, subject: string, signals: StaticSignal[]): void {
  try {
    const url = new URL(raw);
    if (url.protocol === "http:") signals.push(signal("INSECURE_HTTP_ENDPOINT", "warn", subject, { host: url.hostname }));
    if (LOCAL_HOST_RE.test(url.hostname)) signals.push(signal("PRIVATE_ENDPOINT", "high", subject, { host: url.hostname }));
    for (const key of url.searchParams.keys()) {
      if (SECRET_KEY_RE.test(key)) signals.push(signal("PLAINTEXT_SECRET", "high", subject, { field: `query.${key}`, redacted: true }));
    }
  } catch {
    signals.push(signal("CONFIG_UNKNOWN", "warn", subject, { reason: "invalid_url" }));
  }
}

function inspectConfig(config: ReliableConfig, signals: StaticSignal[]): void {
  const servers = config.config.mcpServers;
  for (const [key, raw] of Object.entries(servers)) {
    const entry = asRecord(raw);
    if (!entry) {
      signals.push(signal("CONFIG_UNKNOWN", "warn", key, { reason: "invalid_entry" }));
      continue;
    }
    if (typeof entry.url === "string") inspectUrl(entry.url, key, signals);
    inspectSecretRecord(entry.env, `${key}.env`, signals);
    inspectSecretRecord(entry.headers, `${key}.headers`, signals);

    const command = typeof entry.command === "string" ? entry.command.split(/[\\/]/).pop()?.toLowerCase() ?? "" : "";
    const args = Array.isArray(entry.args) ? entry.args.filter((item): item is string => typeof item === "string") : [];
    const unsafeIndex = args.findIndex((item) => item.length > 300 || UNSAFE_ARGUMENT_RE.test(item));
    if (unsafeIndex >= 0) signals.push(signal("UNSAFE_LAUNCH_ARGUMENT", "high", key, { argumentIndex: unsafeIndex }));
    const placeholderIndexes = args.flatMap((item, index) => (ARG_PLACEHOLDER_RE.test(item) ? [index] : []));
    if (placeholderIndexes.length) {
      signals.push(signal("UNRESOLVED_PLACEHOLDER", "warn", key, { argumentIndexes: placeholderIndexes.join(",") }));
    }

    if (["npx", "bunx", "uvx", "uv"].includes(command)) {
      const spec = packageSpec(args);
      if (spec && !packageIsPinned(spec, command)) {
        signals.push(signal("UNPINNED_PACKAGE", "warn", key, { launcher: command, package: spec }));
      }
    }
    if (["docker", "podman"].includes(command)) {
      const image = packageSpec(args);
      if (image && !image.includes("@sha256:") && !/:\w[\w.-]*$/.test(image)) {
        signals.push(signal("UNPINNED_CONTAINER_IMAGE", "warn", key, { launcher: command, image }));
      }
    }
  }
}

function inspectTools(tools: StaticCatalogTool[], signals: StaticSignal[]): void {
  for (const tool of tools) {
    const text = `${tool.name}\n${tool.description ?? ""}`;
    if (PROMPT_INJECTION_RE.test(text)) {
      signals.push(signal("PROMPT_INJECTION_PATTERN", "high", tool.name, { matched: true }));
    }
    if (DESTRUCTIVE_RE.test(text)) {
      signals.push(signal("DESTRUCTIVE_CAPABILITY", "warn", tool.name, { matched: true }));
    } else if (WRITE_RE.test(text)) {
      signals.push(signal("WRITE_CAPABILITY", "info", tool.name, { matched: true }));
    }
    if (NETWORK_RE.test(text)) signals.push(signal("EXTERNAL_NETWORK_CAPABILITY", "info", tool.name, { matched: true }));

    const schema = asRecord(tool.inputSchema);
    const properties = asRecord(schema?.properties);
    const sensitive = Object.keys(properties ?? {}).filter((name) => SECRET_KEY_RE.test(name));
    if (sensitive.length) {
      signals.push(signal("SENSITIVE_PARAMETER", "warn", tool.name, { fields: sensitive.join(",") }));
    }
  }
}

function confidenceBand(score: number): StaticCatalogCheck["confidence"]["band"] {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function checkCatalogServer(input: StaticCatalogInput, now = Date.now()): StaticCatalogCheck {
  const signals: StaticSignal[] = [];
  const provenance = input.isOfficial || input.reliability === "github" || input.reliability === "cn-official" || Boolean(input.repoUrl) ? 25 : 0;
  const tools = input.tools.length ? 25 : 0;
  const config = input.reliableConfig ? 25 : 0;
  const pricing = input.pricingModel !== "unknown" ? 10 : 0;
  let freshness = 0;

  if (!provenance) signals.push(signal("PROVENANCE_UNKNOWN", "warn", input.id));
  if (!tools) signals.push(signal("TOOLS_UNKNOWN", "warn", input.id));
  if (!config) signals.push(signal("CONFIG_UNKNOWN", "warn", input.id));
  if (!pricing) signals.push(signal("PRICING_UNKNOWN", "info", input.id));

  if (!input.lastPublishedAt || !Number.isFinite(Date.parse(input.lastPublishedAt))) {
    signals.push(signal("FRESHNESS_UNKNOWN", "warn", input.id));
  } else {
    const ageDays = Math.max(0, Math.round((now - Date.parse(input.lastPublishedAt)) / 86_400_000));
    freshness = ageDays <= 180 ? 15 : ageDays <= 365 ? 8 : 0;
    if (ageDays > 180) signals.push(signal("STALE_SOURCE", "warn", input.id, { ageDays }));
  }
  if (input.readme && DEPRECATED_RE.test(input.readme)) {
    signals.push(signal("DEPRECATED_SOURCE", "warn", input.id, { matched: true }));
  }

  const credentialFields = [
    ...(input.authParams ?? []).map((item) => item.fieldName),
    ...(input.install?.env ?? []),
    ...(input.install?.headers ?? []),
  ].filter((field) => SECRET_KEY_RE.test(field));
  if (credentialFields.length) {
    signals.push(signal("CREDENTIAL_REQUIRED", "info", input.id, { fields: [...new Set(credentialFields)].join(",") }));
  }

  inspectTools(input.tools, signals);
  if (input.reliableConfig) inspectConfig(input.reliableConfig, signals);

  const deduped = [...new Map(signals.map((item) => [`${item.code}:${item.subject}`, item])).values()];
  const high = deduped.filter((item) => item.severity === "high").length;
  const warnings = deduped.filter((item) => item.severity === "warn").length;
  const mediumRisk = deduped.some(
    (item) =>
      item.code === "DEPRECATED_SOURCE" ||
      item.code === "DESTRUCTIVE_CAPABILITY" ||
      item.code === "SENSITIVE_PARAMETER" ||
      item.code === "INSECURE_HTTP_ENDPOINT",
  );
  const confidenceScore = provenance + tools + config + pricing + freshness;
  const dynamicMode = !input.reliableConfig ? "none" : input.transport === "remote" ? "remote_handshake" : "isolated_stdio";

  return {
    serverId: input.id,
    checkerVersion: "static-v1",
    status: high ? "blocked" : dynamicMode === "none" ? "metadata_only" : "ready_for_dynamic",
    dynamicMode,
    risk: { level: high ? "high" : mediumRisk ? "medium" : "unknown", high, warnings },
    confidence: {
      score: confidenceScore,
      band: confidenceBand(confidenceScore),
      components: { provenance, tools, config, pricing, freshness },
    },
    signals: deduped,
  };
}

export type StaticCatalogSummary = {
  total: number;
  status: Record<StaticCatalogCheck["status"], number>;
  dynamicMode: Record<StaticCatalogCheck["dynamicMode"], number>;
  risk: Record<StaticCatalogCheck["risk"]["level"], number>;
  confidence: Record<StaticCatalogCheck["confidence"]["band"], number>;
  signals: Partial<Record<StaticSignalCode, number>>;
};

export function summarizeCatalogChecks(results: StaticCatalogCheck[]): StaticCatalogSummary {
  const summary: StaticCatalogSummary = {
    total: results.length,
    status: { metadata_only: 0, ready_for_dynamic: 0, blocked: 0 },
    dynamicMode: { none: 0, remote_handshake: 0, isolated_stdio: 0 },
    risk: { unknown: 0, medium: 0, high: 0 },
    confidence: { low: 0, medium: 0, high: 0 },
    signals: {},
  };
  for (const result of results) {
    summary.status[result.status] += 1;
    summary.dynamicMode[result.dynamicMode] += 1;
    summary.risk[result.risk.level] += 1;
    summary.confidence[result.confidence.band] += 1;
    for (const item of result.signals) summary.signals[item.code] = (summary.signals[item.code] ?? 0) + 1;
  }
  return summary;
}
