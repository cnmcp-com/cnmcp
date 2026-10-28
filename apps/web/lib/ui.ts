import type { CategoryItem } from "./api";

/* ============================================================
   发现列表 URL：只保留关键词、领域和分页。
   类型、安全、排序不进入链接，也不再作为列表查询参数。
   ============================================================ */

export type ListParams = Record<string, string | undefined>;

const LIST_KEYS = ["q", "category", "cursor"] as const;

/**
 * 拼发现列表链接。
 * 切换领域时清掉 cursor；空值从 URL 删除。
 * current / patch 里的 type、security、sort 会被丢掉。
 */
export function buildListHref(path: string, current: ListParams, patch: ListParams = {}): string {
  const merged: ListParams = { ...current, ...patch };
  if ("category" in patch) merged.cursor = undefined;
  const next = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

/* ============================================================
   项目类型（二级分类）视觉编码：徽章 / tile / 字符
   ============================================================ */

export const TYPE_ORDER = ["skill", "agent", "tutorial", "software", "mcp"] as const;

export function typeBadgeClass(slug: string | null | undefined): string {
  switch (slug) {
    case "skill":
      return "b-skill";
    case "agent":
      return "b-agent";
    case "tutorial":
      return "b-tutorial";
    case "software":
      return "b-software";
    case "mcp":
      return "b-mcp";
    default:
      return "b-none";
  }
}

export function typeTileClass(slug: string | null | undefined): string {
  return slug && (TYPE_ORDER as readonly string[]).includes(slug) ? `t-${slug}` : "t-none";
}

const TILE_LETTER: Record<string, string> = {
  skill: "S",
  agent: "A",
  tutorial: "T",
  software: "软",
  mcp: "M",
};

export function typeTileLetter(slug: string | null | undefined, name?: string | null): string {
  if (slug && TILE_LETTER[slug]) return TILE_LETTER[slug];
  return name?.trim().slice(0, 1) || "?";
}

/* ============================================================
   安全五态 pill：只用于项目详情，不出现在发现列表卡片上。
   ============================================================ */

export type SecurityKey = "clear" | "warn" | "risk" | "pending" | "scan_failed";

export function securityKey(status: string | null | undefined): SecurityKey {
  if (status === "clear" || status === "warn" || status === "risk" || status === "scan_failed") return status;
  return "pending"; // 数据缺失按 pending 渲染
}

export function securityPillClass(status: string | null | undefined): string {
  return `s-${securityKey(status)}`;
}

export function securityPillText(status: string | null | undefined): string {
  switch (securityKey(status)) {
    case "clear":
      return "已验证";
    case "warn":
      return "有注意项";
    case "risk":
      return "有风险";
    case "scan_failed":
      return "未完成";
    default:
      return "检查中";
  }
}

/* ============================================================
   领域 chip 色点（phase2 §4 CMS hue 依赖）
   ============================================================ */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

let colorWarned = false;

/**
 * categories.color 适配：hex 字符串直接用；0–360 整数转 hsl。
 * 缺失 / 非法 → 返回 null，chip 色点不渲染（降级不报错）。
 */
export function categoryDotColor(category: Pick<CategoryItem, "slug"> & { color?: unknown }): string | null {
  const value = (category as { color?: unknown }).color;
  if (typeof value === "string" && HEX_RE.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 360) {
    return `hsl(${Math.round(value)}, 70%, 45%)`;
  }
  if (value != null && !colorWarned && typeof console !== "undefined") {
    colorWarned = true;
    console.warn(`[cnmcp] categories.color 格式无法识别，色点已降级隐藏（slug=${category.slug}）`);
  }
  return null;
}

/* ============================================================
   评论头像色板：按用户名 hash 从类型色板五色轮换（phase1 §3.7）
   ============================================================ */

export function avatarColorClass(login: string): string {
  let hash = 0;
  for (let i = 0; i < login.length; i += 1) hash = (hash * 31 + login.charCodeAt(i)) >>> 0;
  return `av-${hash % 5}`;
}

/* ============================================================
   通用格式化
   ============================================================ */

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}
