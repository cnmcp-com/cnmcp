import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDetailView } from "@/components/project-panel";
import { fetchCategories, fetchProject, fetchProjectTypes, fetchRelatedProjects } from "@/lib/api";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await fetchProject(slug).catch(() => null);
  if (!detail) return { title: "项目" };
  const description = detail.project.summary || detail.project.recommendation || detail.project.repoKey;
  // 下架项目不进索引（phase2 §0.4）
  const robots = detail.project.status === "taken_down" ? { index: false, follow: false } : undefined;
  return { title: detail.project.title, description, robots };
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const detail = await fetchProject(slug);
  if (!detail) notFound();
  const { project, reviews } = detail;
  const [categories, types, related] = await Promise.all([
    fetchCategories(true).catch(() => []),
    fetchProjectTypes().catch(() => []),
    fetchRelatedProjects(project),
  ]);

  return (
    <div className="wrap detail-wrap">
      {project.status === "taken_down" ? (
        <p className="notice" role="status">
          这个项目已下架，不再出现在信息流和列表里。
        </p>
      ) : null}
      <ProjectDetailView project={project} reviews={reviews} categories={categories} types={types} related={related} />
    </div>
  );
}
