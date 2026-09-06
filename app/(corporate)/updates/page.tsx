import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/Eyebrow";
import { getArticles, formatDate } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Updates",
  robots: { index: getArticles().length > 0, follow: true },
  description: "Company updates and announcements from MineralX Resources.",
  alternates: { canonical: "/updates" },
  openGraph: {
    title: "Updates — MineralX Resources",
    description: "Company updates and announcements from MineralX Resources.",
    url: "/updates",
  },
};

export default function UpdatesPage() {
  const articles = getArticles();

  return (
    <>
      <main id="main-content" tabIndex={-1} className="bg-black">
        <section className="border-b border-line pb-16 pt-36 md:pb-20 md:pt-44">
          <div className="container-site">
            <Eyebrow>MineralX Resources</Eyebrow>
            <h1 className="display mt-5 text-[28px] md:text-[36px]">Updates</h1>
            <p className="body-copy mt-5 max-w-xl">
              Company updates and announcements.
            </p>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="container-site">
            {articles.length === 0 ? (
              <div className="max-w-xl">
                <h2 className="text-xl font-medium">Explore MineralX</h2>
                <p className="body-copy mt-4">
                  For an introduction to the company and our broader ambition,
                  explore our direction or contact the team.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link className="btn btn-ghost" href="/direction">
                    Our direction
                  </Link>
                  <Link className="btn btn-ghost" href="/contact">
                    Contact MineralX
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-line border-y border-line">
                {articles.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/updates/${a.slug}`}
                    className="group grid gap-3 py-8 transition-colors md:grid-cols-12 md:gap-8"
                  >
                    <div className="md:col-span-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-dim">
                        {a.category}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {formatDate(a.date)}
                      </p>
                    </div>
                    <div className="md:col-span-9">
                      <h2 className="text-xl font-medium text-white transition-opacity group-hover:opacity-75 md:text-2xl">
                        {a.title}
                      </h2>
                      {a.excerpt && (
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                          {a.excerpt}
                        </p>
                      )}
                      <span className="mt-4 inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/80">
                        Read update
                        <span
                          aria-hidden="true"
                          className="transition-transform duration-300 group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
