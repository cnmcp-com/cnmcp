import type { Metadata } from "next";
import Link from "next/link";

import { ProjectCards, ProjectFilters } from "@/components/project-list";
import { fetchCategories, fetchProjects, fetchProjectTypes } from "@/lib/api";

export const metadata: Metadata = {
  title: "发现 AI 开源项目",
  description: "按最新和热度浏览 AI 相关开源项目，并按业务领域、项目类型和安全状态筛选。",
  alternates: { canonical: "/" },
};

type Search = { category?: string; type?: string; security?: string; sort?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.type) query.set("type", params.type);
  if (params.security) query.set("security", params.security);
  query.set("sort", params.sort === "hot" ? "hot" : "latest");
  const [categories, types, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjectTypes().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const selected = { category: params.category, type: params.type, security: params.security, sort: query.get("sort") ?? "latest" };
  const sortHref = (sort: string) => {
    const next = new URLSearchParams(query);
    next.set("sort", sort);
    return `/?${next.toString()}`;
  };

  return (
    <div className="wrap stack" style={{ paddingBottom: 48 }}>
      <section className="community-hero">
        <span className="eyebrow"><i />AI 相关开源</span>
        <h1>发现值得一看的中文 AI 项目。</h1>
        <p>按业务领域和项目类型浏览 skill、agent、教程、软件和 MCP。每个项目都会做线索收集和静态扫描；只有 MCP 才会做动态检查。检查还没完成，不代表有风险。</p>
        <div className="meta-row">
          <Link className="btn btn-p" href="/submit">提交 GitHub 仓库</Link>
          <Link className="btn btn-s" href="/search">搜索</Link>
        </div>
      </section>
      <div className="filter-row">
        <Link href={sortHref("latest")} className={selected.sort === "latest" ? "on" : undefined}>最新</Link>
        <Link href={sortHref("hot")} className={selected.sort === "hot" ? "on" : undefined}>热</Link>
      </div>
      <ProjectFilters base="/" categories={categories} types={types} selected={selected} />
      <ProjectCards items={list.items} />
    </div>
  );
}
