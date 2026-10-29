import Link from "next/link";

/** 收藏夹卡（phase1 §3.7）：/me 与 /u/[login] 复用 */
export function CollectionCard({
  id,
  title,
  isPublic,
  itemCount,
}: {
  id: string;
  title: string;
  isPublic: boolean;
  itemCount: number;
}) {
  return (
    <Link href={`/collections/${id}`} className="collection-card">
      <div className="cc-hd">{title}</div>
      <div className="cc-bd">
        {isPublic ? <span className="pill s-pill s-sm s-clear">公开</span> : <span className="pill s-pill s-sm s-pending">私有</span>}
        <span className="mono">{itemCount} 个项目</span>
      </div>
    </Link>
  );
}
