import type { MetadataRoute } from "next";
import { company } from "@/lib/content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/mineralx" },
    sitemap: `${company.url}/sitemap.xml`,
  };
}
