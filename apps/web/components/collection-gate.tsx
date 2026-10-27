"use client";

import { useEffect, useState } from "react";

import { ProjectCards } from "@/components/project-list";
import type { CollectionView } from "@/lib/api";
import { authHeaders, captureSessionFromHash, readSession } from "@/lib/browser-session";
import { getPublicApiUrl } from "@/lib/public-api";

export function CollectionGate({ id, initial }: { id: string; initial: CollectionView | null }) {
  const [collection, setCollection] = useState(initial);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    captureSessionFromHash();
    if (initial || !readSession()) {
      if (!initial) setMissing(true);
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
      .catch(() => setMissing(true));
  }, [id, initial]);

  if (collection) {
    return (
      <div className="stack">
        <h1>{collection.title}</h1>
        <p className="muted">{collection.owner.login} · {collection.isPublic ? "公开收藏夹" : "私有收藏夹"}</p>
        <ProjectCards items={collection.items} />
      </div>
    );
  }
  if (missing) return <p>收藏夹不存在，或只有主人可以查看。</p>;
  return <p>正在打开收藏夹…</p>;
}
