import type { Metadata } from "next";
import Link from "next/link";

import { ProjectCards, ProjectFilters } from "@/components/project-list";
import { fetchCategories, fetchProjects, fetchProjectTypes } from "@/lib/api";

type Params = { slug: string };
type Search = { type?: string; security?: string; sort?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const name = decodeURIComponent(slug);
  return { title: name, description: `${name} 领域下的 AI 开源项目` };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const category = decodeURIComponent(slug);
  const filters = await searchParams;
  const query = new URLSearchParams({ category });
  if (filters.type) query.set("type", filters.type);
  if (filters.security) query.set("security", filters.security);
  if (filters.sort) query.set("sort", filters.sort);
  const [categories, types, list] = await Promise.all([
    fetchCategories(true).catch(() => []),
    fetchProjectTypes().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const current = categories.find((item) => item.slug === category);

  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px" }}>
      <p className="muted"><Link href="/projects">全部项目</Link></p>
      <h1>{current?.name ?? category}</h1>
      <p>{current?.description || "这个领域下的项目。没有项目的分类不会出现在默认筛选里。"}</p>
      <ProjectFilters base={`/categories/${category}`} categories={categories.filter((item) => item.projectCount > 0 || item.slug === category)} types={types} selected={{ category, ...filters }} />
      <ProjectCards items={list.items} />
    </div>
  );
}
