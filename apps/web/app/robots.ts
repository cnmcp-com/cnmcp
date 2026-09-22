import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/servers/", "/methodology", "/report", "/doctor", "/news"],
        disallow: ["/servers?grade=", "/servers?q="],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cnmcp.com"}/sitemap.xml`,
  };
}
