export default function NewsPage() {
  return (
    <div className="wrap">
      <div className="page-hd">
        <h1>安全动态</h1>
        <p>不是媒体，是验证数据集的表达层。每篇内容都锚定到数据集里一个可验证的对象，没有锚点的内容不发。</p>
      </div>
      <div className="empty">
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--tx)", marginBottom: 6 }}>M1 还没有带数据锚点的公告</div>
        <div style={{ marginBottom: 16 }}>空白是故意的。验证事件形成可引用对象后才会出现在这里。</div>
        <a className="btn btn-s btn-sm" href="/report">
          先看本站探测可达报告
        </a>
      </div>
      <div className="sub">
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500 }}>订阅更新</div>
          <div style={{ fontSize: 12.5, color: "var(--tx-2)", marginTop: 2 }}>风险公告即时推送。订阅通道尚未开通。</div>
        </div>
        <button className="btn btn-p btn-sm" type="button" disabled>
          即将开放
        </button>
      </div>
    </div>
  );
}
