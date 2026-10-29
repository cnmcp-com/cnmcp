"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="wrap gate-wrap">
      <div className="gate-card">
        <span className="empty-star" aria-hidden="true">
          ✦
        </span>
        <h1 className="gate-title">加载失败</h1>
        <p className="empty-desc">这次没能取到数据。可以重试一次，或者先回发现页。</p>
        <div className="gate-actions">
          <button type="button" className="btn btn-s" onClick={reset}>
            重试
          </button>
          <a className="btn btn-g" href="/">
            回到发现页
          </a>
        </div>
      </div>
    </div>
  );
}
