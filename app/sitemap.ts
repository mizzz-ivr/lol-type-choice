import type { MetadataRoute } from "next";
import { getAllResultTypeGuides } from "@/lib/resultGuide";
import { buildSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const typeEntries: MetadataRoute.Sitemap = getAllResultTypeGuides().map(({ resultType }) => ({
    url: buildSiteUrl(`/types/${resultType.id}`),
    lastModified,
    changeFrequency: "monthly",
    priority: 0.7
  }));

  return [
    {
      url: buildSiteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: buildSiteUrl("/diagnosis"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9
    },
    {
      url: buildSiteUrl("/types"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8
    },
    ...typeEntries
  ];
}
