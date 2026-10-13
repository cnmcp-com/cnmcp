import type { Metadata } from "next";

import { DoctorPanel } from "@/components/doctor-panel";
import { getPublicApiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "MCP 检测与配置体检",
  description: "在浏览器本地检查 MCP 配置，并可主动提交公开资源进行云端隔离检测。",
  alternates: { canonical: "/doctor" },
};

export default function DoctorPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>MCP 检测中心</h1>
        <p>
          粘贴你的 <span className="mono" style={{ fontSize: 13 }}>mcp.json</span>，先在本地检查风险，再按需提交公开资源进行隔离检测。
        </p>
      </div>
      <div className="priv">
        <div className="dot d-ok" style={{ marginTop: 5 }} />
        <div>
          <b>隐私边界：本地体检不会上传配置</b>
          <p>只有点击“提交当前配置检测”才会主动提交；含疑似明文凭证的配置会在浏览器中拦截。本站重新获取公开资料，不把提交内容作为评分依据。</p>
        </div>
      </div>
      <DoctorPanel apiUrl={getPublicApiUrl()} />
    </div>
  );
}
