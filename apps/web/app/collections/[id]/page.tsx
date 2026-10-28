import type { Metadata } from "next";

import { CollectionGate } from "@/components/collection-gate";
import { fetchCollection } from "@/lib/api";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const collection = await fetchCollection(id).catch(() => null);
  return { title: collection?.title ?? "收藏夹", robots: collection ? undefined : { index: false, follow: false } };
}

export default async function CollectionPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const initial = await fetchCollection(id).catch(() => null);
  return (
    <div className="wrap" style={{ padding: "28px 0 48px", maxWidth: 880 }}>
      <CollectionGate id={id} initial={initial} />
    </div>
  );
}
