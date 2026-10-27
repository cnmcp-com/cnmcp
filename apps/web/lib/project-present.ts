import type { ProjectCard, ProjectDetail, ScanEvidence, SecurityStatus } from "@cnmcp/schema";

export type SecurityTone = "ok" | "warn" | "bad" | "muted";

export type SecurityAxis = {
  label: string;
  note: string;
  tone: SecurityTone;
};

const AXIS_COPY: Record<string, SecurityAxis> = {
  clear: { label: "未发现明显风险", note: "这一侧没有发现高风险信号。", tone: "ok" },
  warn: { label: "需要留意", note: "有需要留意的信号。项目仍保持上架。", tone: "warn" },
  risk: { label: "存在风险线索", note: "发现风险线索。默认仍上架，由读者自行判断。", tone: "bad" },
  pending: { label: "检查未完成", note: "还在检查。这不是风险结论。", tone: "muted" },
  scan_failed: { label: "检查未完成", note: "这次没有跑成。这不是风险结论。", tone: "muted" },
  skipped: { label: "未做这项检查", note: "这一侧没有运行。这不是风险结论。", tone: "muted" },
};

export function securityAxis(status: string | null | undefined, kind: "static" | "dynamic"): SecurityAxis {
  const key = status && status in AXIS_COPY ? status : "pending";
  const axis = AXIS_COPY[key] ?? AXIS_COPY.pending!;
  if (key === "skipped" && kind === "dynamic") {
    return { label: "未做动态检查", note: "当前类型不做 MCP 动态检查。这不是风险结论。", tone: "muted" };
  }
  if (key === "skipped" && kind === "static") {
    return { label: "未做静态检查", note: "静态扫描没有运行。这不是风险结论。", tone: "muted" };
  }
  if (key === "clear" && kind === "static") {
    return { label: "未发现明显风险", note: "线索收集和静态扫描没有发现高风险信号。", tone: "ok" };
  }
  if (key === "clear" && kind === "dynamic") {
    return { label: "未发现明显风险", note: "动态检查没有发现高风险信号。", tone: "ok" };
  }
  return axis;
}

/** 整页底色只在两侧都给出明确结论时用语义色。动态跳过时不把整页涂成安全。 */
export function securityPanelTone(status: SecurityStatus, dynamicStatus: string): SecurityTone {
  if (status === "risk") return "bad";
  if (status === "warn") return "warn";
  if (status === "clear" && dynamicStatus === "clear") return "ok";
  return "muted";
}

export function evidenceCount(evidence: ScanEvidence[], dynamicEvidence: ScanEvidence[]): number {
  return evidence.length + dynamicEvidence.length;
}

export function severityLabel(severity: ScanEvidence["severity"] | string): string {
  if (severity === "high") return "高风险";
  if (severity === "warn") return "留意";
  return "信息";
}

export function displayTitle(project: Pick<ProjectCard, "title" | "recommendation">): string {
  const recommendation = project.recommendation?.trim();
  return recommendation || project.title;
}

export function headerSummary(project: Pick<ProjectCard, "title" | "summary" | "recommendation">): string | null {
  const summary = project.summary.trim();
  if (!summary) return null;
  if (summary === displayTitle(project) || summary === project.title) return null;
  return summary;
}

export function cardBlurb(project: Pick<ProjectCard, "title" | "summary" | "recommendation">): string {
  return headerSummary(project) ?? "还没有简介。";
}

export function detailTags(project: Pick<ProjectDetail, "type" | "tags">): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  const push = (value: string | null | undefined) => {
    const text = value?.trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(text);
  };
  push(project.type?.name);
  for (const tag of project.tags) push(tag);
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
