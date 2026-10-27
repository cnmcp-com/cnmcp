import type { Metadata } from "next";

import { ProjectCards, ProjectFilters } from "@/components/project-list";
import { fetchCategories, fetchProjects, fetchProjectTypes } from "@/lib/api";

export const metadata: Metadata = {
  title: "搜索",
  description: "用关键词搜索 AI 开源项目，并可同时限定业务领域和项目类型。",
  alternates: { canonical: "/search" },
};

type Search = { q?: string; category?: string; type?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.type) query.set("type", params.type);
  const [categories, types, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjectTypes().catch(() => []),
    params.q ? fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })) : Promise.resolve({ items: [], total: 0, nextCursor: null }),
  ]);

  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px" }}>
      <h1>搜索</h1>
      <form className="meta-row" action="/search">
        <input name="q" defaultValue={params.q ?? ""} placeholder="关键词" aria-label="关键词" style={{ flex: 1, minWidth: 220, border: "1px solid var(--border-2)", borderRadius: 8, padding: "8px 10px", background: "var(--surface)" }} />
        {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
        {params.type ? <input type="hidden" name="type" value={params.type} /> : null}
        <button className="btn btn-p" type="submit">搜索</button>
      </form>
      <ProjectFilters base="/search" categories={categories} types={types} selected={params} />
      {params.q ? <ProjectCards items={list.items} /> : <p className="muted">输入关键词后再搜索。可以同时选定领域和类型。</p>}
    </div>
  );
}
