import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchServer, getPublicApiUrl } from "@/lib/api";
import { CopyConfig } from "@/components/copy-config";
import { ScoreRing } from "@/components/score-ring";
import { DetailTabs } from "@/components/ui-blocks";
import { readmeToBlocks } from "@cnmcp/schema";
import { CHANGE_TYPE, CHECKER_LABELS, GRADE_COLOR, GRADE_PILL, GRADE_TEXT, STATUS_UI, compactJson, formatDate, reachLabel, sparkline, statusHint, transportLabel } from "@/lib/ui";

type Props = { params: Promise<{ id: string }> };

function isTencentCloudSource(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "cloud.tencent.com" || host.endsWith(".cloud.tencent.com") || host === "tencent-cloud.com" || host.endsWith(".tencent-cloud.com");
  } catch {
    return false;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const server = await fetchServer(decodeURIComponent(id)).catch(() => null);
  if (!server) return { title: "未收录" };
  const title = `${server.title} MCP 服务：工具、配置与验证结果`;
  const description = `${server.title} MCP 服务介绍、工具清单、公开来源、接入配置和验证结果。${server.description}`.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/servers/${encodeURIComponent(server.id)}` },
    openGraph: { title, description, url: `/servers/${encodeURIComponent(server.id)}` },
  };
}

export default async function ServerPage({ params }: Props) {
  const { id } = await params;
  const server = await fetchServer(decodeURIComponent(id));
  if (!server) notFound();
  const latest = server.snapshots[0];
  const endpoint = server.endpoints[0];
  const reach = reachLabel(server.transport, endpoint?.reachableProbe ?? server.reachableProbe);
  const hint = statusHint(server.status, server.score);
  const displayScore = server.staticScore ?? server.score ?? null;
  const displayGrade = server.staticScore != null ? null : server.grade;
  const declaredTools = server.declaredTools ?? [];
  const source = server.source ?? { author: null, iconUrl: null, srcUrl: null, srcSite: null, plazaUrl: null, categories: [], plazaCategories: [] };
  const publicSourceUrl = source.srcUrl && !isTencentCloudSource(source.srcUrl) ? source.srcUrl : null;
  const reliableConfig = server.reliableConfig ?? null;
  const readmeBlocks = readmeToBlocks(server.readme?.body);
  const sourceLabel = server.sourceLabel && server.sourceLabel !== "cloud.tencent.com" ? server.sourceLabel : null;
  const poisoned = server.tools.some((tool) => tool.poisoningFlags.length > 0);
  const declaredNames = new Set(declaredTools.map((tool) => tool.name));
  const measuredNames = new Set(server.tools.map((tool) => tool.name));
  const onlyDeclared = server.tools.length ? [...declaredNames].filter((name) => !measuredNames.has(name)) : [];
  const onlyMeasured = server.tools.length ? [...measuredNames].filter((name) => !declaredNames.has(name)) : [];
  const visibleChangeEvents = server.changeEvents.filter((event) => event.type !== "pricing_changed");
  const history = [...server.snapshots].reverse().map((snap) => snap.score);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const pageUrl = `${site}/servers/${encodeURIComponent(server.id)}`;
  const badgeUrl = `${getPublicApiUrl()}/badge/${encodeURIComponent(server.id)}.svg`;
  const checkers = (["alive", "contract", "probe", "freshness"] as const).map((key) => {
    const component = latest?.components[key];
    const status = component?.status ?? "skip";
    const ui = STATUS_UI[status];
    return { key, status, ui, component };
  });
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: site },
        { "@type": "ListItem", position: 2, name: "MCP 服务目录", item: `${site}/servers` },
        { "@type": "ListItem", position: 3, name: server.title, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `${server.title} MCP 服务`,
      description: server.description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "跨平台",
      url: pageUrl,
      codeRepository: server.repoUrl ?? undefined,
      author: source.author ? { "@type": "Organization", name: source.author } : undefined,
    },
  ];

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className="crumb">
        <Link href="/">首页</Link>/<Link href="/servers">目录</Link>/<span>{server.title}</span>
      </div>
      <div className="dt-hd">
        <div className="dt-ring">
          <ScoreRing score={displayScore} grade={displayGrade} size="detail" />
        </div>
        <div className="dt-ident">
          <div className="dt-title">
            <h1>
              {server.title}
              {server.staticScore != null ? <span className="pill p-info">证据完整度 {server.staticScore}</span> : null}
              {server.grade ? <span className={`pill ${GRADE_PILL[server.grade]}`}>已实测 · {GRADE_TEXT[server.grade]}</span> : <span className="pill p-gray">待实测</span>}
              {poisoned || server.status === "dead" ? <span className="pill p-bad">{server.status === "dead" ? "失效 · 不建议接入" : "高危 · 不建议接入"}</span> : null}
            </h1>
            <div className="ns">
              {[sourceLabel, source.author && source.author !== sourceLabel ? source.author : null, `上次验证 ${formatDate(server.verifiedAt)}`].filter(Boolean).join(" · ")}
            </div>
            <div className="dt-desc">{server.description || "暂无描述"}</div>
            <div className="sc-tags" style={{ marginTop: 12 }}>
              {server.isOfficial ? <span className="pill p-info">可信方发布</span> : null}
              {source.categories.map((category) => (
                <span className="chip" key={category.id}>
                  {category.name}
                </span>
              ))}
              <span className="chip">{transportLabel(server.transport)}</span>
              {server.protocolVersion ? <span className="chip mono">协议 {server.protocolVersion}</span> : null}
              {server.transport === "remote" ? <span className={`pill ${reach.pill}`}>{reach.text}</span> : null}
            </div>
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
                    <div className="blk">
                      <h3>来源与接入信息</h3>
                      <dl className="mgrid">
                        {source.author ? <div>
                          <dt>发布者</dt>
                          <dd>{source.author}</dd>
                        </div> : null}
                        {source.categories.length ? <div>
                          <dt>分类</dt>
                          <dd>{source.categories.map((category) => category.name).join("、")}</dd>
                        </div> : null}
                        {publicSourceUrl ? <div>
                          <dt>公开来源</dt>
                          <dd>
                            <a className="external-link" href={publicSourceUrl} target="_blank" rel="noopener noreferrer">
                              {source.srcSite || "查看公开来源"} ↗
                            </a>
                          </dd>
                        </div> : null}
                        {server.repoUrl ? <div>
                          <dt>代码仓库</dt>
                          <dd><a className="external-link" href={server.repoUrl} target="_blank" rel="noopener noreferrer">访问公开仓库 ↗</a></dd>
                        </div> : null}
                        {server.protocolVersion ? <div>
                          <dt>协议版本</dt>
                          <dd className="mono" style={{ fontSize: 12.5 }}>{server.protocolVersion}</dd>
                        </div> : null}
                        <div>
                          <dt>运行方式</dt>
                          <dd>{transportLabel(server.transport)}</dd>
                        </div>
                        {server.versionCount > 0 ? <div>
                          <dt>已知版本</dt>
                          <dd className="mono">{server.versionCount}</dd>
                        </div> : null}
                        {endpoint?.url ? <div>
                          <dt>公开端点</dt>
                          <dd className="mono endpoint-value">{endpoint.url}</dd>
                        </div> : null}
                      </dl>
                    </div>
                  </>
                ),
              },
              {
                id: "doc",
                label: "来源说明",
                content: (
                  <div className="blk">
                    <h3>来源说明</h3>
                    <p className="readme-note">以下内容整理自资源公开来源，仅优化排版，不改写原意。接入前请以项目仓库中的最新说明为准。</p>
                    {readmeBlocks.length ? (
                      <article className="readme">
                        {readmeBlocks.map((block, index) => {
                          if (block.type === "heading") return block.level === 1 ? <h4 key={index}>{block.text}</h4> : <h5 key={index}>{block.text}</h5>;
                          if (block.type === "list") {
                            return (
                              <ul key={index}>
                                {block.items.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            );
                          }
                          if (block.type === "code") {
                            return (
                              <pre className="code" key={index}>
                                {block.text}
                              </pre>
                            );
                          }
                          return <p key={index}>{block.text}</p>;
                        })}
                      </article>
                    ) : (
                      <div className="empty">来源未提供 README</div>
                    )}
                  </div>
                ),
              },
              {
                id: "ev",
                label: "实测证据",
                content: (
                  <div className="blk">
                    <h3>动态验证 · v1 四项检查器</h3>
                    <p style={{ fontSize: 12.5, color: "var(--tx-2)", marginBottom: 14 }}>以下内容只展示协议握手与运行探测返回值，作为公开证据完整度的辅助信息。未覆盖项目明确标为未测。</p>
                    {checkers.map((item) => (
                      <details key={item.key} className="ev">
                        <summary>
                          <span className={`dot ${item.ui.dot}`} />
                          <span className="nm">{CHECKER_LABELS[item.key]}</span>
                          <span className="cc">{item.component ? `${item.ui.text} · ${item.component.score} 分` : "无动态快照"}</span>
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
                  <>
                    <div className="blk">
                      <h3>来源声明工具 · {declaredTools.length} 个</h3>
                      <p style={{ fontSize: 12.5, color: "var(--tx-2)", marginBottom: 14 }}>广场详情页声明的名称、描述、参数和 Schema。</p>
                      {declaredTools.length ? (
                        declaredTools.map((tool) => (
                          <details key={tool.name} className="ev">
                            <summary>
                              <span className="tn">{tool.name}</span>
                              <span className="cc">{tool.description || "无描述"}</span>
                              <span className="cv">
                                <span className="ar">›</span>
                              </span>
                            </summary>
                            <div className="ev-b">
                              {tool.parameters.length ? (
                                <ul className="param-list">
                                  {tool.parameters.map((param) => (
                                    <li key={param.name}>
                                      <span className="mono">{param.name}</span>
                                      {param.type ? <span className="chip mono">{param.type}</span> : null}
                                      {param.required ? <span className="chip">必填</span> : null}
                                      {param.description ? <span>{param.description}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div style={{ fontSize: 12.5, color: "var(--tx-3)", marginBottom: 8 }}>来源未提供参数</div>
                              )}
                              {tool.inputSchema ? <pre className="code" style={{ margin: "10px 0 0" }}>{compactJson(tool.inputSchema)}</pre> : null}
                            </div>
                          </details>
                        ))
                      ) : (
                        <div className="empty">来源未声明工具</div>
                      )}
                    </div>
                    <div className="blk">
                      <h3>本站实测工具 · {server.tools.length} 个</h3>
                      <p style={{ fontSize: 12.5, color: "var(--tx-2)", marginBottom: 14 }}>本站握手 tools/list 的返回。尚未实测时这里为空。</p>
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
                          <div style={{ padding: 26, textAlign: "center", color: "var(--tx-3)", fontSize: 13 }}>尚未实测，无工具返回</div>
                        )}
                      </div>
                      {onlyDeclared.length || onlyMeasured.length ? (
                        <div className="diff" style={{ color: "var(--tx-2)" }}>
                          {onlyDeclared.length ? <div>仅来源声明：{onlyDeclared.join("、")}</div> : null}
                          {onlyMeasured.length ? <div>仅本站实测：{onlyMeasured.join("、")}</div> : null}
                        </div>
                      ) : null}
                    </div>
                  </>
                ),
              },
              {
                id: "net",
                label: "本站探测",
                content: (
                  <div className="blk">
                    <h3>本站探测可达</h3>
                    <div className="node-c">
                      <div className="cn">本站探测节点</div>
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
                        <i style={{ width: endpoint?.reachableProbe === true ? "72%" : endpoint?.reachableProbe === false ? "100%" : "0", background: endpoint?.reachableProbe === true ? "var(--ok)" : endpoint?.reachableProbe === false ? "var(--bad)" : "var(--tx-3)" }} />
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
                      {`安全评估走势\n${sparkline(history)}\n${history.map((value) => (value === null ? "—" : String(value))).join("  →  ")}`}
                    </pre>
                    <div className="tl">
                      {visibleChangeEvents.length ? (
                        visibleChangeEvents.map((event, index) => (
                          <div className={`tl-i${event.severity === "high" ? " red" : ""}`} key={`${event.detectedAt}-${index}`}>
                            <div className="t1">{CHANGE_TYPE[event.type] ?? event.type}</div>
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
              <CopyConfig config={reliableConfig} declaredCount={declaredTools.length} measuredCount={server.tools.length} />
              {server.grade && server.score !== null ? (
                <div className="rail-c">
                  <h4>安全状态徽章</h4>
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
                      {GRADE_TEXT[server.grade]} · {server.score}
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
