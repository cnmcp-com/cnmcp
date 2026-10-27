import type { Metadata } from "next";

import { DoctorPanel } from "@/components/doctor-panel";

export const metadata: Metadata = {
  title: "本地配置体检",
  description: "在浏览器本地检查 MCP 配置。配置不会上传。",
  alternates: { canonical: "/doctor" },
};

export default function DoctorPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>本地配置体检</h1>
        <p>
          粘贴 <span className="mono" style={{ fontSize: 13 }}>mcp.json</span>，检查只在这台浏览器里完成，配置不会上传。
        </p>
      </div>
      <div className="priv">
        <div className="dot d-ok" style={{ marginTop: 5 }} />
        <div>
          <b>这不是社区入库入口</b>
          <p>收录项目请到提交页粘贴 GitHub 地址。这里不把配置送进检查队列。</p>
        </div>
      </div>
      <DoctorPanel />
    </div>
  );
}
