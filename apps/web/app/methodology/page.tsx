import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "安全检查说明",
  description: "CNMCP 如何对 AI 开源项目做线索收集、静态扫描，以及只在 MCP 类型上做的动态验证。",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <div className="wrap" style={{ padding: "28px 0 48px" }}>
      <header className="page-head" style={{ marginBottom: 18, maxWidth: 800 }}>
        <h1>安全检查怎么读</h1>
        <p>项目是否公开，和安全检查有没有做完，是两件事。上架只看项目状态。安全结论写在每次扫描里。</p>
      </header>

      <div className="method-sec">
        <section className="sec-box">
          <h2>所有项目：线索收集 + 静态扫描</h2>
          <div className="sec-bd">
            <p style={{ margin: 0, color: "var(--tx-2)" }}>
              入库后都会收集仓库线索（许可证、维护活跃度、默认分支等），并做静态扫描。静态结论分三种：未发现明显风险、需要留意、存在风险线索。扫描没跑成时记为未完成。
            </p>
          </div>
        </section>

        <section className="sec-box">
          <h2>只有 mcp 类型：动态验证</h2>
          <div className="sec-bd">
            <p style={{ margin: 0, color: "var(--tx-2)" }}>
              项目类型是 mcp 时，才会尝试公开端点的协议握手，读取工具列表。其他四种类型（skill、agent、教程、软件）跳过这一步。stdio 隔离容器探测仍留给后续接入，没有跑成不会被写成风险。
            </p>
          </div>
        </section>

        <section className="sec-box">
          <h2>未完成不是风险</h2>
          <div className="sec-bd">
            <p style={{ margin: 0, color: "var(--tx-2)" }}>
              pending 表示还在检查。scan_failed 表示这次没有跑成。两者都保持上架，也使用中性样式，不使用红或橙色。发现风险线索默认仍留在列表里，下架是运营动作。
            </p>
            <div className="meta-row" style={{ marginTop: 14 }}>
              <span className="pill s-pill s-clear">
                <i className="dot" aria-hidden="true" />
                已验证
              </span>
              <span className="pill s-pill s-warn">
                <i className="dot" aria-hidden="true" />
                有注意项
              </span>
              <span className="pill s-pill s-risk">
                <i className="dot" aria-hidden="true" />
                有风险
              </span>
              <span className="pill s-pill s-pending">
                <i className="dot" aria-hidden="true" />
                检查中
              </span>
              <span className="pill s-pill s-failed">
                <i className="dot" aria-hidden="true" />
                未完成
              </span>
            </div>
          </div>
        </section>

        <p className="field-hint" style={{ margin: 0 }}>
          想自己先看看本地 MCP 配置的风险？<Link href="/doctor" style={{ color: "var(--brand)" }}>跑一遍本地配置体检</Link>。
        </p>
      </div>
    </div>
  );
}
