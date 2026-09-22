import type { Metadata } from "next";
import Link from "next/link";

import { fetchDirectory } from "@/lib/api";
import { ServerCard } from "@/components/ui-blocks";
import { PRICING } from "@/lib/ui";

type Search = { q?: string; grade?: string; reachable?: string; transport?: string; official?: string; pricing?: string; cursor?: string };

const GRADES = ["A", "B", "C", "D"] as const;
const PRICE_KEYS = ["free", "byok", "freemium", "subscription", "metered", "unknown"] as const;

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
  const filtered = Boolean(params.q || params.grade || params.reachable || params.transport || params.official || params.pricing);
  return {
    title: "server 目录 — CNMCP",
    description: "已完成至少一轮验证的 MCP server 目录。所有筛选不需要登录，也不排序付费内容。",
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

  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>server 目录</h1>
        <p>{total ? `${total} 个已完成至少一轮验证。` : "收录与实测数据来自验证引擎。"}所有筛选不需要登录，也不排序付费内容。</p>
      </div>
      {error ? <p className="empty">{error}</p> : null}
      <div className="dir">
        <aside className="filters">
          <form className="fgroup" style={{ borderBottom: 0, paddingBottom: 16 }} action="/servers" method="get">
            {params.grade ? <input type="hidden" name="grade" value={params.grade} /> : null}
            {params.reachable ? <input type="hidden" name="reachable" value={params.reachable} /> : null}
            {params.transport ? <input type="hidden" name="transport" value={params.transport} /> : null}
            {params.official ? <input type="hidden" name="official" value={params.official} /> : null}
            {params.pricing ? <input type="hidden" name="pricing" value={params.pricing} /> : null}
            <input className="dir-search" name="q" defaultValue={params.q ?? ""} placeholder="搜索名称 / 工具 / 命名空间" />
          </form>
          <div className="fgroup">
            <h4>
              Trust 等级 <em>A/B/C/D</em>
            </h4>
            <div className="seg">
              <Link className={!params.grade ? "on" : undefined} href={hrefWith(params, { grade: "" })}>
                全部
              </Link>
              {GRADES.map((grade) => (
                <Link key={grade} className={params.grade === grade ? "on" : undefined} href={hrefWith(params, { grade })}>
                  {grade}
                </Link>
              ))}
            </div>
          </div>
          <div className="fgroup">
            <h4>定价模型</h4>
            {PRICE_KEYS.map((model) => (
              <Link key={model} className={`fopt${params.pricing === model ? " on" : ""}`} href={toggle(params, "pricing", model)}>
                <span className="boxi" />
                {PRICING[model].label}
              </Link>
            ))}
          </div>
          <div className="fgroup">
            <h4>Transport</h4>
            <Link className={`fopt${params.transport === "remote" ? " on" : ""}`} href={toggle(params, "transport", "remote")}>
              <span className="boxi" />
              remote
            </Link>
            <Link className={`fopt${params.transport === "local" ? " on" : ""}`} href={toggle(params, "transport", "local")}>
              <span className="boxi" />
              local 未实测
            </Link>
          </div>
          <div className="fgroup">
            <h4>关键条件</h4>
            <Link className={`sw${params.reachable === "yes" ? " on" : ""}`} href={toggle(params, "reachable", "yes")}>
              <span>仅看本站探测可达</span>
              <span className="tg" />
            </Link>
            <Link className={`sw${params.official === "yes" ? " on" : ""}`} href={toggle(params, "official", "yes")}>
              <span>仅看官方发布</span>
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
              <b>{items.length}</b> 个本页结果 · 共 {total} 个已验证
            </span>
            <div className="r">
              <span className="chip">按 Trust Score</span>
            </div>
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
