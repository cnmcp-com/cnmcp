import type { ProjectCard, ScanEvidence } from "@cnmcp/schema";

export type SecurityTone = "ok" | "warn" | "bad" | "muted";

export type SecurityAxis = {
  label: string;
  note: string;
  tone: SecurityTone;
};

const AXIS_COPY: Record<string, SecurityAxis> = {
  clear: { label: "未发现明显风险", note: "线索收集和静态扫描没有发现高风险信号。", tone: "ok" },
  warn: { label: "需要留意", note: "有需要留意的信号。项目仍保持上架。", tone: "warn" },
  risk: { label: "存在风险线索", note: "发现风险线索。默认仍上架，由读者自行判断。", tone: "bad" },
  pending: { label: "检查未完成", note: "还在检查。这不是风险结论。", tone: "muted" },
  scan_failed: { label: "检查未完成", note: "这次没有跑成。这不是风险结论。", tone: "muted" },
  skipped: { label: "未做静态检查", note: "静态扫描没有运行。这不是风险结论。", tone: "muted" },
};

const PROGRAMMING_LANGUAGES = new Set([
  "python", "typescript", "javascript", "rust", "go", "golang", "java", "kotlin", "swift",
  "ruby", "php", "c", "c++", "cpp", "c#", "csharp", "scala", "haskell", "elixir", "erlang",
  "dart", "lua", "r", "matlab", "shell", "bash", "zsh", "powershell", "html", "css", "scss",
  "sass", "less", "solidity", "zig", "nim", "ocaml", "clojure", "perl", "groovy",
  "objective-c", "objectivec", "objc", "jupyter notebook", "sql", "tsx", "jsx", "julia",
  "fortran", "lisp", "scheme", "pascal", "delphi", "f#", "fsharp", "vb.net", "assembly",
]);

export function securityAxis(status: string | null | undefined): SecurityAxis {
  const key = status && status in AXIS_COPY ? status : "pending";
  return AXIS_COPY[key] ?? AXIS_COPY.pending!;
}

export function securityPanelTone(status: string | null | undefined): SecurityTone {
  return securityAxis(status).tone;
}

export function isProgrammingLanguageTag(value: string, language?: string | null): boolean {
  const key = value.trim().toLowerCase();
  if (!key) return false;
  if (PROGRAMMING_LANGUAGES.has(key)) return true;
  return Boolean(language && key === language.trim().toLowerCase());
}

function asTagList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return asTagList(JSON.parse(trimmed) as unknown);
    } catch {
      return [trimmed];
    }
  }
  return [];
}

export function severityLabel(severity: ScanEvidence["severity"] | string): string {
  if (severity === "high") return "高风险";
  if (severity === "warn") return "留意";
  return "信息";
}

/** 展示标题：一律用项目标题本身；推荐语只作为补充（产品基准：推荐语不覆盖仓库事实）。 */
export function displayTitle(project: Pick<ProjectCard, "title" | "recommendation">): string {
  return project.title;
}

export function headerSummary(project: Pick<ProjectCard, "title" | "summary" | "recommendation">): string | null {
  const summary = project.summary.trim();
  if (!summary) return null;
  if (summary === project.title) return null;
  return summary;
}

export function cardBlurb(project: Pick<ProjectCard, "title" | "summary" | "recommendation">): string {
  return headerSummary(project) ?? "还没有简介。";
}

export function detailTags(project: {
  type?: { name?: string | null } | null;
  tags?: unknown;
  tags_json?: unknown;
  language?: string | null;
}): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  const push = (value: string | null | undefined) => {
    const text = value?.trim();
    if (!text || isProgrammingLanguageTag(text, project.language)) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(text);
  };
  push(project.type?.name);
  const rawTags = project.tags ?? project.tags_json;
  for (const tag of asTagList(rawTags)) push(tag);
  return tags;
}

export function formatCompact(value: number): string {
  const n = Math.max(0, Math.floor(value));
  if (n < 1000) return n.toLocaleString("zh-CN");
  if (n < 10000) {
    const scaled = n / 1000;
    const digits = scaled >= 10 ? 0 : 1;
    return `${scaled.toFixed(digits).replace(/\.0$/, "")}k`;
  }
  const scaled = n / 10000;
  const digits = n >= 100000 ? 0 : 1;
  return `${scaled.toFixed(digits).replace(/\.0$/, "")} 万`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "未知";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "未知";
  const delta = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.max(1, Math.round(delta / minute))} 分钟前`;
  if (delta < day) return `${Math.max(1, Math.round(delta / hour))} 小时前`;
  if (delta < 30 * day) return `${Math.max(1, Math.round(delta / day))} 天前`;
  if (delta < 365 * day) return `${Math.max(1, Math.round(delta / (30 * day)))} 个月前`;
  return `${Math.max(1, Math.round(delta / (365 * day)))} 年前`;
}

export function clueString(clues: Record<string, unknown>, key: string): string | null {
  const value = clues[key];
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "NOASSERTION") return null;
  return text;
}

export function clueNumber(clues: Record<string, unknown>, key: string): number | null {
  const value = clues[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function clueBoolean(clues: Record<string, unknown>, key: string): boolean | null {
  const value = clues[key];
  return typeof value === "boolean" ? value : null;
}
