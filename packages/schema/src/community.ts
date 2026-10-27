export const SECURITY_STATUSES = ["pending", "clear", "warn", "risk", "scan_failed"] as const;
export type SecurityStatus = (typeof SECURITY_STATUSES)[number];

export const PROJECT_STATUSES = ["listed", "taken_down"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SUBMISSION_STATUSES = ["received", "duplicate", "metadata_fetched", "retryable", "completed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SECURITY_LABEL: Record<SecurityStatus, string> = {
  pending: "检查未完成",
  scan_failed: "检查未完成",
  clear: "未发现明显风险",
  warn: "需要留意",
  risk: "存在风险线索",
};

export const SECURITY_NOTE: Record<SecurityStatus, string> = {
  pending: "还在检查。这不是风险结论。",
  scan_failed: "这次没有跑成。这不是风险结论。",
  clear: "线索收集和静态扫描没有发现高风险信号。",
  warn: "有需要留意的信号。项目仍保持上架。",
  risk: "发现风险线索。默认仍上架，由读者自行判断。",
};

export type TaxonomyEntry = {
  slug: string;
  name: string;
  keywords: string[];
};

export type ScanEvidence = {
  code: string;
  severity: "info" | "warn" | "high";
  subject: string;
  detail: string;
};

export type CategoryRef = { slug: string; name: string } | null;

export type ProjectCard = {
  slug: string;
  title: string;
  repoKey: string;
  repoUrl: string;
  summary: string;
  recommendation: string | null;
  stars: number;
  language: string | null;
  category: CategoryRef;
  type: CategoryRef;
  securityStatus: SecurityStatus;
  likeCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  heatScore: number;
  createdAt: string;
};

export type ReviewItem = {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  author: { login: string; avatarUrl: string | null };
  projectSlug?: string;
  projectTitle?: string;
};

export type McpProbeView = {
  status: string;
  protocolVersion: string | null;
  latencyMs: number | null;
  tools: Array<{ name: string; description: string }>;
  error: string | null;
};

export type ProjectDetail = ProjectCard & {
  status: ProjectStatus;
  topics: string[];
  tags: string[];
  homepage: string | null;
  archived: boolean;
  pushedAt: string | null;
  secondaryCategories: Array<{ slug: string; name: string }>;
  submittedBy: string | null;
  security: {
    status: SecurityStatus;
    staticStatus: string;
    dynamicStatus: string;
    clues: Record<string, unknown>;
    evidence: ScanEvidence[];
    dynamicEvidence: ScanEvidence[];
    scannedAt: string | null;
  };
  mcp: McpProbeView | null;
  favoriteCount: number;
};

export type ProjectListResponse = {
  items: ProjectCard[];
  total: number;
  nextCursor: string | null;
};

const IGNORED_DYNAMIC = new Set(["skipped"]);

/** 列表和详情用的安全状态。pending / scan_failed 不会被当成 risk。 */
export function publicSecurityStatus(staticStatus: string | null | undefined, dynamicStatus: string | null | undefined): SecurityStatus {
  const statuses = [staticStatus, dynamicStatus].filter((status): status is string => typeof status === "string" && !IGNORED_DYNAMIC.has(status));
  if (statuses.length === 0) return "pending";
  if (statuses.includes("risk")) return "risk";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("scan_failed")) return "scan_failed";
  if (statuses.every((status) => status === "clear")) return "clear";
  return "pending";
}

export function inferTaxonomy(
  text: string,
  categories: TaxonomyEntry[],
  types: TaxonomyEntry[],
): { categorySlug: string | null; typeSlug: string | null } {
  const haystack = text.toLowerCase();
  const best = (entries: TaxonomyEntry[]) => {
    let winner: TaxonomyEntry | null = null;
    let winnerScore = 0;
    for (const entry of entries) {
      let score = 0;
      for (const keyword of entry.keywords) {
        const needle = keyword.toLowerCase().trim();
        if (!needle || !haystack.includes(needle)) continue;
        score += needle === "mcp" || needle === "model context protocol" || needle === "model-context-protocol" ? 3 : 1;
      }
      if (score > winnerScore) {
        winner = entry;
        winnerScore = score;
      }
    }
    return winner?.slug ?? null;
  };
  return { categorySlug: best(categories), typeSlug: best(types) };
}

export function projectSlugFromRepoKey(repoKey: string): string {
  const slug = repoKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "project";
}
