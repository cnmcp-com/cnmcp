import type { Metadata } from "next";
import Link from "next/link";

import { fetchDirectory } from "@/lib/api";
import { ServerCard } from "@/components/ui-blocks";
import { BUSINESS_CATEGORIES } from "@/lib/ui";

type Search = { q?: string; business?: string; reachable?: string; transport?: string; official?: string; verification?: string; sort?: string; cursor?: string };

function hrefWith(params: Search, patch: Partial<Search>): string {
  const next = new URLSearchParams();
  const merged = { ...params, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value);
  }
  next.delete("cursor");
  const encoded = next.toString();
  return encoded ? `/servers?${encoded}` : "/servers";
}

function toggle(params: Search, key: keyof Search, value: string): string {
  const current = params[key];
  return hrefWith(params, { [key]: current === value ? "" : value });
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const params = await searchParams;
  const filtered = Boolean(params.q || params.business || params.reachable || params.transport || params.official || params.verification || params.sort);
  return {
    title: "MCP 服务目录",
    description: "浏览中文 MCP 服务目录，按软件开发、数据分析、研究检索和内容创作等场景筛选，查看工具能力、来源与验证证据。",
    alternates: { canonical: "/servers" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (!query.has("limit")) query.set("limit", "30");
  if (!query.has("sort")) query.set("sort", "static");

  let items: Awaited<ReturnType<typeof fetchDirectory>>["items"] = [];
  let total = 0;
  let nextCursor: string | null = null;
  let error: string | null = null;
  try {
    const directory = await fetchDirectory(query.toString());
    items = directory.items;
    total = directory.total;
    nextCursor = directory.nextCursor;
  } catch {
    error = "API 暂不可用。先启动 apps/api 的 wrangler dev。";
  }

  const nextHref = nextCursor ? `${hrefWith(params, {})}${hrefWith(params, {}).includes("?") ? "&" : "?"}cursor=${nextCursor}` : null;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MCP 服务目录",
    numberOfItems: total,
    itemListElement: items.map((server, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: server.title,
      url: `${site}/servers/${encodeURIComponent(server.id)}`,
    })),
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <div className="page-hd">
        <h1>MCP 服务目录</h1>
        <p>{total ? `${total} 个服务已进入验证流程。` : "收录与实测数据来自验证引擎。"}按你的业务需要筛选，再用公开证据判断是否适合接入。</p>
      </div>
      {error ? <p className="empty">{error}</p> : null}
      <div className="dir">
        <aside className="filters">
          <form className="fgroup" style={{ borderBottom: 0, paddingBottom: 16 }} action="/servers" method="get">
            {params.business ? <input type="hidden" name="business" value={params.business} /> : null}
            {params.reachable ? <input type="hidden" name="reachable" value={params.reachable} /> : null}
            {params.transport ? <input type="hidden" name="transport" value={params.transport} /> : null}
            {params.official ? <input type="hidden" name="official" value={params.official} /> : null}
            {params.verification ? <input type="hidden" name="verification" value={params.verification} /> : null}
            {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
            <input className="dir-search" name="q" defaultValue={params.q ?? ""} placeholder="搜索名称、工具或用途" type="search" />
          </form>
          <div className="fgroup">
            <h4>业务场景</h4>
            <div className="business-filter">
              <Link className={!params.business ? "on" : undefined} href={hrefWith(params, { business: "" })}>
                <span>全部场景</span>
                <small>浏览所有服务</small>
              </Link>
              {BUSINESS_CATEGORIES.map((category) => (
                <Link key={category.id} className={params.business === category.id ? "on" : undefined} href={hrefWith(params, { business: category.id })}>
                  <span>{category.label}</span>
                  <small>{category.description}</small>
                </Link>
              ))}
            </div>
          </div>
          <div className="fgroup">
            <h4>运行方式</h4>
            <Link className={`fopt${params.transport === "remote" ? " on" : ""}`} href={toggle(params, "transport", "remote")}>
              <span className="boxi" />
              远程服务
            </Link>
            <Link className={`fopt${params.transport === "local" ? " on" : ""}`} href={toggle(params, "transport", "local")}>
              <span className="boxi" />
              本地运行
            </Link>
          </div>
          <div className="fgroup">
            <h4>关键条件</h4>
            <Link className={`sw${params.reachable === "yes" ? " on" : ""}`} href={toggle(params, "reachable", "yes")}>
              <span>仅看本站探测可达</span>
              <span className="tg" />
            </Link>
            <Link className={`sw${params.official === "yes" ? " on" : ""}`} href={toggle(params, "official", "yes")}>
              <span>仅看可信方发布</span>
              <span className="tg" />
            </Link>
          </div>
          <div className="fgroup" style={{ borderBottom: 0 }}>
            <Link className="btn btn-s btn-sm" href="/servers" style={{ width: "100%", justifyContent: "center" }}>
              重置筛选
            </Link>
          </div>
        </aside>
        <div>
          <div className="toolbar">
            <span className="cnt">
              <b>{items.length}</b> 个本页结果 · 共 {total} 个目录条目
            </span>
            <div className="r dir-state-tabs" aria-label="验证状态筛选">
              {[
                ["", "全部"],
                ["static", "证据已检查"],
                ["dynamic", "已动态实测"],
                ["incomplete", "待动态实测"],
              ].map(([value, label]) => (
                <Link key={value || "all"} className={`chip${(params.verification ?? "") === value ? " on" : ""}`} href={hrefWith(params, { verification: value })}>{label}</Link>
              ))}
            </div>
          </div>
          <div className="sortbar">
            <span>排序</span>
            {[
              ["static", "证据完整度"],
              ["dynamic", "动态实测结果"],
              ["recent", "最近验证"],
              ["official", "可信方优先"],
            ].map(([value, label]) => (
              <Link key={value} className={(params.sort ?? "static") === value ? "on" : undefined} href={hrefWith(params, { sort: value })}>{label}</Link>
            ))}
          </div>
          {items.length === 0 && !error ? (
            <div className="empty">
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--tx)", marginBottom: 6 }}>没有匹配的 server</div>
              <div style={{ marginBottom: 16 }}>换个条件，或者把它的端点提交给我们验证。</div>
              <Link className="btn btn-s btn-sm" href="/submit">
                提交 server 验证
              </Link>
            </div>
          ) : (
            <div className="sc-grid">
              {items.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
          {nextHref ? (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <Link className="btn btn-s" href={nextHref}>
                下一页
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
