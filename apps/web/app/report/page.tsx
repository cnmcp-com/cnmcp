import type { Metadata } from "next";
import Link from "next/link";

import { fetchStats } from "@/lib/api";
import { formatDate } from "@/lib/ui";

export const metadata: Metadata = {
  title: "MCP 数据与验证报告",
  description: "CNMCP 的资源收录、静态检查、动态验证与数据覆盖报告。",
  alternates: { canonical: "/report" },
};

function rate(value: number, total: number): number {
  return total ? Math.round((value / total) * 100) : 0;
}

export default async function ReportPage() {
  const stats = await fetchStats().catch(() => null);
  const total = stats?.total ?? 0;
  const rows = [
    { label: "静态检查", value: stats?.staticChecked ?? 0, note: "公开来源、配置与风险线索" },
    { label: "动态验证", value: stats?.verified ?? 0, note: "完成协议握手并生成动态分" },
    { label: "可信方发布", value: stats?.official ?? 0, note: "发布主体与可信来源规则匹配" },
    { label: "可复用配置", value: stats?.configured ?? 0, note: "已提取可靠接入配置" },
  ];

  return (
    <div className="wrap report-page">
      <div className="page-hd">
        <h1>数据与验证报告</h1>
        <p>把“收录过”与“验证过”分开统计。动态验证描述当前协议交互结果；静态检查描述公开证据的完整度。</p>
      </div>
      {!stats ? <div className="empty">统计接口暂不可用，请稍后再试。</div> : (
        <>
          <div className="stats" style={{ marginTop: 0 }}>
            {[
              ["收录资源", stats.total],
              ["静态已检查", stats.staticChecked],
              ["动态已验证", stats.verified],
              ["可信方发布", stats.official],
            ].map(([label, value]) => (
              <div key={String(label)} className="stat"><div className="n">{value}</div><div className="k">{label}</div></div>
            ))}
          </div>

          <div className="report-grid">
            <section className="card report-card">
              <div className="report-title"><h2>数据覆盖</h2><span>{total} 条基准</span></div>
              <div className="coverage-list">
                {rows.map((row) => {
                  const percent = rate(row.value, total);
                  return (
                    <div className="coverage-row" key={row.label}>
                      <div><b>{row.label}</b><span>{row.note}</span></div>
                      <div className="coverage-value">{row.value}<small>{percent}%</small></div>
                      <div className="coverage-bar"><i style={{ width: `${percent}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card report-card">
              <div className="report-title"><h2>动态验证结果</h2><span>最近一次状态</span></div>
              <div className="result-list">
                <div><span className="dot d-ok" /><b>A 级</b><strong>{stats.gradeA}</strong></div>
                <div><span className="dot d-info" /><b>B 级</b><strong>{stats.gradeB}</strong></div>
                <div><span className="dot d-bad" /><b>失效</b><strong>{stats.dead}</strong></div>
                <div><span className="dot d-warn" /><b>本地动态未完成</b><strong>{stats.localUntested}</strong></div>
                <div><span className="dot d-na" /><b>不可验证</b><strong>{stats.unverifiable}</strong></div>
              </div>
              <div className="report-note">
                远程服务 {stats.remote} 个，本站探测可达 {stats.reachable} 个。该结果只代表 CNMCP 探测节点，不代表中国大陆区域连通率。
              </div>
            </section>
          </div>

          <div className="report-foot">
            <span>最后动态验证：{formatDate(stats.lastVerifiedAt)}</span>
            <Link href="/methodology">查看评分方法与边界 →</Link>
          </div>
        </>
      )}
    </div>
  );
}
