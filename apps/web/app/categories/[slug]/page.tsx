import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const name = decodeURIComponent(slug);
  return { title: name, description: `${name} 领域下的 AI 开源项目` };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const category = decodeURIComponent(slug);
  const path = `/categories/${encodeURIComponent(category)}`;

  const query = new URLSearchParams({ category });
  const [categoryResult, list] = await Promise.all([
    fetchCategories(true)
      .then((items) => ({ items, ok: true as const }))
      .catch(() => ({ items: [] as Awaited<ReturnType<typeof fetchCategories>>, ok: false as const })),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);

  const currentCategory = categoryResult.items.find((item) => item.slug === category);
  // 目录加载成功但 slug 不存在才是 404。接口失败时仍按 slug 展示，避免把故障当成页面不存在。
  if (categoryResult.ok && !currentCategory) notFound();

  const visible = categoryResult.items.filter((item) => item.projectCount > 0 || item.slug === category);

  return (
    <div className="wrap discover">
      <nav className="crumb" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span aria-hidden="true">/</span>
        <Link href="/projects">发现</Link>
      </nav>

      <header className="page-head">
        <h1>{currentCategory?.name ?? category}</h1>
        <p>{currentCategory?.description || "这个领域下的项目。"}</p>
      </header>

      <DiscoveryBar
        categories={visible}
        selectedSlug={category}
        hrefForCategory={(next) => (next ? `/categories/${encodeURIComponent(next)}` : "/projects")}
      />

      <div className="toolbar">
        <span className="cnt" aria-live="polite">
          共 <b>{list.total}</b> 个项目
        </span>
      </div>

      {list.items.length ? (
        <ProjectCards items={list.items} />
      ) : (
        <EmptyState title="这个领域还没有项目" desc="第一个提交它的人，就是这块领域的星芒起点。" returnTo={path} />
      )}
    </div>
  );
}
