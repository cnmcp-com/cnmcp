import type { MetadataRoute } from "next";

import { fetchCategories, fetchProjects } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: "hourly", priority: 1 },
    { url: `${site}/projects`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${site}/search`, changeFrequency: "daily", priority: 0.6 },
    { url: `${site}/submit`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site}/methodology`, changeFrequency: "monthly", priority: 0.4 },
  ];
  try {
    const categories = await fetchCategories();
    const projects = await fetchProjects("limit=48");
    return [
      ...staticRoutes,
      ...categories.map((category) => ({ url: `${site}/categories/${encodeURIComponent(category.slug)}`, changeFrequency: "daily" as const, priority: 0.7 })),
      ...projects.items.map((project) => ({ url: `${site}/projects/${project.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ];
  } catch {
    return staticRoutes;
  }
}
