import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "安全检查说明",
  description: "CNMCP 如何对 AI 开源项目做线索收集、静态扫描，以及只在 MCP 类型上做的动态检查。",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px", maxWidth: 800 }}>
      <h1>安全检查怎么读</h1>
      <p>项目是否公开，和安全检查有没有做完，是两件事。上架只看项目状态。安全结论写在每次扫描里。</p>
      <section className="card stack">
        <h2>所有项目</h2>
        <p>入库后都会收集仓库线索，并做静态扫描。静态结论是未发现明显风险、需要留意、存在风险线索。扫描没跑成时记为检查未完成。</p>
      </section>
      <section className="card stack">
        <h2>只有 MCP</h2>
        <p>项目类型是 mcp 时，才会尝试公开端点的协议握手和工具列表。其他类型跳过这一步。stdio 隔离容器探测仍留给后续接入，没有跑成不会被写成风险。</p>
      </section>
      <section className="card stack">
        <h2>未完成不是风险</h2>
        <p>pending 表示还在检查。scan_failed 表示这次没有跑成。两者都保持上架，也不使用风险样式。发现风险线索默认仍留在列表里，下架是运营动作。</p>
      </section>
    </div>
  );
}
