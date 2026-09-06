import type { Metadata } from "next";
import { company } from "./content";
export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} — ${company.name}`, description, url: path },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${company.name}`,
      description,
    },
  };
}
