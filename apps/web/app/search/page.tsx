import type { Metadata } from "next";

import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";

export const metadata: Metadata = {
  title: "搜索",
  description: "用关键词搜索 AI 开源项目，并可同时限定领域。",
  alternates: { canonical: "/search" },
};

type Search = { q?: string; category?: string };

function searchHref(q: string | undefined, category?: string) {
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  if (category) next.set("category", category);
  const query = next.toString();
  return query ? `/search?${query}` : "/search";
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  const [categories, list] = await Promise.all([
    fetchCategories().catch(() => []),
    params.q ? fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })) : Promise.resolve({ items: [], total: 0, nextCursor: null }),
  ]);

  return (
    <div className="wrap discover">
      <header className="page-head">
        <h1>搜索</h1>
      </header>
      <form className="search-bar" action="/search">
        <input name="q" defaultValue={params.q ?? ""} placeholder="搜索项目、仓库或简介" aria-label="关键词" />
        {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
        <button className="btn btn-p" type="submit">搜索</button>
      </form>
      <DiscoveryBar
        categories={categories}
        selectedSlug={params.category}
        hrefForCategory={(slug) => searchHref(params.q, slug)}
      />
      {params.q ? <ProjectCards items={list.items} empty="没有找到匹配的项目。可以换个领域或关键词。" /> : <p className="muted">输入关键词后再搜索。可以同时选定领域。</p>}
    </div>
  );
}
