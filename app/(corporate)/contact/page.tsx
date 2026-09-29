import Link from "next/link";
import { PageIntro, SectionMark, revealDelay } from "@/components/Corporate";
import { company, partnerTypes, enquiryHref } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { ArrowRight } from "@/components/icons";
export const metadata = pageMetadata(
  "Contact",
  "Contact MineralX for investment, partnership and corporate enquiries.",
  "/contact",
);
export default function ContactPage() {
  const enquiries = [
    ...partnerTypes.map((p) => ({ title: p.title, subject: p.subject })),
    { title: "General & corporate enquiries", subject: "Corporate enquiry" },
  ];
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        label="Contact"
        title="Let’s move"
        accent="forward."
        intro="For investment, partnership and corporate enquiries, connect with MineralX."
      />
      <section className="py-24 md:py-36">
        <div className="container-site grid gap-20 lg:grid-cols-12">
          <div data-reveal="" className="lg:col-span-5">
            <SectionMark>Email MineralX</SectionMark>
            <h2 className="sr-only">Email address</h2>
            <a
              href={enquiryHref()}
              className="link-draw mt-10 inline-block break-all text-[clamp(1.5rem,1rem+2vw,2.5rem)] font-light tracking-[-0.02em] text-white"
            >
              {company.email}
            </a>
            <p className="body-copy mt-8 max-w-md">
              Select an enquiry to open an email draft, or write directly to
              this address. Include your name, organisation and a short
              introduction.
            </p>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-muted-dim">
              Email links open your email application. Review and send your
              message there to complete your enquiry.
            </p>
            <div className="mt-14 border-t border-line pt-8">
              <h2 className="t-label">{company.postal.label}</h2>
              <address className="mt-5 text-[15px] not-italic leading-[1.8] text-muted">
                <span className="block text-white/85">{company.legalName}</span>
                <span className="block">ABN {company.abn}</span>
                {company.postal.lines.map((l) => (
                  <span className="block" key={l}>
                    {l}
                  </span>
                ))}
              </address>
            </div>
          </div>
          <div data-reveal="" style={revealDelay(100)} className="lg:col-span-6 lg:col-start-7">
            <SectionMark>Enquiries</SectionMark>
            <h2 className="t-display-md mt-10">What would you like to discuss?</h2>
            <ul className="mt-12 border-t border-line">
              {enquiries.map((p, i) => (
                <li key={p.subject}>
                  <a
                    href={enquiryHref(p.subject)}
                    className="group grid min-h-20 grid-cols-[1fr_auto] items-center border-b border-line py-6 transition-colors duration-500 hover:bg-white/[0.03] md:px-3"
                  >
                    <span>
                      <span className="block text-[17px] text-white">
                        {p.title}
                      </span>
                      <span className="mt-1.5 block font-medium text-[10.5px] uppercase tracking-label text-white/50">
                        Open email draft
                      </span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-white/70 transition-transform duration-500 ease-out group-hover:translate-x-1 group-hover:text-white" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[13px] leading-relaxed text-muted-dim">
              Read our{" "}
              <Link href="/privacy" className="link-draw text-white/70 hover:text-white">
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
