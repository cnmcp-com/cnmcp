"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProjectCards } from "@/components/project-list";
import type { CollectionView } from "@/lib/api";
import { authHeaders, captureSessionFromHash, readSession } from "@/lib/browser-session";
import { getPublicApiUrl, githubLoginUrl } from "@/lib/public-api";

/** 私有门逻辑一行不改，只换视觉（phase2 §3.4）：404 → missing；其余失败 fail-closed 走私有门 */
export function CollectionGate({ id, initial }: { id: string; initial: CollectionView | null }) {
  const [collection, setCollection] = useState(initial);
  const [missing, setMissing] = useState(false);
  const [checking, setChecking] = useState(!initial);

  useEffect(() => {
    captureSessionFromHash();
    if (initial) {
      setChecking(false);
      return;
    }
    if (!readSession()) {
      setChecking(false);
      return;
    }
    fetch(`${getPublicApiUrl()}/v1/collections/${id}`, { headers: authHeaders() })
      .then(async (response) => {
        if (response.status === 404) {
          setMissing(true);
          return;
        }
        if (!response.ok) throw new Error("load");
        setCollection((await response.json()) as CollectionView);
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [id, initial]);

  if (collection) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <header className="page-head">
          <h1>{collection.title}</h1>
          <div className="meta-row" style={{ marginTop: 6 }}>
            <Link href={`/u/${collection.owner.login}`} className="muted">
              {collection.owner.login}
            </Link>
            {collection.isPublic ? <span className="pill s-pill s-sm s-clear">公开收藏夹</span> : <span className="pill s-pill s-sm s-pending">私有</span>}
            <span className="mono" style={{ fontSize: 12, color: "var(--tx-3)" }}>
              {collection.items.length} 个项目
            </span>
          </div>
        </header>
        {collection.items.length ? (
          <ProjectCards items={collection.items} />
        ) : (
          <div className="empty">
            <p className="empty-title">这个收藏夹还是空的</p>
            <p className="empty-desc">在项目页点「收藏」就会放进默认收藏夹。</p>
          </div>
        )}
      </div>
    );
  }

  if (checking) {
    return (
      <div className="skel" aria-busy="true">
        <span className="sk-tile" />
        <span className="sk-lines">
          <span className="sk-l w60" />
          <span className="sk-l w85" />
        </span>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="empty">
        <span className="empty-star" aria-hidden="true">
          ✦
        </span>
        <p className="empty-title">收藏夹不存在</p>
        <p className="empty-desc">收藏夹不存在，或链接已失效。</p>
      </div>
    );
  }

  return (
    <div className="gate-card">
      <span className="pill s-pill s-sm s-pending">私有</span>
      <p className="empty-title">私有收藏夹</p>
      <p className="empty-desc">只有主人可以查看这个收藏夹。</p>
      <a className="btn btn-s" href={githubLoginUrl(`/collections/${id}`)}>
        GitHub 登录后查看
      </a>
    </div>
  );
}
