import Link from "next/link";
import type { ProjectCard } from "@cnmcp/schema";

import type { CategoryItem } from "@/lib/api";
import { cardBlurb, displayTitle, formatCompact } from "@/lib/project-present";
import { categoryDotColor, typeBadgeClass, typeTileClass, typeTileLetter } from "@/lib/ui";
import { IconCode, IconStar } from "./icons";

/* ============================================================
   项目卡片。类型是徽章，安全状态不在列表展示。
   缺字段就不渲染，不留占位框。
   ============================================================ */

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
  const related = variant === "related";
  return (
    <div className={related ? "related-grid" : "hg-list"}>
      {items.map((item) => (
        <Link key={item.slug} href={`/projects/${item.slug}`} className={related ? "related-card" : "hg-item"}>
          <span className={`tile ${typeTileClass(item.type?.slug)}`} aria-hidden="true">
            {typeTileLetter(item.type?.slug, item.type?.name)}
          </span>
          <div className="hg-body">
            {(() => {
              const Title = related ? "h3" : "h2";
              return (
                <Title>
                  {displayTitle(item)}
                  {item.type ? <span className={`pill ${typeBadgeClass(item.type.slug)}`}>{item.type.name}</span> : null}
                </Title>
              );
            })()}
            <p className="hg-repo">
              {item.repoKey}
              {item.category?.name ? ` · ${item.category.name}` : ""}
              {item.type?.name ? ` · ${item.type.name}` : ""}
            </p>
            <p className="hg-desc">{cardBlurb(item)}</p>
            {!related && item.recommendation?.trim() ? <p className="blurb">{item.recommendation}</p> : null}
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
            </div>
          </div>
          {!related && item.ratingAvg != null ? (
            <span className="rate">
              <IconStar className="icon" />
              {item.ratingAvg.toFixed(1)}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/* ============================================================
   发现条只保留领域 chip。类型、安全、排序不在这里出现。
   ============================================================ */

export function DiscoveryBar({
  categories,
  selectedSlug,
  hrefForCategory,
}: {
  categories: CategoryItem[];
  selectedSlug?: string;
  hrefForCategory: (slug?: string) => string;
}) {
  return (
    <div className="discover-bar">
      <div className="axis" role="group" aria-labelledby="axis-domain">
        <span className="axis-label" id="axis-domain">
          领域
        </span>
        <div className="axis-row domain-chips">
          <Link href={hrefForCategory()} className={selectedSlug ? "chip" : "chip on"} aria-current={selectedSlug ? undefined : "true"}>
            全部
          </Link>
          {categories.map((category) => {
            const on = selectedSlug === category.slug;
            const dotColor = categoryDotColor(category);
            return (
              <Link
                key={category.slug}
                href={hrefForCategory(category.slug)}
                className={on ? "chip on" : "chip"}
                aria-current={on ? "true" : undefined}
              >
                {dotColor ? <i className="cd" style={{ background: dotColor }} aria-hidden="true" /> : null}
                {category.name}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
