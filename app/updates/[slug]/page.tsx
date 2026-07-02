import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getArticle, getArticles, formatDate } from "@/lib/articles";

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return getArticles().map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const article = getArticle(params.slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: { title: article.title, description: article.excerpt },
  };
}

export default function ArticlePage({ params }: Props) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  return (
    <>
      <Navbar />
      <main className="bg-black">
        <article className="pb-20 pt-36 md:pb-28 md:pt-44">
          <div className="container-site">
            <div className="mx-auto max-w-3xl">
              <p className="eyebrow flex items-center gap-3">
                <span className="h-px w-8 bg-white/25" aria-hidden="true" />
                {article.category}
                {article.date && (
                  <>
                    <span className="text-muted-dim">·</span>
                    {formatDate(article.date)}
                  </>
                )}
              </p>
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
      <Footer />
    </>
  );
}
