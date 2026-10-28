import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SubmitCta } from "@/components/empty-state";
import { HeroSearch } from "@/components/hero-search";
import { DiscoveryBar, ProjectCards } from "@/components/project-list";
import { fetchCategories, fetchProjects } from "@/lib/api";
import { buildListHref, type ListParams } from "@/lib/ui";

export const metadata: Metadata = {
  title: "发现 AI 开源项目",
  description: "按领域浏览 AI 开源项目。类型以徽章呈现，安全结论在项目页。",
  alternates: { canonical: "/" },
};

type Search = { category?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const current: ListParams = { category: params.category };

  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);

  const [categories, list] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchProjects(query.toString()).catch(() => ({ items: [], total: 0, nextCursor: null })),
  ]);
  const active = categories.find((item) => item.slug === params.category);
  const filtered = Boolean(params.category);
  const allHref = buildListHref("/projects", current);

  return (
    <>
      <section className="wrap hero-sec">
        <h1 className="sr-only">发现 AI 开源项目</h1>
        <p className="hero-title" aria-hidden="true">
          发现 AI 开源，从社区出发
        </p>
        <p className="hero-sub">按领域浏览 AI 开源项目。类型写在卡片上，安全结论在项目页。</p>
        <HeroSearch />
      </section>

      <div className="wrap discover">
        <DiscoveryBar
          categories={categories}
          selectedSlug={params.category}
          hrefForCategory={(slug) => buildListHref("/", current, { category: slug })}
        />
        {active?.description ? <p className="domain-note">{active.description}</p> : null}

        <div className="toolbar">
          <span className="cnt" aria-live="polite">
            共 <b>{list.total}</b> 个项目
          </span>
        </div>

        <div className="home-grid">
          <div className="home-feed">
            {list.items.length ? (
              <ProjectCards items={list.items} />
            ) : (
              <EmptyState
                title={filtered ? "这个领域还没有项目" : "还没有项目"}
                desc={filtered ? "换个领域试试，或者成为这个领域的第一个提交。" : "第一个提交它的人，就是这块领域的星芒起点。"}
                returnTo={buildListHref("/", current)}
              />
            )}
            {list.items.length ? (
              <div>
                <Link className="btn btn-s" href={allHref}>
                  查看全部 {list.total} 个项目 →
                </Link>
              </div>
            ) : null}
          </div>

          <aside className="rail" aria-label="侧栏">
            <section className="rail-c">
              <h4>关于安全检查</h4>
              <div className="b">
                <p style={{ margin: 0 }}>
                  列表只按领域浏览。安全结论写在每个项目页里；检查中、未完成都不是风险结论。
                </p>
                <Link href="/methodology" style={{ color: "var(--brand)", fontWeight: 600 }}>
                  检查怎么读 →
                </Link>
              </div>
            </section>
            <SubmitCta className="rail-cta" returnTo="/">
              <span className="mark" aria-hidden="true">
                ✦
              </span>
              <b>提交 GitHub 仓库</b>
              <small>自动上架，检查在后台继续</small>
            </SubmitCta>
          </aside>
        </div>
      </div>
    </>
  );
}
