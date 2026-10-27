import Link from "next/link";
import { SECURITY_LABEL, SECURITY_STATUSES, type ProjectCard, type SecurityStatus } from "@cnmcp/schema";

import type { CategoryItem, ProjectTypeItem } from "@/lib/api";

function pill(status: SecurityStatus): string {
  if (status === "clear") return "p-ok";
  if (status === "warn") return "p-warn";
  if (status === "risk") return "p-bad";
  return "p-info";
}

export function ProjectCards({ items }: { items: ProjectCard[] }) {
  if (!items.length) return <div className="empty card">还没有可展示的项目。可以换个筛选，或提交一个 GitHub 仓库。</div>;
  return (
    <div className="project-grid">
      {items.map((item) => (
        <Link key={item.slug} href={`/projects/${item.slug}`} className="card project-card">
          <div className="meta-row">
            {item.category ? <span className="pill p-gray">{item.category.name}</span> : <span className="pill p-gray">未分类</span>}
            {item.type ? <span className="pill p-info">{item.type.name}</span> : null}
            <span className={`pill ${pill(item.securityStatus)}`}>{SECURITY_LABEL[item.securityStatus]}</span>
          </div>
          <h2>{item.title}</h2>
          <p>{item.recommendation || item.summary || item.repoKey}</p>
          <div className="meta-row muted">
            <span>{item.repoKey}</span>
            <span>★ {item.stars}</span>
            <span>赞 {item.likeCount}</span>
            {item.ratingAvg != null ? <span>{item.ratingAvg} 分</span> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function hrefFor(base: string, current: Record<string, string | undefined>, key: string, value?: string) {
  const next = new URLSearchParams();
  for (const [name, item] of Object.entries(current)) {
    if (!item || name === key) continue;
    next.set(name, item);
  }
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `${base}?${query}` : base;
}

export function ProjectFilters({
  base,
  categories,
  types,
  selected,
}: {
  base: string;
  categories: CategoryItem[];
  types: ProjectTypeItem[];
  selected: { q?: string; category?: string; type?: string; security?: string; sort?: string };
}) {
  return (
    <div className="stack">
      <div className="filter-row" aria-label="业务分类">
        <Link href={hrefFor(base, selected, "category")} className={selected.category ? undefined : "on"}>全部领域</Link>
        {categories.map((category) => (
          <Link key={category.slug} href={hrefFor(base, selected, "category", category.slug)} className={selected.category === category.slug ? "on" : undefined}>
            {category.name}
          </Link>
        ))}
      </div>
      <div className="filter-row" aria-label="项目类型">
        <Link href={hrefFor(base, selected, "type")} className={selected.type ? undefined : "on"}>全部类型</Link>
        {types.map((type) => (
          <Link key={type.slug} href={hrefFor(base, selected, "type", type.slug)} className={selected.type === type.slug ? "on" : undefined}>
            {type.name}
          </Link>
        ))}
      </div>
      <div className="filter-row" aria-label="安全状态">
        <Link href={hrefFor(base, selected, "security")} className={selected.security ? undefined : "on"}>全部安全状态</Link>
        {SECURITY_STATUSES.map((status) => (
          <Link key={status} href={hrefFor(base, selected, "security", status)} className={selected.security === status ? "on" : undefined}>
            {SECURITY_LABEL[status]}
          </Link>
        ))}
      </div>
    </div>
  );
}
