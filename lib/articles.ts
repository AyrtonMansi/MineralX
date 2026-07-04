import fs from "fs";
import path from "path";
import { cache } from "react";
import matter from "gray-matter";
import { marked } from "marked";

/**
 * Markdown article loader.
 *
 * Articles live in /content/articles as .md files with frontmatter:
 *
 *   ---
 *   title: "Article headline"
 *   date: "2026-06-13"        (YYYY-MM-DD)
 *   category: "Company Update" (e.g. Company Update, Exploration, Corporate)
 *   excerpt: "One or two sentences shown on the Updates index."
 *   ---
 *   Body in plain markdown…
 *
 * Files whose names start with "_" (e.g. _template.md) are never published.
 * No CMS: write a file, commit, push — Vercel publishes it.
 */

const ARTICLES_DIR = path.join(process.cwd(), "content", "articles");

export type ArticleMeta = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
};

export type Article = ArticleMeta & { html: string };

/**
 * Wrapped in React's cache() so repeated calls within the same render pass
 * (index page, generateStaticParams, generateMetadata, and the page itself
 * each call these) hit the filesystem once instead of once per call site.
 */
export const getArticles = cache((): ArticleMeta[] => {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const { data } = matter(fs.readFileSync(path.join(ARTICLES_DIR, f), "utf8"));
      return {
        slug,
        title: String(data.title ?? slug),
        date: String(data.date ?? ""),
        category: String(data.category ?? "Update"),
        excerpt: String(data.excerpt ?? ""),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
});

export const getArticle = cache((slug: string): Article | null => {
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  if (!fs.existsSync(file) || path.basename(file).startsWith("_")) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    category: String(data.category ?? "Update"),
    excerpt: String(data.excerpt ?? ""),
    html: marked.parse(content, { async: false }) as string,
  };
});

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
