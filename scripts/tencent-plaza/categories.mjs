import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, "../../data/tencent-plaza/category-map.json");

export const categoryMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));

const CN_OFFICIAL_RE =
  /腾讯|阿里|淘宝|钉钉|高德|百度|字节|火山|华为|鸿蒙|京东|滴滴|美团|网易|小米|快手|微博|飞书|哔哩|蚂蚁|支付宝|微信|混元|元宝|企查查|讯飞|金山|搜狗|携程|拼多多|科恩/;

const CN_OFFICIAL_SITES = new Set(["cnb", "woa", "lbs"]);

export function categoryById(id) {
  return categoryMap.cnmcpCategories.find((item) => item.id === id) ?? null;
}

export function isCnOfficial({ srcAuthor = "", title = "", plazaOfficial = false, srcSite = "" } = {}) {
  if (plazaOfficial) return true;
  if (srcSite && CN_OFFICIAL_SITES.has(srcSite)) return true;
  return CN_OFFICIAL_RE.test(`${srcAuthor} ${title}`);
}

export function reliabilityOf({ isHosted, repoUrl, srcAuthor, title, plazaOfficial, srcSite }) {
  if (isHosted) return { ok: false, reason: "hosted" };
  if (repoUrl) return { ok: true, reason: "github" };
  if (isCnOfficial({ srcAuthor, title, plazaOfficial, srcSite })) return { ok: true, reason: "cn-official" };
  return { ok: false, reason: "unverified-source" };
}

export function mapToCnmcpCategories(plazaCategories, { title = "", srcAuthor = "", mcpName = "", plazaOfficial = false } = {}) {
  const byId = new Map(categoryMap.cnmcpCategories.map((item) => [item.id, item]));
  const mapped = new Map();
  const plazaOnly = (plazaCategories ?? []).filter((item) => item.categoryId !== 100);

  for (const plaza of plazaOnly) {
    const rule = categoryMap.plazaMapping.find((item) => item.plazaId === plaza.categoryId);
    for (const id of rule?.cnmcpIds ?? []) {
      const cat = byId.get(id);
      if (cat) mapped.set(cat.id, { id: cat.id, name: cat.name });
    }
  }

  const blob = `${title} ${srcAuthor} ${mcpName}`;
  const leftover = !plazaOnly.length;
  const hadTencentProduct = plazaOfficial || (plazaCategories ?? []).some((item) => item.categoryId === 100);
  if (hadTencentProduct || leftover) {
    for (const rule of categoryMap.tencentProductRules) {
      if (rule.pattern === "." && mapped.size > 0) continue;
      if (new RegExp(rule.pattern, "i").test(blob)) {
        const cat = byId.get(rule.cnmcpId);
        if (cat) mapped.set(cat.id, { id: cat.id, name: cat.name });
        if (rule.pattern === ".") break;
      }
    }
  }

  if (mapped.size > 0) return [...mapped.values()];
  const fallback = byId.get("other");
  return fallback ? [{ id: fallback.id, name: fallback.name }] : [];
}
