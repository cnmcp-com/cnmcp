import type { CheckerStatus, Grade, ServerStatus, Transport, V1Checker } from "@cnmcp/schema";

export const GRADE_TEXT: Record<Grade, string> = {
  A: "动态验证良好",
  B: "动态验证通过",
  C: "需谨慎",
  D: "动态验证较差",
};

export const BUSINESS_CATEGORIES = [
  { id: "development", label: "软件开发", description: "代码、版本控制与工程交付" },
  { id: "data", label: "数据分析", description: "数据库、查询与商业分析" },
  { id: "research", label: "研究检索", description: "搜索、知识库与文档处理" },
  { id: "content", label: "内容创作", description: "写作、设计、图像与视频" },
  { id: "operations", label: "市场运营", description: "营销、销售、SEO 与客户管理" },
  { id: "productivity", label: "办公协作", description: "邮件、日历、项目与团队协作" },
  { id: "automation", label: "自动化", description: "工作流、浏览器与智能体执行" },
  { id: "security", label: "安全合规", description: "扫描、审计与风险识别" },
] as const;

export const GRADE_PILL: Record<Grade, string> = {
  A: "p-ok",
  B: "p-info",
  C: "p-warn",
  D: "p-bad",
};

export const GRADE_COLOR: Record<Grade, string> = {
  A: "var(--ok)",
  B: "var(--info)",
  C: "var(--warn)",
  D: "var(--bad)",
};

export const CHECKER_LABELS: Record<V1Checker, string> = {
  alive: "存活探测",
  contract: "工具契约实测",
  probe: "本站探测可达",
  freshness: "维护活跃度",
};

export const STATUS_UI: Record<CheckerStatus, { text: string; dot: string; pill: string }> = {
  pass: { text: "通过", dot: "d-ok", pill: "p-ok" },
  warn: { text: "提示", dot: "d-warn", pill: "p-warn" },
  fail: { text: "未通过", dot: "d-bad", pill: "p-bad" },
  skip: { text: "不适用", dot: "d-na", pill: "p-gray" },
};

export const CHANGE_TYPE: Record<string, string> = {
  tool_added: "新增工具",
  tool_removed: "移除工具",
  description_changed: "描述变更",
  schema_changed: "Schema 变更",
  repository_updated: "代码仓库更新",
  repository_archived: "代码仓库已归档",
  repository_restored: "代码仓库恢复维护",
  default_branch_changed: "默认分支变更",
};

export function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "尚未验证";
  return iso.replace("T", " ").slice(0, 16);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export function reachLabel(transport: Transport, reachable: boolean | null): { text: string; pill: string } {
  if (transport === "local") return { text: "本地运行", pill: "p-gray" };
  if (reachable === true) return { text: "本站探测可达", pill: "p-ok" };
  if (reachable === false) return { text: "本站探测不可达", pill: "p-bad" };
  return { text: "未探测", pill: "p-gray" };
}

export function transportLabel(transport: Transport): string {
  if (transport === "local") return "本地运行";
  if (transport === "remote") return "远程服务";
  return "运行方式未知";
}

export function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function sparkline(values: Array<number | null>): string {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return "—";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const blocks = "▁▂▃▄▅▆▇█";
  return values
    .map((value) => {
      if (value === null) return "·";
      const idx = max === min ? 4 : Math.min(7, Math.round(((value - min) / (max - min)) * 7));
      return blocks[idx] ?? "·";
    })
    .join("");
}

export function statusHint(status: ServerStatus, score: number | null): string | null {
  if (score !== null) return null;
  if (status === "dead") return "动态验证未通过；页面主分数仅代表公开证据完整度。";
  if (status === "local_untested") return "本地 stdio 尚未完成动态握手；证据完整度不代表运行安全。";
  return "动态验证尚未完成；证据完整度仅用于衡量来源与配置信息是否充分。";
}
