import type { Metadata } from "next";

import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";

export const metadata: Metadata = {
  title: "发现 AI 开源项目",
  description: "按领域浏览 AI 开源项目。类型显示为标签，安全结论在项目页。",
  alternates: { canonical: "/" },
};

type Search = { category?: string; sort?: string };

function listHref(category: string | undefined, sort: "latest" | "hot") {
  const next = new URLSearchParams();
  if (category) next.set("category", category);
  if (sort === "hot") next.set("sort", "hot");
  const query = next.toString();
  return query ? `/?${query}` : "/";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const sort = params.sort === "hot" ? "hot" : "latest";
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  query.set("sort", sort);
  const [categories, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const current = categories.find((item) => item.slug === params.category);

  return (
    <div className="wrap discover">
      <h1 className="sr-only">发现 AI 开源项目</h1>
      <DiscoveryBar
        categories={categories}
        selectedSlug={params.category}
        hrefForCategory={(slug) => listHref(slug, sort)}
        sort={{ value: sort, href: (value) => listHref(params.category, value) }}
      />
      {current?.description ? <p className="domain-note">{current.description}</p> : null}
      <ProjectCards items={list.items} empty="这个领域还没有项目。可以换个领域，或提交一个 GitHub 仓库。" />
    </div>
  );
}
