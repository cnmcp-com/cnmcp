import type { MetadataRoute } from "next";

import { fetchDirectory } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: "hourly", priority: 1 },
    { url: `${site}/servers`, changeFrequency: "hourly", priority: 0.95 },
    { url: `${site}/methodology`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site}/report`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${site}/doctor`, changeFrequency: "monthly", priority: 0.7 },
  ];
  try {
    const directory = await fetchDirectory("limit=50");
    return [
      ...staticRoutes,
      ...directory.items.map((server) => ({
        url: `${site}/servers/${encodeURIComponent(server.id)}`,
        changeFrequency: "daily" as const,
        priority: 0.9,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
