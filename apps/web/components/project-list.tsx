import Link from "next/link";
import type { ProjectCard } from "@cnmcp/schema";

import type { CategoryItem } from "@/lib/api";
import { cardBlurb, detailTags, displayTitle, formatCompact } from "@/lib/project-present";
import { IconCode, IconGitHub, IconStar } from "./icons";

export function ProjectCards({
  items,
  variant = "list",
  empty = "还没有可展示的项目。",
}: {
  items: ProjectCard[];
  variant?: "list" | "related";
  empty?: string;
}) {
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <div className={variant === "related" ? "related-grid" : "hg-list"}>
      {items.map((item) => {
        const Title = variant === "related" ? "h3" : "h2";
        return (
        <Link key={item.slug} href={`/projects/${item.slug}`} className={variant === "related" ? "related-card" : "hg-item"}>
          <Title>{displayTitle(item)}</Title>
          {variant === "list" ? (
            <p className="hg-repo">
              <IconGitHub className="icon" />
              <span>{item.repoKey}</span>
            </p>
          ) : null}
          <p className="hg-desc">{cardBlurb(item)}</p>
          <div className="hg-meta">
            {item.language ? (
              <span>
                <IconCode className="icon" />
                {item.language}
              </span>
            ) : null}
            <span>
              <IconStar className="icon" />
              {formatCompact(item.stars)}
            </span>
            {detailTags(item).slice(0, 4).map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </Link>
        );
      })}
    </div>
  );
}

export function DiscoveryBar({
  categories,
  selectedSlug,
  hrefForCategory,
  sort,
}: {
  categories: CategoryItem[];
  selectedSlug?: string;
  hrefForCategory: (slug?: string) => string;
  sort?: { value: "latest" | "hot"; href: (value: "latest" | "hot") => string };
}) {
  return (
    <div className="discover-bar">
      <div className="domain-bar">
        <span className="domain-label" id="domain-label">领域</span>
        <div className="domain-chips" role="group" aria-labelledby="domain-label">
          <Link href={hrefForCategory()} className={selectedSlug ? undefined : "on"} aria-current={selectedSlug ? undefined : "true"}>
            全部
          </Link>
          {categories.map((category) => {
            const on = selectedSlug === category.slug;
            return (
              <Link key={category.slug} href={hrefForCategory(category.slug)} className={on ? "on" : undefined} aria-current={on ? "true" : undefined}>
                {category.name}
              </Link>
            );
          })}
        </div>
      </div>
      {sort ? (
        <div className="sort-switch" role="group" aria-label="排序">
          <Link href={sort.href("latest")} className={sort.value === "latest" ? "on" : undefined} aria-current={sort.value === "latest" ? "true" : undefined}>
            最新
          </Link>
          <Link href={sort.href("hot")} className={sort.value === "hot" ? "on" : undefined} aria-current={sort.value === "hot" ? "true" : undefined}>
            热门
          </Link>
        </div>
      ) : null}
    </div>
  );
}
