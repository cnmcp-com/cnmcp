import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";
import { buildListHref, type ListParams } from "@/lib/ui";

export const metadata: Metadata = {
  title: "全部项目",
  description: "浏览已上架的 AI 开源项目，可按领域筛选。类型是标签，安全结论在项目页。",
  alternates: { canonical: "/projects" },
};

type Search = { q?: string; category?: string; cursor?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const current: ListParams = {
    q: params.q,
    category: params.category,
    cursor: params.cursor,
  };

  const query = new URLSearchParams();
  for (const key of ["q", "category", "cursor"] as const) {
    const value = current[key];
    if (value) query.set(key, value);
  }

  const [categories, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const active = categories.find((item) => item.slug === params.category);
  const filtered = Boolean(params.q || params.category);
  const nextHref = list.nextCursor ? buildListHref("/projects", current, { cursor: list.nextCursor }) : null;

  return (
    <div className="wrap discover">
      <header className="page-head">
        <h1>全部项目</h1>
        <p>按领域浏览已上架项目。类型是标签，安全结论写在项目页。</p>
      </header>

      <DiscoveryBar
        categories={categories}
        selectedSlug={params.category}
        hrefForCategory={(slug) => buildListHref("/projects", current, { category: slug })}
      />
      {active?.description ? <p className="domain-note">{active.description}</p> : null}

      <div className="toolbar">
        <span className="cnt" aria-live="polite">
          共 <b>{list.total}</b> 个项目
        </span>
      </div>

      {list.items.length ? (
        <ProjectCards items={list.items} />
      ) : (
        <EmptyState
          title={filtered ? "这个条件下还没有项目" : "还没有项目"}
          desc={filtered ? "换个领域或关键词试试，也可以成为第一个提交。" : "第一个提交它的人，就是这块领域的星芒起点。"}
          returnTo={buildListHref("/projects", current)}
        />
      )}

      {nextHref ? (
        <div>
          <a className="btn btn-s" href={nextHref} rel="next">
            下一页 →
          </a>
        </div>
      ) : null}
    </div>
  );
}
