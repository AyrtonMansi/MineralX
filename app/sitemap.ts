import type { MetadataRoute } from "next";
import { company } from "@/lib/content";
import { getArticles } from "@/lib/articles";
export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getArticles();
  return [
    ...[
      "",
      "/company",
      "/direction",
      "/partnerships",
      "/contact",
      "/privacy",
      ...(articles.length ? ["/updates"] : []),
    ].map((path) => ({
      url: `${company.url}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...articles.map((a) => ({
      url: `${company.url}/updates/${a.slug}`,
      ...(a.date ? { lastModified: new Date(`${a.date}T00:00:00Z`) } : {}),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
