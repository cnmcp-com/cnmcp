import type { ScanEvidence } from "@cnmcp/schema";

export type ProjectScanInput = {
  description: string;
  readme: string;
  archived: boolean;
  pushedAt: string | null;
  now?: string;
};

export type ProjectScanResult = {
  status: "clear" | "warn" | "risk";
  evidence: ScanEvidence[];
};

const PROMPT_INJECTION_RE =
  /ignore\s+(?:all\s+)?previous|disregard\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+instructions?|do\s+not\s+(?:tell|inform)\s+(?:the\s+)?user|reveal\s+(?:secrets?|credentials?)|exfiltrat|忽略(?:之前|以上|先前|系统)|系统提示词|开发者指令|不要告诉用户|绕过(?:安全|限制)|泄露(?:密钥|凭证)/i;

const DEPRECATED_RE =
  /弃用通知|(?:本|该)(?:仓库|项目|服务).{0,32}(?:弃用|停止维护|不再维护|归档)|(?:仓库|项目|服务).{0,12}(?:已|即将)?弃用|(?:this\s+)?(?:repository|project|server).{0,40}(?:is\s+)?(?:deprecated|archived|no\s+longer\s+maintained)/i;

const SECRET_ASSIGNMENT_RE =
  /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|authorization|credential)\s*[:=]\s*['"]?([A-Za-z0-9_\-./+=]{12,})/gi;

const TOKEN_PREFIX_RE = /\b(?:ghp_|gho_|github_pat_|sk-|sk-proj-|xox[bap]-|AKIA)[A-Za-z0-9_\-]{8,}/g;

const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const PLACEHOLDER_RE = /^(?:<.*>|\$\{.*\}|your[_-]|replace[_-]|example|placeholder|changeme|xxx+|token|secret|password)$/i;

const LOCAL_URL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i;

const STALE_MS = 1000 * 60 * 60 * 24 * 540;

function evidence(code: string, severity: ScanEvidence["severity"], subject: string, detail: string): ScanEvidence {
  return { code, severity, subject, detail };
}

function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER_RE.test(value.trim()) || value.includes("...");
}

export function scanProjectText(input: ProjectScanInput): ProjectScanResult {
  const text = `${input.description}\n${input.readme}`;
  const found: ScanEvidence[] = [];

  if (PROMPT_INJECTION_RE.test(text)) {
    found.push(evidence("PROMPT_INJECTION_PATTERN", "high", "readme", "文本里出现提示注入或绕过限制的句式"));
  }
  if (PRIVATE_KEY_RE.test(text)) {
    found.push(evidence("PRIVATE_KEY", "high", "readme", "文本里出现私钥块，值未保存"));
  }

  const prefixed = text.match(TOKEN_PREFIX_RE) ?? [];
  if (prefixed.length) {
    found.push(evidence("TOKEN_PREFIX", "high", "readme", `发现 ${prefixed.length} 处常见令牌前缀，值未保存`));
  }

  SECRET_ASSIGNMENT_RE.lastIndex = 0;
  const assignments = new Set<string>();
  for (const match of text.matchAll(SECRET_ASSIGNMENT_RE)) {
    const value = match[1] ?? "";
    if (!value || looksLikePlaceholder(value)) continue;
    assignments.add(match[0].split(/[:=]/)[0]?.trim().toLowerCase() || "secret");
  }
  if (assignments.size) {
    found.push(evidence("PLAINTEXT_SECRET", "high", "readme", `发现疑似明文密钥字段：${[...assignments].slice(0, 6).join(", ")}。值未保存`));
  }

  if (input.archived) found.push(evidence("ARCHIVED", "warn", "repository", "GitHub 仓库已归档"));
  if (DEPRECATED_RE.test(text)) found.push(evidence("DEPRECATED", "warn", "readme", "仓库文本声明已弃用或停止维护"));

  const pushed = input.pushedAt ? Date.parse(input.pushedAt) : Number.NaN;
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (Number.isFinite(pushed) && Number.isFinite(now) && now - pushed > STALE_MS) {
    found.push(evidence("STALE_REPOSITORY", "warn", "repository", "默认分支超过约 18 个月没有推送"));
  }

  if (!input.description.trim() && input.readme.trim().length < 40) {
    found.push(evidence("THIN_METADATA", "warn", "repository", "缺少简介，README 也过短"));
  } else if (!input.description.trim()) {
    found.push(evidence("DESCRIPTION_MISSING", "info", "repository", "仓库没有简介"));
  }

  const status = found.some((item) => item.severity === "high") ? "risk" : found.some((item) => item.severity === "warn") ? "warn" : "clear";
  return { status, evidence: found.slice(0, 40) };
}

export function discoverMcpEndpoints(text: string): string[] {
  const found = new Set<string>();
  const matches = text.match(/https:\/\/[^\s<>"'`)]+/g) ?? [];
  for (const raw of matches) {
    const candidate = raw.replace(/[.,;]+$/, "");
    if (LOCAL_URL_RE.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      const path = url.pathname.toLowerCase();
      const host = url.hostname.toLowerCase();
      if (!(path.includes("/mcp") || path.endsWith("/sse") || path.includes("/sse/") || host.startsWith("mcp."))) continue;
      url.hash = "";
      found.add(url.toString());
    } catch {
      continue;
    }
    if (found.size >= 3) break;
  }
  return [...found];
}
