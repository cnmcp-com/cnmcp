import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectPanel } from "@/components/project-panel";
import { fetchCategories, fetchProject, fetchProjectTypes } from "@/lib/api";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await fetchProject(slug).catch(() => null);
  if (!detail) return { title: "项目" };
  return { title: detail.project.title, description: detail.project.summary || detail.project.repoKey };
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const detail = await fetchProject(slug);
  if (!detail) notFound();
  const [categories, types] = await Promise.all([
    fetchCategories(true).catch(() => []),
    fetchProjectTypes().catch(() => []),
  ]);
  const { project, reviews } = detail;

  return (
    <div className="wrap" style={{ padding: "28px 0 48px" }}>
      {project.status === "taken_down" ? <p className="card">这个项目已下架，不再出现在信息流和列表里。</p> : null}
      <div className="project-main">
        <article className="stack">
          <p className="muted"><Link href="/projects">全部项目</Link> / {project.repoKey}</p>
          <h1>{project.title}</h1>
          <p>{project.summary}</p>
          {project.recommendation ? <p className="card">推荐语：{project.recommendation}</p> : null}
          <div className="meta-row">
            <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
            {project.homepage ? <a href={project.homepage} target="_blank" rel="noopener noreferrer">主页</a> : null}
            <span>★ {project.stars}</span>
            <span>赞 {project.likeCount}</span>
            <span>收藏 {project.favoriteCount}</span>
            {project.ratingAvg != null ? <span>{project.ratingAvg} 分 / {project.ratingCount} 人</span> : <span>还没有评分</span>}
          </div>
          {project.tags.length ? <p className="muted">标签：{project.tags.join("、")}</p> : null}
          {project.archived ? <p>仓库在 GitHub 上已归档。</p> : null}
        </article>
        <ProjectPanel project={project} reviews={reviews} categories={categories} types={types} />
      </div>
    </div>
  );
}
