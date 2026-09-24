import type { Metadata } from "next";

import { DoctorPanel } from "@/components/doctor-panel";
import { getPublicApiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "MCP 配置体检",
  description: "在浏览器本地检查 MCP 配置中的明文凭证、未加密连接、可变依赖、宽泛权限和失效服务，配置不上传。",
  alternates: { canonical: "/doctor" },
};

export default function DoctorPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>配置体检</h1>
        <p>
          粘贴你的 <span className="mono" style={{ fontSize: 13 }}>mcp.json</span>，检查明文密钥、未加密连接、可变依赖、宽泛权限与目录验证状态。
        </p>
      </div>
      <div className="priv">
        <div className="dot d-ok" style={{ marginTop: 5 }} />
        <div>
          <b>隐私承诺：配置只在你的浏览器内存中解析</b>
          <p>密钥不做任何网络传输、不落库、不写日志。对照目录只会请求公开的 servers-index.json。你可以打开开发者工具的网络面板自行验证。</p>
        </div>
      </div>
      <DoctorPanel indexUrl={`${getPublicApiUrl()}/data/servers-index.json`} />
    </div>
  );
}
