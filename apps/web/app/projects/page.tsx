import type { Metadata } from "next";

import { ProjectCards, ProjectFilters } from "@/components/project-list";
import { fetchCategories, fetchProjects, fetchProjectTypes } from "@/lib/api";

export const metadata: Metadata = {
  title: "全部项目",
  description: "浏览已上架的 AI 开源项目，可按业务领域、项目类型和安全状态筛选。",
  alternates: { canonical: "/projects" },
};

type Search = { q?: string; category?: string; type?: string; security?: string; sort?: string; cursor?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "category", "type", "security", "sort", "cursor"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const [categories, types, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjectTypes().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);

  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px" }}>
      <h1>全部项目</h1>
      <ProjectFilters base="/projects" categories={categories} types={types} selected={params} />
      <p className="muted">共 {list.total} 个上架项目</p>
      <ProjectCards items={list.items} />
      {list.nextCursor ? <a className="btn btn-s" href={`/projects?${(() => { const next = new URLSearchParams(query); next.set("cursor", list.nextCursor ?? ""); return next.toString(); })()}`}>下一页</a> : null}
    </div>
  );
}
