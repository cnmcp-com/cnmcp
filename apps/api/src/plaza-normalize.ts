import type { DeclaredTool, ReliableConfig, SourceInfo, ToolParameter } from "@cnmcp/schema";

const PLACEHOLDER_RE = /[<>{}]|xxx|your[-_ ]|path\/to|example\.com|placeholder|changeme|insert[-_ ]?here|YOUR[_\s]|PATH\/TO/i;
const ARG_PLACEHOLDER_RE = /\/path\/to|path\/to|\/xxx|xxx\/|absolute\/path|\/Users\/username|<path>|PATH\/TO|\\path\\to/i;
const TOOL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/;
const LAUNCHERS = new Set(["npx", "npm", "pnpm", "yarn", "uvx", "uv", "docker", "podman", "node", "bun", "bunx", "deno", "python", "python3", "pipx"]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
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

export function httpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parametersFromSchema(schema: unknown): ToolParameter[] {
  let value = schema;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  const record = asRecord(value);
  const properties = asRecord(record?.properties);
  if (!properties) return [];
  const required = new Set(
    Array.isArray(record?.required) ? record.required.filter((item): item is string => typeof item === "string") : [],
  );
  return Object.entries(properties).map(([name, spec]) => {
    const field = asRecord(spec);
    return {
      name,
      type: typeof field?.type === "string" ? field.type : null,
      description: typeof field?.description === "string" ? field.description : null,
      required: required.has(name),
    };
  });
}

function readmeToText(readme: string): string {
  return readme
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d|li|div|pre|tr|code)>/gi, "\n")
    .replace(/<code[^>]*>/gi, "`")
    .replace(/<[^>]+>/g, "");
}

function rememberTool(
  found: Map<string, { name: string; description: string; inputSchema: null }>,
  name: string,
  description: string,
): void {
  const clean = name.trim();
  if (!TOOL_NAME_RE.test(clean) || found.has(clean)) return;
  found.set(clean, {
    name: clean,
    description: description.replace(/\s+/g, " ").trim(),
    inputSchema: null,
  });
}

export function parseDeclaredToolsFromReadme(readme: string | null | undefined): Array<{ name: string; description: string; inputSchema: null }> {
  if (!readme?.trim()) return [];
  const text = readmeToText(readme);
  const found = new Map<string, { name: string; description: string; inputSchema: null }>();
  for (const match of text.matchAll(/工具\s*`+([^`]+)`+\s*([^\n]*)/g)) {
    rememberTool(found, match[1] ?? "", match[2] ?? "");
  }

  const lines = text.split("\n");
  let inTools = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^#{1,3}\s+.*(工具|Tools)\b/i.test(line)) {
      inTools = true;
      continue;
    }
    if (inTools && /^#{1,3}\s+/.test(line)) inTools = false;
    if (!inTools) continue;
    const numbered = line.match(/^\s*(?:\d+\.|[-*])\s*`+([^`]+)`+\s*[-–:：]?\s*(.*)$/);
    if (!numbered) continue;
    let description = (numbered[2] ?? "").trim();
    if (!description) {
      const next = (lines[index + 1] ?? "").trim();
      if (next.startsWith("-") || next.startsWith("–")) description = next.replace(/^[-–]\s*/, "");
    }
    rememberTool(found, numbered[1] ?? "", description);
  }
  return [...found.values()];
}

function commandIsConcrete(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || PLACEHOLDER_RE.test(trimmed) || /\s/.test(trimmed)) return false;
  const base = (trimmed.split(/[\\/]/).pop() ?? "").toLowerCase();
  if (LAUNCHERS.has(base)) return true;
  return trimmed.startsWith("/");
}

function looksLikeSecret(value: string): boolean {
  if (PLACEHOLDER_RE.test(value) || value.length < 20 || /\s/.test(value)) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function redactRecord(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  const out: JsonRecord = {};
  for (const [key, item] of Object.entries(record)) {
    out[key] = typeof item === "string" && looksLikeSecret(item) ? "YOUR_TOKEN_HERE" : item;
  }
  return out;
}

function containsPlaceholderPath(value: unknown): boolean {
  if (typeof value === "string") return ARG_PLACEHOLDER_RE.test(value);
  if (Array.isArray(value)) return value.some(containsPlaceholderPath);
  const record = asRecord(value);
  return record ? Object.values(record).some(containsPlaceholderPath) : false;
}

function entryIsConcrete(entry: JsonRecord): boolean {
  if (typeof entry.url === "string" && entry.url.trim()) return isLikelyMcpEndpoint(entry.url.trim());
  if (typeof entry.command !== "string" || !commandIsConcrete(entry.command)) return false;
  return !containsPlaceholderPath(entry.args) && !containsPlaceholderPath(entry.env);
}

function sanitizeServers(servers: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, raw] of Object.entries(servers)) {
    const entry = asRecord(raw);
    if (!entry) return {};
    const next = { ...entry };
    if ("env" in next) next.env = redactRecord(next.env);
    if ("headers" in next) next.headers = redactRecord(next.headers);
    out[key] = next;
  }
  return out;
}

function mcpServersFromJson(value: unknown): JsonRecord | null {
  const record = asRecord(value);
  const servers = asRecord(record?.mcpServers);
  if (!servers || !Object.keys(servers).length) return null;
  for (const raw of Object.values(servers)) {
    const entry = asRecord(raw);
    if (!entry || !entryIsConcrete(entry)) return null;
  }
  return sanitizeServers(servers);
}

function jsonBlocks(readme: string): unknown[] {
  const blocks: unknown[] = [];
  const sources = [readme, readmeToText(readme)];
  for (const source of sources) {
    for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
      const body = match[1]?.trim();
      if (!body?.includes("mcpServers")) continue;
      try {
        blocks.push(JSON.parse(body) as unknown);
      } catch {
        // 广场 README 里的示意 JSON 经常不是合法 JSON，跳过即可。
      }
    }
  }
  return blocks;
}

function configKey(serverKey: string | null | undefined): string {
  const key = serverKey?.trim() ?? "";
  if (/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(key)) return key;
  return "mcp";
}

export function extractReliableConfig(input: {
  readme?: string | null;
  remotes?: Array<{ url: string }>;
  serverKey?: string | null;
}): ReliableConfig | null {
  for (const block of jsonBlocks(input.readme ?? "")) {
    const servers = mcpServersFromJson(block);
    if (servers && Object.keys(servers).length) {
      return { source: "readme", config: { mcpServers: servers } };
    }
  }
  const url = (input.remotes ?? []).map((item) => item.url).find((item) => isLikelyMcpEndpoint(item));
  if (!url) return null;
  return {
    source: "remote",
    config: { mcpServers: { [configKey(input.serverKey)]: { url } } },
  };
}

export function declaredToolsFromSources(input: {
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown; parameters?: ToolParameter[] }>;
  readme?: string | null;
}): DeclaredTool[] {
  const structured = (input.tools ?? []).filter((tool) => tool.name);
  const base = structured.length ? structured : parseDeclaredToolsFromReadme(input.readme);
  return base.map((tool) => {
    const parameters = "parameters" in tool && tool.parameters?.length ? tool.parameters : parametersFromSchema(tool.inputSchema);
    return {
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? null,
      parameters,
    };
  });
}

export function emptySourceInfo(): SourceInfo {
  return {
    author: null,
    iconUrl: null,
    srcUrl: null,
    srcSite: null,
    plazaUrl: null,
    categories: [],
    plazaCategories: [],
  };
}
