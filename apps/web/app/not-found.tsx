import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap gate-wrap">
      <div className="gate-card">
        <span className="empty-star" aria-hidden="true">
          ✦
        </span>
        <h1 className="gate-title">页面不存在</h1>
        <p className="empty-desc">链接可能已经失效，或者这个页面还没有建起来。</p>
        <Link className="btn btn-p" href="/">
          回到发现页
        </Link>
      </div>
    </div>
  );
}
