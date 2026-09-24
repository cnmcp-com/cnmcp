import type { Metadata } from "next";
import { ALGORITHM_VERSION, V1_WEIGHTS } from "@cnmcp/schema";

export const metadata: Metadata = {
  title: "MCP 验证评分方法与数据边界",
  description: "了解 CNMCP 如何展示公开证据完整度与动态实测结果，以及 MCP 服务验证的权重、等级和适用边界。",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>方法论与开源</h1>
        <p>算法版本 {ALGORITHM_VERSION}。页面以公开证据完整度为主，动态实测作为辅助状态，两者不会合并成一个容易误解的总分。</p>
      </div>
      <div className="priv">
        <div className="dot d-ok" style={{ marginTop: 5 }} />
        <div>
          <b>先判断证据是否充分，再查看是否完成实测</b>
          <p>公开证据帮助用户了解来源与资料质量；动态实测补充当前协议交互结果，不替代安全审计。</p>
        </div>
      </div>
      <div className="blk">
        <h3>两套分数分别回答什么</h3>
        <div className="method-grid">
          <div className="card method-card">
            <span className="pill p-info">主要信息 · 证据完整度</span>
            <h4>公开资料是否足够完整、可追溯？</h4>
            <p>检查来源、发布方、配置、README 与维护时间。高分不等于服务能运行，也不构成安全背书。</p>
          </div>
          <div className="card method-card">
            <span className="pill p-ok">辅助信息 · 动态实测</span>
            <h4>现在能否完成标准协议交互？</h4>
            <p>实际执行 initialize 与 tools/list，记录可达性、工具返回和维护活跃度；未完成时只显示“待实测”。</p>
          </div>
        </div>
      </div>
      <div className="blk">
        <h3>动态实测辅助项 · v1 权重</h3>
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
        <h3>动态验证等级定义</h3>
        <div className="gr">
          <span className="g" style={{ color: "var(--ok)" }}>A</span>
          <div className="t"><b>≥85 分 · 动态验证表现良好</b></div>
        </div>
        <div className="gr">
          <span className="g" style={{ color: "var(--info)" }}>B</span>
          <div className="t"><b>70–84 分 · 主要动态检查通过</b></div>
        </div>
        <div className="gr">
          <span className="g" style={{ color: "var(--warn)" }}>C</span>
          <div className="t"><b>50–69 分 · 谨慎使用</b></div>
        </div>
        <div className="gr">
          <span className="g" style={{ color: "var(--bad)" }}>D</span>
          <div className="t"><b>&lt;50 分 · 动态检查结果较差</b></div>
        </div>
        <div className="gr" style={{ borderColor: "color-mix(in srgb, var(--bad) 34%, transparent)" }}>
          <span className="g" style={{ color: "var(--bad)" }}>—</span>
          <div className="t">
            <b>动态未完成 · 不生成动态等级</b>
            <p>本地包、握手失败或缺少可执行配置的资源只展示公开证据完整度，不会被包装成已动态验证。</p>
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
