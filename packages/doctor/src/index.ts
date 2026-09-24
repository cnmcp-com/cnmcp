import type { CatalogIndexEntry } from "@cnmcp/schema";

export type SecretHit = {
  type: string;
  masked: string;
  serverKey: string;
};

export type DoctorIssue = {
  level: "high" | "warn" | "info";
  text: string;
  recommendation?: string;
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
  rulesApplied: number;
  secrets: SecretHit[];
  rows: DoctorServerResult[];
  parseError: string | null;
  redactedConfig: string | null;
};

export const ANALYSIS_RULES = [
  "明文凭证",
  "配置结构",
  "传输加密",
  "URL 凭证泄漏",
  "Shell 命令执行",
  "命令注入字符",
  "依赖版本固定",
  "宽泛运行权限",
  "TLS 校验关闭",
  "重复远程端点",
  "目录失效状态",
  "目录可达状态",
] as const;

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
  return [...new Map(hits.map((hit) => [`${hit.serverKey}:${hit.masked}`, hit])).values()];
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function packageIsPinned(value: string): boolean {
  if (!value || value.startsWith(".") || value.startsWith("/") || value.includes(":") || value.includes("/../")) return true;
  if (value.startsWith("@")) return value.lastIndexOf("@") > value.indexOf("/");
  return value.includes("@");
}

export function analyzeServerConfig(_key: string, cfg: Record<string, unknown>): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const url = typeof cfg.url === "string" ? cfg.url.trim() : "";
  const command = typeof cfg.command === "string" ? cfg.command.trim() : "";
  const args = stringArray(cfg.args);
  const env = recordOf(cfg.env);

  if (!url && !command) {
    issues.push({ level: "high", text: "配置缺少 url 或 command，客户端无法启动这个服务", recommendation: "补充远程 URL，或提供本地启动命令。" });
  }
  if (url && command) {
    issues.push({ level: "warn", text: "同时声明了 url 和 command，客户端行为可能不一致", recommendation: "只保留一种接入方式。" });
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:") {
        issues.push({ level: "high", text: "远程端点使用未加密 HTTP，配置和调用内容可能被窃听", recommendation: "改用 HTTPS 端点。" });
      }
      if (parsed.username || parsed.password) {
        issues.push({ level: "high", text: "URL 中包含用户名或密码", recommendation: "从 URL 移除凭证，改用环境变量或安全凭证存储。" });
      }
      const exposed = [...parsed.searchParams.keys()].some((name) => /key|token|secret|password|auth/i.test(name));
      if (exposed) {
        issues.push({ level: "high", text: "URL 查询参数疑似包含凭证", recommendation: "避免把凭证放进 URL；URL 可能进入历史记录和日志。" });
      }
    } catch {
      issues.push({ level: "high", text: "远程端点 URL 格式无效", recommendation: "填写完整的 http:// 或 https:// URL。" });
    }
  }

  const executable = command.split(/[\\/]/).pop()?.toLowerCase().replace(/\.exe$/, "") ?? "";
  const shellCommands = new Set(["sh", "bash", "zsh", "fish", "cmd", "powershell", "pwsh"]);
  if (shellCommands.has(executable)) {
    issues.push({ level: "warn", text: `通过 ${executable} Shell 启动，命令边界更难审计`, recommendation: "尽量直接执行明确的程序文件。" });
    if (args.some((arg) => /(^|\s)(?:&&|\|\||;|\||>|<|`|\$\()/u.test(arg))) {
      issues.push({ level: "high", text: "Shell 参数包含命令连接或重定向字符", recommendation: "拆分命令并移除动态拼接内容，确认不存在命令注入。" });
    }
  }

  if (executable === "npx" || executable === "uvx") {
    const packageName = args.find((arg) => !arg.startsWith("-"));
    if (packageName && !packageIsPinned(packageName)) {
      issues.push({ level: "warn", text: `${executable} 依赖 ${packageName} 未固定版本，后续执行内容可能变化`, recommendation: "固定到经过审核的精确版本。" });
    }
  }

  if (args.some((arg) => arg === "--allow-all" || arg === "-A" || arg.includes("dangerously-skip-permissions"))) {
    issues.push({ level: "high", text: "启动参数授予了宽泛系统权限", recommendation: "改为按目录、域名或能力授予最小权限。" });
  }

  const tlsDisabled = Object.entries(env).some(([name, value]) =>
    (name === "NODE_TLS_REJECT_UNAUTHORIZED" && String(value) === "0") ||
    (name === "PYTHONHTTPSVERIFY" && String(value) === "0"),
  );
  if (tlsDisabled) {
    issues.push({ level: "high", text: "环境变量关闭了 TLS 证书校验", recommendation: "恢复证书校验并修复证书链，不要绕过验证。" });
  }

  return issues;
}

export function runDoctor(raw: string, catalog: ReadonlyArray<CatalogIndexEntry>): DoctorReport {
  const parsed = parseMcpConfig(raw);
  if (parsed.error) {
    return {
      serverCount: 0,
      high: 0,
      warn: 0,
      secretCount: 0,
      rulesApplied: ANALYSIS_RULES.length,
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
      recommendation: "改用环境变量或系统凭证存储，并立即轮换已经暴露的密钥。",
    }));
    issues.push(...analyzeServerConfig(key, cfg));

    if (!matched) {
      issues.push({ level: "info", text: "未收录：库中查不到这个 server，可提交给我们验证" });
    } else {
      if (matched.poisoned) {
        issues.push({ level: "high", text: "工具描述命中投毒规则", recommendation: "暂停使用并审查工具描述与来源。" });
      }
      if (matched.status === "dead") {
        issues.push({ level: "high", text: "目录中的最近动态验证结果为失效", recommendation: "暂停接入，等待端点恢复或更换资源。" });
      }
      if (matched.transport === "remote" && matched.reachableProbe === false) {
        issues.push({ level: "warn", text: "本站探测不可达：从 CNMCP 探测节点无法完成握手", recommendation: "检查端点地址、网络限制和服务状态。" });
      }
      if (matched.auth === "none" && matched.transport === "remote") {
        issues.push({ level: "warn", text: "端点无认证：任何拿到地址的人都能调用它" });
      }
      if (matched.versionCount <= 1) {
        issues.push({ level: "info", text: `仅发布过 ${matched.versionCount} 个版本，缺乏维护历史` });
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

  const duplicateUrls = new Map<string, string[]>();
  for (const [key, cfg] of Object.entries(parsed.servers)) {
    if (typeof cfg.url !== "string" || !cfg.url.trim()) continue;
    const normalized = cfg.url.trim().replace(/\/$/, "");
    duplicateUrls.set(normalized, [...(duplicateUrls.get(normalized) ?? []), key]);
  }
  for (const keys of duplicateUrls.values()) {
    if (keys.length < 2) continue;
    for (const key of keys) {
      const row = rows.find((item) => item.key === key);
      if (!row) continue;
      row.issues.push({ level: "warn", text: `与 ${keys.filter((item) => item !== key).join("、")} 使用同一远程端点`, recommendation: "确认是否为重复配置，避免重复授权和调用。" });
      if (row.level === "ok" || row.level === "info") row.level = "warn";
    }
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
    rulesApplied: ANALYSIS_RULES.length,
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
