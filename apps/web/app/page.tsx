import Link from "next/link";
import { redirect } from "next/navigation";

import { fetchDirectory, fetchStats } from "@/lib/api";
import { ScoreRing } from "@/components/score-ring";
import { HeroSearch } from "@/components/ui-blocks";
import { formatNumber, pct, PRICING } from "@/lib/ui";

type Search = { q?: string; grade?: string; reachable?: string; transport?: string; official?: string; pricing?: string; cursor?: string };

const FILTER_KEYS = ["q", "grade", "reachable", "transport", "official", "pricing", "cursor"] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) next.set(key, value);
  }
  if ([...next.keys()].length) redirect(`/servers?${next.toString()}`);
  let ranked: Awaited<ReturnType<typeof fetchDirectory>>["items"] = [];
  let stats: Awaited<ReturnType<typeof fetchStats>> | null = null;
  let error: string | null = null;
  try {
    const directory = await fetchDirectory("limit=5");
    ranked = directory.items.filter((server) => server.status !== "dead");
    stats = await fetchStats();
  } catch {
    error = "API 暂不可用。先启动 apps/api 的 wrangler dev。";
  }

  const reachRate = stats ? pct(stats.reachable, stats.remote) : "—";

  return (
    <div className="wrap">
      <div className="hero">
        <span className="eyebrow">
          <i />
          第三方中立 · 本站探测，不是四城拨测
        </span>
        <h1>
          公开 MCP server，
          <br />
          哪些真的能接进生产？
        </h1>
        <p>不告诉你有多少个，只告诉你哪些能跑、有没有毒、要不要钱。检查器全部附原始证据。</p>
        <HeroSearch />
        <p className="srch-hint">
          试试关键词，或直接粘贴 <b>mcp.json</b> · 检测到配置会自动切换到体检
        </p>
        <div className="cta-row">
          <Link className="btn btn-p" href="/doctor">
            体检我的配置 →
          </Link>
          <Link className="btn btn-s" href="/servers">
            浏览精选目录
          </Link>
        </div>
        {error ? <p className="empty" style={{ marginTop: 24 }}>{error}</p> : null}
        <div className="stats">
          <Link href="/report" className="stat">
            <div className="n">{reachRate}</div>
            <div className="k">本站探测可达率</div>
            <div className="d">基于 {formatNumber(stats?.remote ?? 0)} 个 remote server</div>
          </Link>
          <div className="stat">
            <div className="n">{formatNumber(stats?.verified ?? 0)}</div>
            <div className="k">已完成实测</div>
            <div className="d">最后验证 {stats?.lastVerifiedAt?.slice(0, 10) ?? "尚未开始"}</div>
          </div>
          <div className="stat">
            <div className="n">{formatNumber(stats?.total ?? 0)}</div>
            <div className="k">已收录</div>
            <div className="d">来自公开 Registry，不是 Git 目录</div>
          </div>
          <div className="stat">
            <div className="n">{formatNumber(stats?.dead ?? 0)}</div>
            <div className="k">标记为 dead</div>
            <div className="d">验证失败，不显示虚构分数</div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-h">
          <h2>接入前，先回答三个问题</h2>
          <span>每个答案都由实测数据支撑</span>
        </div>
        <div className="three">
          <Link className="q" href="/servers?reachable=yes">
            <div className="gl g-ok">◉</div>
            <h3>能用吗</h3>
            <p>端点是否存活、真实返回多少工具、本站探测能否完成握手——不是 README 里写的那份。</p>
            <span className="chip">实测 tools/list</span> <span className="chip">本站探测可达</span>
          </Link>
          <Link className="q" href="/methodology">
            <div className="gl g-bad">△</div>
            <h3>安全吗</h3>
            <p>工具描述里有没有隐藏指令、有没有可疑外发域名。v1 先把能复算的证据摆出来，不装测过没测的项。</p>
            <span className="chip">证据可展开</span> <span className="chip">未测不打低分</span>
          </Link>
          <Link className="q" href="/servers">
            <div className="gl g-warn">¥</div>
            <h3>要钱吗</h3>
            <p>免费、自带密钥还是按量计费？谁在收、免费额度多少——接入前就知道。CNMCP 不代收。</p>
            <span className="chip">定价标签</span> <span className="chip">未知欢迎补充</span>
          </Link>
        </div>
      </div>

      <div className="sec" style={{ paddingBottom: 40 }}>
        <div className="split">
          <div className="card" style={{ padding: 24 }}>
            <span className="lbl">核心工具</span>
            <h3 style={{ fontSize: 19, fontWeight: 600, margin: "10px 0 8px", letterSpacing: "-.3px" }}>把你已经在用的配置，一次体检干净</h3>
            <p style={{ color: "var(--tx-2)", marginBottom: 16 }}>
              粘贴 <span className="mono" style={{ fontSize: 12.5 }}>mcp.json</span>，找出明文密钥、失效端点和本站探测不可达的 server。纯浏览器解析，不上传、不落库。
            </p>
            <pre className="code">{`{
  "mcpServers": {
    "example": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN_HERE" }
    }
  }
}`}</pre>
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <Link className="btn btn-p btn-sm" href="/doctor">
                开始体检
              </Link>
              <span style={{ fontSize: 12, color: "var(--tx-3)" }}>纯浏览器解析 · 不上传 · 不落库</span>
            </div>
          </div>
          <div>
            <div className="sec-h" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 16 }}>本月可信榜</h2>
              <Link className="more" href="/servers">
                查看全部 →
              </Link>
            </div>
            <div className="rank">
              {ranked.length === 0 ? (
                <div className="rk">
                  <span className="nm">
                    <b>暂无已验证条目</b>
                    <span>启动 API 后这里会列出 Trust Score 最高的 server</span>
                  </span>
                </div>
              ) : (
                ranked.map((server, index) => {
                  const pricing = PRICING[server.pricingModel];
                  return (
                    <Link key={server.id} className="rk" href={`/servers/${encodeURIComponent(server.id)}`}>
                      <span className="no">{index + 1}</span>
                      <ScoreRing score={server.score} grade={server.grade} size="rank" />
                      <span className="nm">
                        <b>{server.title}</b>
                        <span>{server.namespace || server.id}</span>
                      </span>
                      <span className={`pill ${pricing.pill}`}>{pricing.label}</span>
                    </Link>
                  );
                })
              )}
            </div>
            <div className="sec-h" style={{ margin: "22px 0 12px" }}>
              <h2 style={{ fontSize: 16 }}>安全动态</h2>
              <Link className="more" href="/news">
                全部 →
              </Link>
            </div>
            <div className="rank">
              <Link className="rk" href="/news">
                <span className="dot d-info" />
                <span className="nm">
                  <b style={{ whiteSpace: "normal", lineHeight: 1.45 }}>M1 验证事件尚未形成带数据锚点的公告</b>
                  <span>空白是故意的，不为了更新而更新</span>
                </span>
              </Link>
              <Link className="rk" href="/report">
                <span className="dot d-ok" />
                <span className="nm">
                  <b style={{ whiteSpace: "normal", lineHeight: 1.45 }}>本站探测可达报告</b>
                  <span>Worker 出口握手结果，不是中国大陆连通率</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
