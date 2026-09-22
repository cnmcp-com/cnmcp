import type { CheckerStatus, Grade, PricingModel, ServerStatus, Transport, V1Checker } from "@cnmcp/schema";

export const GRADE_TEXT: Record<Grade, string> = {
  A: "可进生产",
  B: "建议接入",
  C: "谨慎使用",
  D: "不建议使用",
};

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

export const PRICING: Record<PricingModel, { label: string; pill: string }> = {
  free: { label: "免费", pill: "p-ok" },
  byok: { label: "自带密钥 · 按量", pill: "p-info" },
  freemium: { label: "免费额度 + 付费", pill: "p-info" },
  subscription: { label: "订阅付费", pill: "p-warn" },
  metered: { label: "按调用计费", pill: "p-warn" },
  unknown: { label: "定价未知", pill: "p-gray" },
};

export const PRICING_SOURCE: Record<string, string> = {
  official: "官方定价页",
  vendor: "作者声明",
  unverified: "未证实",
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
  pricing_changed: "定价变更",
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

export function isPaidModel(model: PricingModel): boolean {
  return model === "byok" || model === "metered" || model === "subscription" || model === "freemium";
}

export function statusHint(status: ServerStatus, score: number | null): string | null {
  if (score !== null) return null;
  if (status === "dead") return "该 server 当前验证失败，不显示虚构分数。";
  if (status === "local_untested") return "本地 stdio 包只做元数据收录，标注未实测，不给出分数。";
  return "尚不可验证或未完成实测，不给出分数。";
}
