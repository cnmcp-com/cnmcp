import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/servers", "/report", "/doctor", "/news", "/methodology"],
        disallow: ["/submit"],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com"}/sitemap.xml`,
  };
}
