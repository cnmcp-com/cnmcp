import { ALGORITHM_VERSION, V1_WEIGHTS } from "@cnmcp/schema";

export default function MethodologyPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>方法论与开源</h1>
        <p>算法版本 {ALGORITHM_VERSION}。评分算法、权重、检查器规则全部公开。任何人都可以下载证据自行复算。</p>
      </div>
      <div className="priv">
        <div className="dot d-ok" style={{ marginTop: 5 }} />
        <div>
          <b>只呈现可复现的实测证据</b>
          <p>不接受购买评分，不接受付费收录。本站探测可达 ≠ 中国大陆四城连通率。</p>
        </div>
      </div>
      <div className="blk">
        <h3>v1 权重（已上线 4 项）</h3>
        <table className="wtable">
          <thead>
            <tr>
              <th>检查器</th>
              <th>权重</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>存活探测</td>
              <td className="mono">{V1_WEIGHTS.alive}</td>
            </tr>
            <tr>
              <td>工具契约实测</td>
              <td className="mono">{V1_WEIGHTS.contract}</td>
            </tr>
            <tr>
              <td>本站探测可达</td>
              <td className="mono">{V1_WEIGHTS.probe}</td>
            </tr>
            <tr>
              <td>维护活跃度</td>
              <td className="mono">{V1_WEIGHTS.freshness}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="blk">
        <h3>等级定义</h3>
        <div className="gr">
          <span className="g" style={{ color: "var(--ok)" }}>A</span>
          <div className="t"><b>≥85 分 · 可进生产</b></div>
        </div>
        <div className="gr">
          <span className="g" style={{ color: "var(--info)" }}>B</span>
          <div className="t"><b>70–84 分 · 建议接入</b></div>
        </div>
        <div className="gr">
          <span className="g" style={{ color: "var(--warn)" }}>C</span>
          <div className="t"><b>50–69 分 · 谨慎使用</b></div>
        </div>
        <div className="gr">
          <span className="g" style={{ color: "var(--bad)" }}>D</span>
          <div className="t"><b>&lt;50 分 · 不建议使用</b></div>
        </div>
        <div className="gr" style={{ borderColor: "color-mix(in srgb, var(--bad) 34%, transparent)" }}>
          <span className="g" style={{ color: "var(--bad)" }}>—</span>
          <div className="t">
            <b>dead / 未实测 · 不显示虚构分数</b>
            <p>本地包与握手失败的 server 标注未实测或 dead，不打低分装成评过。</p>
          </div>
        </div>
      </div>
      <div className="blk">
        <h3>开源与边界</h3>
        <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--tx-2)" }}>
          复算：<code>packages/checkers/fixtures/example-server.json</code> 经 <code>recomputeFromEvidence</code> 应得 100 / A。
          只对公开端点发起标准协议握手（initialize + tools/list）。不做漏洞扫描。作者可申诉与 opt-out。
          <div className="sep" style={{ margin: "18px 0" }} />
          <div className="dl">
            <span>检查器 · MIT</span>
            <span>站点 · Apache-2.0</span>
            <span>不接受付费收录</span>
          </div>
        </div>
      </div>
    </div>
  );
}
