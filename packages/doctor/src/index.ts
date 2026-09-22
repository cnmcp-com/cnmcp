import type { CatalogIndexEntry } from "@cnmcp/schema";

export type SecretHit = {
  type: string;
  masked: string;
  serverKey: string;
};

export type DoctorIssue = {
  level: "high" | "warn" | "info";
  text: string;
};

export type DoctorServerResult = {
  key: string;
  matched: CatalogIndexEntry | null;
  issues: DoctorIssue[];
  level: "high" | "warn" | "info" | "ok";
};

export type DoctorReport = {
  serverCount: number;
  high: number;
  warn: number;
  secretCount: number;
  secrets: SecretHit[];
  rows: DoctorServerResult[];
  parseError: string | null;
  redactedConfig: string | null;
};

const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Bearer 令牌", /Bearer\s+[A-Za-z0-9._\-+=\/]{16,}/g],
  ["sk- 前缀密钥", /sk-[A-Za-z0-9]{16,}/g],
  ["GitHub Token", /gh[pousr]_[A-Za-z0-9]{20,}/g],
  ["AWS Access Key", /AKIA[0-9A-Z]{16}/g],
  ["Slack Token", /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["内联凭证字段", /"(?:api_?key|token|secret|password|access_?token|authorization)"\s*:\s*"([^"]{16,})"/gi],
];

export function maskSecret(value: string): string {
  const trimmed = value.replace(/^Bearer\s+/i, "");
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}****`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function detectSecrets(serverKey: string, blob: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const [type, pattern] of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(blob))) {
      hits.push({ type, masked: maskSecret(match[1] ?? match[0] ?? ""), serverKey });
    }
  }
  return hits;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? url;
  }
}

export function parseMcpConfig(raw: string): { error: string | null; servers: Record<string, Record<string, unknown>> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid json";
    return { error: `JSON 解析失败：${message}`, servers: {} };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "JSON 解析失败：根节点必须是对象", servers: {} };
  }
  const root = parsed as Record<string, unknown>;
  const map = (root.mcpServers ?? root.servers ?? root) as unknown;
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { error: "没有解析到任何 server 条目。", servers: {} };
  }
  const servers: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      servers[key] = value as Record<string, unknown>;
    }
  }
  return { error: Object.keys(servers).length ? null : "没有解析到任何 server 条目。", servers };
}

export function matchCatalog(key: string, cfg: Record<string, unknown>, catalog: ReadonlyArray<CatalogIndexEntry>): CatalogIndexEntry | null {
  const url = typeof cfg.url === "string" ? cfg.url : "";
  const command = typeof cfg.command === "string" ? cfg.command : "";
  const args = Array.isArray(cfg.args) ? cfg.args.map(String).join(" ") : "";
  const blob = `${url} ${command} ${args} ${key}`.toLowerCase();
  const host = url.startsWith("http") ? hostOf(url) : "";
  return (
    catalog.find((entry) => host && entry.endpointHost && host === entry.endpointHost.toLowerCase()) ??
    catalog.find((entry) => blob.includes(entry.id.toLowerCase()) && entry.id.length > 3) ??
    catalog.find((entry) => blob.includes(entry.namespace.toLowerCase()) && entry.namespace.length > 3) ??
    null
  );
}

function redactConfig(raw: string): string {
  return raw
    .replace(/"(Bearer\s+)[A-Za-z0-9._\-+=\/]{16,}"/gi, '"Bearer ${env:MCP_TOKEN}"')
    .replace(/"(sk-[A-Za-z0-9]{16,})"/g, '"${env:MCP_TOKEN}"')
    .replace(/"(gh[pousr]_[A-Za-z0-9]{20,})"/g, '"${env:MCP_TOKEN}"')
    .replace(/("(?:api_?key|token|secret|password|access_?token|authorization)"\s*:\s*)"[^"]{16,}"/gi, '$1"${env:MCP_TOKEN}"');
}

export function runDoctor(raw: string, catalog: ReadonlyArray<CatalogIndexEntry>): DoctorReport {
  const parsed = parseMcpConfig(raw);
  if (parsed.error) {
    return {
      serverCount: 0,
      high: 0,
      warn: 0,
      secretCount: 0,
      secrets: [],
      rows: [],
      parseError: parsed.error,
      redactedConfig: null,
    };
  }

  const secrets: SecretHit[] = [];
  const rows: DoctorServerResult[] = [];

  for (const [key, cfg] of Object.entries(parsed.servers)) {
    const blob = JSON.stringify(cfg);
    const foundSecrets = detectSecrets(key, blob);
    secrets.push(...foundSecrets);
    const matched = matchCatalog(key, cfg, catalog);
    const issues: DoctorIssue[] = foundSecrets.map((hit) => ({
      level: "high",
      text: `配置中含明文 ${hit.type}：${hit.masked}`,
    }));

    if (!matched) {
      issues.push({ level: "info", text: "未收录：库中查不到这个 server，可提交给我们验证" });
    } else {
      if (matched.poisoned) {
        issues.push({ level: "high", text: "投毒命中：建议立即移除该 server" });
      }
      if (matched.transport === "remote" && matched.reachableProbe === false) {
        issues.push({ level: "warn", text: "本站探测不可达：从 CNMCP 探测节点无法完成握手" });
      }
      if (matched.auth === "none" && matched.transport === "remote") {
        issues.push({ level: "warn", text: "端点无认证：任何拿到地址的人都能调用它" });
      }
      if (matched.versionCount <= 1) {
        issues.push({ level: "info", text: `仅发布过 ${matched.versionCount} 个版本，缺乏维护历史` });
      }
      if (matched.pricingModel === "byok" || matched.pricingModel === "metered" || matched.pricingModel === "subscription") {
        issues.push({
          level: "info",
          text: `可能产生第三方费用，计费方：${matched.billingParty ?? "未知"}`,
        });
      }
    }

    const level = issues.some((issue) => issue.level === "high")
      ? "high"
      : issues.some((issue) => issue.level === "warn")
        ? "warn"
        : issues.length
          ? "info"
          : "ok";
    rows.push({ key, matched, issues, level });
  }

  rows.sort((left, right) => {
    const order = { high: 0, warn: 1, info: 2, ok: 3 };
    return order[left.level] - order[right.level];
  });

  return {
    serverCount: Object.keys(parsed.servers).length,
    high: rows.filter((row) => row.level === "high").length,
    warn: rows.filter((row) => row.level === "warn").length,
    secretCount: secrets.length,
    secrets,
    rows,
    parseError: null,
    redactedConfig: redactConfig(raw),
  };
}

export const DEMO_CONFIG = `{
  "mcpServers": {
    "demo-maps": {
      "type": "http",
      "url": "https://mcp.example-maps.test/mcp",
      "headers": { "Authorization": "Bearer 8f2c1a9e4b7d6c3f0a1b2c3d4e5f6a7b" }
    },
    "unknown-local": {
      "command": "npx",
      "args": ["-y", "@internal/secret-mcp"]
    }
  }
}`;
