import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getArticles, formatDate } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Updates",
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
      <Navbar />
      <main className="bg-black">
        <section className="border-b border-line pb-16 pt-36 md:pb-20 md:pt-44">
          <div className="container-site">
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-white/25" aria-hidden="true" />
              MineralX Resources
            </p>
            <h1 className="display mt-5 text-4xl sm:text-5xl lg:text-6xl">
              Updates
            </h1>
            <p className="body-copy mt-5 max-w-xl">
              Company updates and announcements.
            </p>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="container-site">
            {articles.length === 0 ? (
              <p className="max-w-md text-sm leading-relaxed text-muted">
                Updates will be published here.
              </p>
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
                      <h2 className="text-xl font-semibold text-white transition-opacity group-hover:opacity-75 md:text-2xl">
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
      <Footer />
    </>
  );
}
