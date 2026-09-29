import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/Eyebrow";
import { getArticle, getArticles, formatDate } from "@/lib/articles";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = getArticle((await params).slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/updates/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      url: `/updates/${article.slug}`,
      type: "article",
      publishedTime: article.date,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const article = getArticle((await params).slug);
  if (!article) notFound();

  return (
    <>
      <main id="main-content" tabIndex={-1} className="bg-black">
        <article className="pb-24 pt-40 md:pb-36 md:pt-52">
          <div className="container-site">
            <div className="mx-auto max-w-3xl">
              <Eyebrow>
                <span className="text-ore">{article.category}</span>
                {article.date && (
                  <>
                    <span className="text-muted-dim">·</span>
                    {formatDate(article.date)}
                  </>
                )}
              </Eyebrow>
              <h1 className="t-display-lg mt-8">{article.title}</h1>

              <div
                className="article-body mt-14"
                dangerouslySetInnerHTML={{ __html: article.html }}
              />

              <div className="mt-16 border-t border-line pt-8">
                <Link
                  href="/updates"
                  className="inline-flex min-h-11 items-center gap-2 text-[11px] font-medium uppercase tracking-label text-white/70 transition-colors hover:text-white"
                >
                  <span aria-hidden="true">←</span> All updates
                </Link>
              </div>
            </div>
          </div>
        </article>
      </main>
    </>
  );
}
