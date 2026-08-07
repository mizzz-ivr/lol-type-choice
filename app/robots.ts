import type { MetadataRoute } from "next";
import { buildSiteUrl, getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/result", "/history", "/compare"]
    },
    sitemap: buildSiteUrl("/sitemap.xml"),
    host: getSiteUrl()
  };
}
