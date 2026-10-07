import type { MetadataRoute } from "next";

import { fetchDirectory } from "@/lib/api";
import { serverPublicPath } from "@/lib/server-path";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com";
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: "hourly", priority: 1 },
    { url: `${site}/servers`, changeFrequency: "hourly", priority: 0.95 },
    { url: `${site}/report`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${site}/doctor`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site}/news`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${site}/methodology`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${site}/submit`, changeFrequency: "monthly", priority: 0.5 },
  ];
  try {
    const servers: Awaited<ReturnType<typeof fetchDirectory>>["items"] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 40; page += 1) {
      const query = new URLSearchParams({ limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const directory = await fetchDirectory(query.toString());
      servers.push(...directory.items);
      cursor = directory.nextCursor;
      if (!cursor) break;
    }
    const serverRoutes = servers.flatMap((server) => {
      const id = server.id.trim();
      if (!id || /^(https?:)?\/\//i.test(id)) return [];
      return [
        {
          url: `${site}${serverPublicPath(id)}`,
          changeFrequency: "daily" as const,
          priority: 0.9,
          lastModified: server.verifiedAt ?? server.lastPublishedAt ?? undefined,
        },
      ];
    });
    return [...staticRoutes, ...serverRoutes];
  } catch {
    return staticRoutes;
  }
}
