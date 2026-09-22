import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchDirectory, fetchServer, getPublicApiUrl } from "@/lib/api";
import { CopyConfig } from "@/components/copy-config";
import { ScoreRing } from "@/components/score-ring";
import { DetailTabs, ServerCard } from "@/components/ui-blocks";
import { CHECKER_LABELS, GRADE_COLOR, GRADE_PILL, GRADE_TEXT, PRICING, PRICING_SOURCE, STATUS_UI, compactJson, formatDate, isPaidModel, reachLabel, sparkline, statusHint } from "@/lib/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const server = await fetchServer(decodeURIComponent(id)).catch(() => null);
  if (!server) return { title: "未收录" };
  const question = server.score === null ? "能用吗" : `安全吗 · ${server.grade ?? ""} ${server.score}`;
  return {
    title: `${server.title} ${question} — CNMCP`,
    description: `${server.title} 本站探测与 Trust Score。${server.description}`.slice(0, 160),
  };
}

export default async function ServerPage({ params }: Props) {
  const { id } = await params;
  const server = await fetchServer(decodeURIComponent(id));
  if (!server) notFound();
  const latest = server.snapshots[0];
  const endpoint = server.endpoints[0];
  const pricing = PRICING[server.pricing.model];
  const reach = reachLabel(server.transport, endpoint?.reachableProbe ?? server.reachableProbe);
  const hint = statusHint(server.status, server.score);
  const poisoned = server.tools.some((tool) => tool.poisoningFlags.length > 0);
  const related = (await fetchDirectory("limit=8").catch(() => ({ items: [] as Awaited<ReturnType<typeof fetchDirectory>>["items"] }))).items.filter((item) => item.id !== server.id).slice(0, 4);
  const history = [...server.snapshots].reverse().map((snap) => snap.score);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const badgeUrl = `${getPublicApiUrl()}/badge/${encodeURIComponent(server.id)}.svg`;
  const checkers = (["alive", "contract", "probe", "freshness"] as const).map((key) => {
    const component = latest?.components[key];
    const status = component?.status ?? "skip";
    const ui = STATUS_UI[status];
    return { key, status, ui, component };
  });

  return (
    <div className="wrap">
      <div className="crumb">
        <Link href="/">首页</Link>/<Link href="/servers">目录</Link>/<span>{server.namespace || server.id}</span>
      </div>
      <div className="dt-hd">
        <div className="dt-ring">
          <ScoreRing score={server.score} grade={server.grade} size="detail" />
        </div>
        <div className="dt-title">
          <h1>
            {server.title}
            {server.grade ? <span className={`pill ${GRADE_PILL[server.grade]}`}>{server.grade} 级 · {GRADE_TEXT[server.grade]}</span> : <span className="pill p-gray">未实测</span>}
            {poisoned || server.status === "dead" ? <span className="pill p-bad">{server.status === "dead" ? "失效 · 不建议接入" : "高危 · 不建议接入"}</span> : null}
          </h1>
          <div className="ns">{server.namespace || server.id} · 上次验证 {formatDate(server.verifiedAt)}</div>
          <div className="dt-desc">{server.description || "暂无描述"}</div>
          <div className="sc-tags" style={{ marginTop: 12 }}>
            <span className={`pill ${pricing.pill}`}>{pricing.label}</span>
            {server.isOfficial ? <span className="pill p-info">官方</span> : null}
            <span className="chip mono">{server.transport}</span>
            <span className="chip mono">{server.protocolVersion ?? "协议未知"}</span>
            <span className="chip mono">{server.license ?? "许可证未知"}</span>
            <span className={`pill ${reach.pill}`}>{reach.text}</span>
          </div>
        </div>
        <div className="dt-act">
          <Link className="btn btn-s btn-sm" href="/submit">申诉</Link>
        </div>
      </div>

      <div className="dt-body">
        <div>
          <DetailTabs
            tabs={[
              {
                id: "ov",
                label: "概览",
                content: (
                  <>
                    {hint ? (
                      <div className="warn-banner">
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--warn)" }}>{hint}</div>
                        {endpoint?.lastError ? <div style={{ fontSize: 12.5, color: "var(--tx-2)", marginTop: 2 }}>{endpoint.lastError}</div> : null}
                      </div>
                    ) : null}
                    {isPaidModel(server.pricing.model) ? (
                      <div className="warn-banner">
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--warn)" }}>这个 server 可能产生第三方费用</div>
                        <div style={{ fontSize: 12.5, color: "var(--tx-2)", marginTop: 2 }}>
                          计费方：{server.pricing.billingParty ?? "未知"}。接入前请确认额度。CNMCP 不代收。
                        </div>
                      </div>
                    ) : null}
                    <div className="blk">
                      <h3>定价与成本</h3>
                      <div className="card" style={{ padding: 18 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                          <span className={`pill ${pricing.pill}`}>{pricing.label}</span>
                          <span className="chip">来源：{PRICING_SOURCE[server.pricing.source] ?? "未知"}</span>
                          {server.pricing.collectedAt ? <span className="chip">采集于 {formatDate(server.pricing.collectedAt)}</span> : null}
                        </div>
                        <div className="mgrid">
                          <div>
                            <dt>计费方</dt>
                            <dd>{server.pricing.billingParty ?? "未知"}</dd>
                          </div>
                          <div>
                            <dt>免费额度</dt>
                            <dd>{server.pricing.freeQuota ?? "未声明"}</dd>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <dt>说明</dt>
                            <dd>{server.pricing.detail ?? (server.pricing.model === "unknown" ? "定价未知 · 欢迎补充" : "—")}</dd>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="blk">
                      <h3>元信息</h3>
                      <dl className="mgrid">
                        <div>
                          <dt>许可证</dt>
                          <dd className="mono" style={{ fontSize: 12.5 }}>{server.license ?? "未知"}</dd>
                        </div>
                        <div>
                          <dt>协议版本</dt>
                          <dd className="mono" style={{ fontSize: 12.5 }}>{server.protocolVersion ?? "未知"}</dd>
                        </div>
                        <div>
                          <dt>Transport</dt>
                          <dd className="mono" style={{ fontSize: 12.5 }}>{server.transport}</dd>
                        </div>
                        <div>
                          <dt>仓库</dt>
                          <dd>{server.repoUrl ?? "无（Registry 未提供）"}</dd>
                        </div>
                        <div>
                          <dt>版本数</dt>
                          <dd className="mono">{server.versionCount}</dd>
                        </div>
                        <div>
                          <dt>端点</dt>
                          <dd className="mono" style={{ fontSize: 12.5 }}>{endpoint?.url ?? "本地 / 未知"}</dd>
                        </div>
                      </dl>
                    </div>
                  </>
                ),
              },
              {
                id: "ev",
                label: "实测证据",
                content: (
                  <div className="blk">
                    <h3>v1 四项检查器 · 点击展开原始证据</h3>
                    <p style={{ fontSize: 12.5, color: "var(--tx-2)", marginBottom: 14 }}>我们只展示实测返回值。v2 的投毒 / 认证 / 溯源 / 合规尚未计入分数，见方法论。</p>
                    {checkers.map((item) => (
                      <details key={item.key} className="ev">
                        <summary>
                          <span className={`dot ${item.ui.dot}`} />
                          <span className="nm">{CHECKER_LABELS[item.key]}</span>
                          <span className="cc">{item.component ? `${item.component.status} · ${item.component.score}` : "无快照"}</span>
                          <span className="cv">
                            <span className={`pill ${item.ui.pill}`}>{item.ui.text}</span>
                            <span className="ar">›</span>
                          </span>
                        </summary>
                        <div className="ev-b">
                          <pre className="code" style={{ margin: 0 }}>
                            {compactJson(item.component?.evidence ?? {})}
                          </pre>
                        </div>
                      </details>
                    ))}
                  </div>
                ),
              },
              {
                id: "tl",
                label: "工具清单",
                content: (
                  <div className="blk">
                    <h3>实测工具清单 · {server.tools.length} 个</h3>
                    <p style={{ fontSize: 12.5, color: "var(--tx-2)", marginBottom: 14 }}>这是 tools/list 的真实返回，不是 README 里宣称的那份。</p>
                    <div className="card">
                      {server.tools.length ? (
                        server.tools.map((tool) => (
                          <div className="trow" key={tool.name}>
                            <span className="tn">{tool.name}</span>
                            <span className="td">{tool.description}</span>
                            {tool.poisoningFlags.length ? <span className="pill p-bad">命中投毒</span> : null}
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: 26, textAlign: "center", color: "var(--tx-3)", fontSize: 13 }}>端点已失效或尚未实测，无工具返回</div>
                      )}
                    </div>
                    {server.claimedToolNames.length && server.claimedToolNames.length !== server.tools.length ? (
                      <div className="diff" style={{ color: "var(--tx-2)" }}>
                        <span className="del">README / 声称 {server.claimedToolNames.length} 个工具</span>
                        <br />
                        <span className="add">实测返回 {server.tools.length} 个</span>
                      </div>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "net",
                label: "本站探测",
                content: (
                  <div className="blk">
                    <h3>本站探测可达</h3>
                    <div className="node-c">
                      <div className="cn">CNMCP Worker 出口</div>
                      <div className="cv" style={{ color: reach.pill === "p-ok" ? "var(--tx)" : reach.pill === "p-bad" ? "var(--bad)" : "var(--tx-3)" }}>
                        {endpoint?.latencyMs != null ? (
                          <>
                            {Math.round(endpoint.latencyMs)}
                            <span style={{ fontSize: 12 }}>ms</span>
                          </>
                        ) : (
                          reach.text
                        )}
                      </div>
                      <div className="bar">
                        <i style={{ width: endpoint?.reachableProbe ? "72%" : "100%", background: endpoint?.reachableProbe ? "var(--ok)" : "var(--bad)" }} />
                      </div>
                    </div>
                    <pre className="code" style={{ marginTop: 14 }}>
                      {compactJson({
                        reachableProbe: endpoint?.reachableProbe ?? null,
                        latencyMs: endpoint?.latencyMs ?? null,
                        lastCheckedAt: endpoint?.lastCheckedAt ?? null,
                        lastError: endpoint?.lastError ?? null,
                        note: "本站探测可达，不是中国大陆四城实测",
                      })}
                    </pre>
                  </div>
                ),
              },
              {
                id: "chg",
                label: "变更历史",
                content: (
                  <div className="blk">
                    <h3>变更历史</h3>
                    <pre className="code" style={{ marginBottom: 18 }}>
                      {`Trust Score 走势\n${sparkline(history)}\n${history.map((value) => (value === null ? "—" : String(value))).join("  →  ")}`}
                    </pre>
                    <div className="tl">
                      {server.changeEvents.length ? (
                        server.changeEvents.map((event, index) => (
                          <div className={`tl-i${event.severity === "high" ? " red" : ""}`} key={`${event.detectedAt}-${index}`}>
                            <div className="t1">{event.type}</div>
                            <div className="t2">{formatDate(event.detectedAt)}</div>
                            <pre className="diff">{compactJson(event.diff)}</pre>
                          </div>
                        ))
                      ) : (
                        <div className="tl-i">
                          <div className="t1">暂无变更事件</div>
                          <div className="t2">重验后若工具或描述变化会出现在这里</div>
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                id: "rel",
                label: "同类推荐",
                content: (
                  <div className="blk">
                    <h3>同类推荐</h3>
                    {related.length ? (
                      <div className="sc-grid">
                        {related.map((item) => (
                          <ServerCard key={item.id} server={item} />
                        ))}
                      </div>
                    ) : (
                      <div className="empty">暂无其它已验证条目</div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
        <aside className="rail">
          {poisoned ? (
            <div className="rail-c" style={{ borderColor: "color-mix(in srgb, var(--bad) 34%, transparent)" }}>
              <div className="b">
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--bad)", marginBottom: 6 }}>不建议接入</div>
                <div style={{ fontSize: 12.5, color: "var(--tx-2)" }}>工具描述命中投毒标记。复制配置入口已隐藏。</div>
              </div>
            </div>
          ) : (
            <>
              <CopyConfig server={server} />
              {server.grade && server.score !== null ? (
                <div className="rail-c">
                  <h4>可信徽章</h4>
                  <div className="badge-pv">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "var(--mono)",
                        fontSize: 11.5,
                        fontWeight: 500,
                        padding: "5px 11px",
                        borderRadius: "var(--r-pill)",
                        border: `1px solid color-mix(in srgb, ${GRADE_COLOR[server.grade]} 20%, transparent)`,
                        background: `color-mix(in srgb, ${GRADE_COLOR[server.grade]} 12%, transparent)`,
                        color: GRADE_COLOR[server.grade],
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: GRADE_COLOR[server.grade] }} />
                      CNMCP {server.grade} · {server.score}
                    </span>
                  </div>
                  <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
                    <pre className="code" style={{ margin: 0, fontSize: 11 }}>
                      {`[![CNMCP](${badgeUrl})](${site}/servers/${encodeURIComponent(server.id)})`}
                    </pre>
                  </div>
                </div>
              ) : null}
            </>
          )}
          <div className="rail-c">
            <div className="b" style={{ fontSize: 12.5, color: "var(--tx-2)" }}>
              <span className="lbl" style={{ display: "block", marginBottom: 6 }}>
                上次验证
              </span>
              {formatDate(server.verifiedAt)} · 算法 {server.algorithmVersion}
              <br />
              <span style={{ color: "var(--tx-3)" }}>数据过期会触发重验。本站探测不是四城拨测。</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
