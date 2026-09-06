import Link from "next/link";
import { PageIntro } from "@/components/Corporate";
import { company, partnerTypes, enquiryHref } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { ArrowRight } from "@/components/icons";
export const metadata = pageMetadata(
  "Contact",
  "Contact MineralX for investment, partnership and corporate enquiries.",
  "/contact",
);
export default function ContactPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        eyebrow="Contact"
        title="Let’s move forward."
        intro="For investment, partnership and corporate enquiries, connect with MineralX."
      />
      <section className="py-16 md:py-24">
        <div className="container-site grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="eyebrow">Email MineralX</h2>
            <a
              href={enquiryHref()}
              className="mt-5 inline-block break-all py-2 text-xl font-medium underline decoration-white/30 underline-offset-8 sm:text-2xl"
            >
              {company.email}
            </a>
            <p className="body-copy mt-5 max-w-md">
              Select an enquiry below to open an email draft, or write directly
              to this address. Include your name, organisation and a short
              introduction.
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
              Email links open your email application. Review and send your
              message there to complete your enquiry.
            </p>
            <div className="mt-10 border-t border-line pt-7">
              <h2 className="eyebrow">{company.postal.label}</h2>
              <address className="mt-4 text-sm not-italic leading-relaxed text-muted">
                {company.postal.lines.map((l) => (
                  <span className="block" key={l}>
                    {l}
                  </span>
                ))}
              </address>
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <h2 className="text-xl font-semibold">
              What would you like to discuss?
            </h2>
            <div className="mt-7 divide-y divide-line border-y border-line">
              {[
                ...partnerTypes.map((p) => ({
                  title: p.title,
                  subject: p.subject,
                })),
                {
                  title: "General & corporate enquiries",
                  subject: "Corporate enquiry",
                },
              ].map((p) => (
                <a
                  key={p.subject}
                  href={enquiryHref(p.subject)}
                  className="group flex min-h-20 items-center justify-between gap-5 py-6"
                >
                  <span>
                    <span className="block text-base font-medium">
                      {p.title}
                    </span>
                    <span className="mt-2 block text-xs text-muted">
                      Open email draft
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
                </a>
              ))}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-muted">
              Read our{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                privacy notice
              </Link>{" "}
              for information about this website and contact enquiries.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
