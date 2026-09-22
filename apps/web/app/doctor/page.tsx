import { DoctorPanel } from "@/components/doctor-panel";
import { getPublicApiUrl } from "@/lib/api";

export default function DoctorPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>配置体检</h1>
        <p>
          粘贴你的 <span className="mono" style={{ fontSize: 13 }}>mcp.json</span>，在浏览器里解析，找出明文密钥、失效端点和本站探测不可达的 server。
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
