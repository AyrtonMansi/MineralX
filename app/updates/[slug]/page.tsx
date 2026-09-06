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
        <article className="pb-20 pt-36 md:pb-28 md:pt-44">
          <div className="container-site">
            <div className="mx-auto max-w-3xl">
              <Eyebrow>
                {article.category}
                {article.date && (
                  <>
                    <span className="text-muted-dim">·</span>
                    {formatDate(article.date)}
                  </>
                )}
              </Eyebrow>
              <h1 className="mt-6 text-3xl font-bold leading-[1.1] tracking-[-0.01em] text-white sm:text-4xl lg:text-5xl">
                {article.title}
              </h1>

              <div
                className="article-body mt-10"
                dangerouslySetInnerHTML={{ __html: article.html }}
              />

              <div className="mt-14 border-t border-line pt-8">
                <Link
                  href="/updates"
                  className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-muted transition-colors hover:text-white"
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
