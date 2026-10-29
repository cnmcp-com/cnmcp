import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";
import { buildListHref, type ListParams } from "@/lib/ui";

export const metadata: Metadata = {
  title: "搜索",
  description: "用关键词搜索 AI 开源项目，并可同时限定领域。",
  alternates: { canonical: "/search" },
};

type Search = { q?: string; category?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const current: ListParams = { q: q || undefined, category: params.category };

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (params.category) query.set("category", params.category);

  const [categories, list] = await Promise.all([
    fetchCategories().catch(() => []),
    q ? fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })) : Promise.resolve({ items: [], total: 0, nextCursor: null }),
  ]);

  return (
    <div className="wrap discover">
      <header className="page-head">
        <h1>搜索</h1>
      </header>

      <form className="search-bar" action="/search" role="search">
        <input name="q" defaultValue={q} placeholder="搜索项目、仓库或关键词…" aria-label="关键词" type="search" />
        {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
        <button className="btn btn-p" type="submit">
          搜索
        </button>
      </form>

      <DiscoveryBar
        categories={categories}
        selectedSlug={params.category}
        hrefForCategory={(slug) => buildListHref("/search", current, { category: slug })}
      />

      {q ? (
        <>
          <div className="toolbar">
            <span className="cnt" aria-live="polite">
              「{q}」共 <b>{list.total}</b> 个结果
            </span>
          </div>
          {list.items.length ? (
            <ProjectCards items={list.items} />
          ) : (
            <EmptyState title="没有找到匹配的项目" desc="换个关键词，或换个领域试试。" cta={null} />
          )}
        </>
      ) : (
        <p className="muted">输入关键词后再搜索。可以同时选定领域。</p>
      )}
    </div>
  );
}
