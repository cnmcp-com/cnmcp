import type { Metadata } from "next";
import Link from "next/link";

import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";

type Params = { slug: string };
type Search = { sort?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const name = decodeURIComponent(slug);
  return { title: name, description: `${name} 领域下的 AI 开源项目` };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const category = decodeURIComponent(slug);
  const filters = await searchParams;
  const sort = filters.sort === "hot" ? "hot" : "latest";
  const query = new URLSearchParams({ category, sort });
  const [categories, list] = await Promise.all([
    fetchCategories(true).catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const visible = categories.filter((item) => item.projectCount > 0 || item.slug === category);
  const current = categories.find((item) => item.slug === category);
  const hrefForSort = (value: "latest" | "hot") => {
    if (value === "latest") return `/categories/${encodeURIComponent(category)}`;
    return `/categories/${encodeURIComponent(category)}?sort=hot`;
  };

  return (
    <div className="wrap discover">
      <p className="crumb">
        <Link href="/">首页</Link>
        <span aria-hidden="true">/</span>
        <Link href="/projects">发现</Link>
      </p>
      <header className="page-head">
        <h1>{current?.name ?? category}</h1>
        <p>{current?.description || "这个领域下的项目。"}</p>
      </header>
      <DiscoveryBar
        categories={visible}
        selectedSlug={category}
        hrefForCategory={(next) => (next ? `/categories/${encodeURIComponent(next)}` : "/projects")}
        sort={{ value: sort, href: hrefForSort }}
      />
      <ProjectCards items={list.items} empty="这个领域还没有项目。" />
    </div>
  );
}
