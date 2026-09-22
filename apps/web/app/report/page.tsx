import { fetchStats } from "@/lib/api";

export default async function ReportPage() {
  let stats: Awaited<ReturnType<typeof fetchStats>> | null = null;
  try {
    stats = await fetchStats();
  } catch {
    stats = null;
  }
  const reachRate = stats && stats.remote ? Math.round((stats.reachable / stats.remote) * 100) : 0;
  return (
    <div className="wrap">
      <div className="page-hd">
      <h1>本站 MCP 探测可达报告</h1>
        <p>
          这份报告描述的是 CNMCP Worker 出口能否完成握手，<strong>不是</strong>中国大陆连通率，也不是北上广成四城拨测。
        </p>
      </div>
      <div className="stats" style={{ marginTop: 0 }}>
        {[
          ["收录", stats?.total ?? 0],
          ["remote", stats?.remote ?? 0],
          ["本站探测可达", stats?.reachable ?? 0],
          ["dead", stats?.dead ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="stat">
            <div className="n">{value}</div>
            <div className="k">{label}</div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--tx-2)", marginTop: 20, paddingBottom: 40 }}>
        remote 端点本站探测可达率 {reachRate}%（{stats?.reachable ?? 0}/{stats?.remote ?? 0}）。最后验证时间 {stats?.lastVerifiedAt ?? "尚未开始"}。
      </p>
    </div>
  );
}
