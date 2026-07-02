import type { MetadataRoute } from "next";
import { company } from "@/lib/content";
import { getArticles } from "@/lib/articles";

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getArticles().map((a) => ({
    url: `${company.url}/updates/${a.slug}`,
    lastModified: a.date ? new Date(`${a.date}T00:00:00`) : new Date(),
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  return [
    {
      url: company.url,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${company.url}/updates`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...articles,
  ];
}
