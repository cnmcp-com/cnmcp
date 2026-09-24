import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HeroSearch } from "@/components/ui-blocks";
import { fetchDirectory, fetchStats } from "@/lib/api";
import { BUSINESS_CATEGORIES, formatNumber } from "@/lib/ui";

type Search = { q?: string; business?: string; reachable?: string; transport?: string; official?: string; cursor?: string };

const FILTER_KEYS = ["q", "business", "reachable", "transport", "official", "cursor"] as const;
const CATEGORY_ICONS: Record<(typeof BUSINESS_CATEGORIES)[number]["id"], string> = {
  development: "</>", data: "▦", research: "⌕", content: "✦", operations: "↗", productivity: "✓", automation: "⌁", security: "◇",
};

export const metadata: Metadata = {
  title: "中文 MCP 服务目录与验证平台 | CNMCP",
  description: "搜索和浏览中文 MCP 服务，查看工具能力、可信发布方、公开证据完整度与动态实测结果。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "中文 MCP 服务目录与验证平台 | CNMCP",
    description: "搜索中文 MCP 服务，查看工具能力、公开来源、接入配置与验证证据。",
    url: "/",
  },
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) next.set(key, value);
  }
  if ([...next.keys()].length) redirect(`/servers?${next.toString()}`);

  const [stats, featuredResult] = await Promise.all([
    fetchStats().catch(() => null),
    fetchDirectory("sort=static&limit=5").catch(() => ({ items: [] })),
  ]);
  const featured = featuredResult.items;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${site}/#organization`, name: "CNMCP", url: site, logo: `${site}/cnmcp-icon.svg` },
      {
        "@type": "WebSite", "@id": `${site}/#website`, name: "CNMCP", url: site,
        publisher: { "@id": `${site}/#organization` },
        description: "中文 MCP 服务目录与验证平台",
        inLanguage: "zh-CN",
        potentialAction: { "@type": "SearchAction", target: `${site}/servers?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
    ],
  };

  return (
    <div className="home">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <section className="home-hero">
        <div className="wrap home-hero-grid">
          <div className="home-hero-copy">
            <span className="eyebrow"><i />公开、可追溯、持续更新</span>
            <h1>发现并核验<span>值得接入的 MCP 服务。</span></h1>
            <p>从业务用途出发浏览中文 MCP 资源，通过公开来源、工具能力和验证证据，更快完成选型与接入判断。</p>
            <HeroSearch />
            <div className="popular-searches" aria-label="常用搜索">
              <span>常用：</span>
              {([
                ["GitHub", "GitHub"], ["数据库", "数据库"], ["浏览器自动化", "浏览器"], ["搜索", "搜索"], ["文档", "文档"],
              ] as const).map(([label, query]) => <Link key={label} href={`/servers?q=${encodeURIComponent(query)}`}>{label}</Link>)}
            </div>
            <div className="search-note">
              <span>只搜索目录，不读取或检测配置</span><span aria-hidden>·</span>
              <Link href="/doctor">需要检查 mcp.json？前往配置体检</Link>
            </div>
            <div className="hero-actions">
              <Link className="btn btn-p" href="/servers">按业务浏览目录 <span aria-hidden>→</span></Link>
              <Link className="btn btn-s" href="/doctor">检查我的配置</Link>
            </div>
          </div>
          <div className="resource-board" aria-label="公开证据较完整的 MCP 资源">
            <div className="resource-board-head"><span><i className="live-dot" /> 公开证据较完整</span><Link href="/servers?sort=static">查看全部</Link></div>
            <div className="resource-board-list">
              {featured.map((server) => (
                <Link key={server.id} href={`/servers/${encodeURIComponent(server.id)}`}>
                  <span><b>{server.title}</b><small>{server.sourceLabel ?? "来源已收录"} · {server.grade ? "已动态实测" : "待动态实测"}</small></span>
                  <span className={`resource-board-state ${server.isOfficial ? "official" : server.grade ? "measured" : "checked"}`}>
                    {server.isOfficial ? "可信方发布" : server.grade ? "已实测" : "证据已检查"}
                  </span>
                </Link>
              ))}
              {!featured.length ? <div className="resource-board-empty">资源证据正在加载，可先浏览完整目录。</div> : null}
            </div>
            <div className="resource-board-foot"><span>{formatNumber(stats?.official ?? 0)} 个可信方发布资源</span><span>动态实测作为辅助证据</span></div>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="目录数据概览">
        <div className="wrap proof-grid">
          <div><strong>{formatNumber(stats?.total ?? 0)}</strong><span>已收录 MCP 服务</span></div>
          <div><strong>{formatNumber(stats?.staticChecked ?? 0)}</strong><span>已完成公开证据检查</span></div>
          <div><strong>{formatNumber(stats?.official ?? 0)}</strong><span>可信方发布资源</span></div>
          <div><strong>{formatNumber(stats?.verified ?? 0)}</strong><span>已完成动态实测</span></div>
        </div>
      </section>

      <section className="wrap home-section">
        <div className="section-heading">
          <div><span className="section-kicker">按业务发现</span><h2>你要解决什么问题？</h2></div>
          <p>目录按真实工作场景组织，不需要先理解协议、运行方式或评分规则。</p>
        </div>
        <div className="business-grid">
          {BUSINESS_CATEGORIES.map((category) => (
            <Link className="business-card" key={category.id} href={`/servers?business=${category.id}`}>
              <span className="business-icon" aria-hidden>{CATEGORY_ICONS[category.id]}</span>
              <span><b>{category.label}</b><small>{category.description}</small></span>
              <span className="business-arrow" aria-hidden>↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section value-section">
        <div className="wrap value-grid">
          <div className="value-intro">
            <span className="section-kicker">资源价值</span>
            <h2>不止是“收录了什么”，<br />更要回答“能帮你做什么”。</h2>
            <p>CNMCP 把服务描述转成可比较的能力信息，让选型从逛列表变成回答业务问题。</p>
            <Link className="text-link" href="/servers">探索全部 MCP 资源 <span aria-hidden>→</span></Link>
          </div>
          <div className="value-list">
            <div><span>01</span><div><b>真实工具，而非宣传文案</b><p>直接展示 tools/list 返回的工具、描述与输入结构，能力边界一目了然。</p></div></div>
            <div><span>02</span><div><b>来源和发布主体可追溯</b><p>优先展示可信方发布标记、公开仓库和来源链接，减少对聚合文案的依赖。</p></div></div>
            <div><span>03</span><div><b>同一业务场景横向比较</b><p>从软件开发、数据分析到市场运营，用相同维度发现更合适的服务。</p></div></div>
          </div>
        </div>
      </section>

      <section className="wrap home-section safety-section">
        <div className="section-heading compact">
          <div><span className="section-kicker">安全价值</span><h2>每一次连接，先经过证据。</h2></div>
          <p>不把未知包装成安全，也不只给你一个无法解释的等级。</p>
        </div>
        <div className="safety-grid">
          <article><span className="safety-no">01</span><div className="safety-mark">⌁</div><h3>验证能不能运行</h3><p>对具备可靠配置的资源执行协议握手，区分“项目存在”和“当前可用”。</p><span className="chip">初始化</span> <span className="chip">工具列表</span></article>
          <article><span className="safety-no">02</span><div className="safety-mark">◇</div><h3>识别明显风险</h3><p>检查工具描述、凭证暴露与异常外发信号；未覆盖的项目明确标注。</p><span className="chip">风险证据</span> <span className="chip">权限提示</span></article>
          <article><span className="safety-no">03</span><div className="safety-mark">↻</div><h3>持续观察变化</h3><p>工具、输入结构和可达性发生变化时留下记录，避免一次验证永久有效。</p><span className="chip">变更记录</span> <span className="chip">定期重验</span></article>
        </div>
      </section>

      <section className="wrap home-section doctor-cta">
        <div><span className="section-kicker">本地配置体检</span><h2>目录帮你选，体检帮你守住已经接入的配置。</h2><p>检查明文凭证、未加密连接、可变依赖、宽泛权限与失效服务。全部在浏览器本地完成，不上传配置。</p></div>
        <Link className="btn btn-light" href="/doctor">开始配置体检 <span aria-hidden>→</span></Link>
      </section>
    </div>
  );
}
