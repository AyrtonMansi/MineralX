import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, SectionMark } from "@/components/Corporate";
import { ArrowRight } from "@/components/icons";
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
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        label="MineralX Resources"
        title="Updates"
        intro="Company updates and announcements."
      />
      <section className="py-20 md:py-32">
        <div className="container-site">
          {articles.length === 0 ? (
            <div className="grid gap-10 md:grid-cols-12">
              <div className="md:col-span-5">
                <SectionMark>No updates published</SectionMark>
                <h2 className="t-display-md mt-10">Explore MineralX</h2>
              </div>
              <div className="md:col-span-6 md:col-start-7">
                <p className="t-lead">
                  For an introduction to the company and our broader ambition,
                  explore our direction or contact the team.
                </p>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Link className="btn btn-ghost" href="/direction">
                    Our direction
                  </Link>
                  <Link className="btn btn-ghost" href="/contact">
                    Contact MineralX
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <ul className="border-t border-line">
              {articles.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/updates/${a.slug}`}
                    className="group grid gap-4 border-b border-line py-10 transition-colors duration-500 hover:bg-white/[0.03] md:grid-cols-12 md:gap-8 md:px-4"
                  >
                    <div className="md:col-span-3">
                      <p className="t-label text-ore">{a.category}</p>
                      <p className="mt-3 font-medium text-[12px] text-white/60">
                        {formatDate(a.date)}
                      </p>
                    </div>
                    <div className="md:col-span-8">
                      <h2 className="t-display-md">{a.title}</h2>
                      {a.excerpt && (
                        <p className="body-copy mt-4 max-w-2xl">{a.excerpt}</p>
                      )}
                      <span className="mt-6 inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-label text-white/75 group-hover:text-white">
                        Read update
                        <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-out group-hover:translate-x-1" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
