import type { Metadata } from "next";

import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";

export const metadata: Metadata = {
  title: "全部项目",
  description: "浏览已上架的 AI 开源项目，可按领域筛选。类型是标签，不作为分类。",
  alternates: { canonical: "/projects" },
};

type Search = { q?: string; category?: string; sort?: string; cursor?: string };

function projectsHref(params: Search, patch: Partial<Search> = {}) {
  const next = new URLSearchParams();
  const merged = { ...params, ...patch };
  if (patch.category === undefined && "category" in patch) delete merged.category;
  for (const key of ["q", "category", "sort", "cursor"] as const) {
    const value = merged[key];
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/projects?${query}` : "/projects";
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "category", "sort", "cursor"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const sort = params.sort === "hot" ? "hot" : "latest";
  const [categories, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const current = categories.find((item) => item.slug === params.category);

  return (
    <div className="wrap discover">
      <header className="page-head">
        <h1>全部项目</h1>
        <p className="muted">共 {list.total} 个上架项目</p>
      </header>
      <DiscoveryBar
        categories={categories}
        selectedSlug={params.category}
        hrefForCategory={(slug) => projectsHref({ ...params, cursor: undefined }, { category: slug })}
        sort={{ value: sort, href: (value) => projectsHref({ ...params, cursor: undefined }, { sort: value === "latest" ? undefined : value }) }}
      />
      {current?.description ? <p className="domain-note">{current.description}</p> : null}
      <ProjectCards items={list.items} empty="这个筛选下还没有项目。" />
      {list.nextCursor ? <a className="btn btn-s" href={projectsHref(params, { cursor: list.nextCursor })}>下一页</a> : null}
    </div>
  );
}
