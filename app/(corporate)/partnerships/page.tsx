import {
  Headline,
  PageIntro,
  SectionMark,
  TextLink,
  revealDelay,
} from "@/components/Corporate";
import { ArrowRight } from "@/components/icons";
import {
  company,
  enquiryHref,
  partnerTypes,
  partnershipQualities,
} from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata(
  "Partnerships",
  "Engage with MineralX about investment, strategic collaboration and technical or industrial partnerships.",
  "/partnerships",
);
export default function PartnershipsPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        label="Investors & partnerships"
        title="Build on"
        accent="shared ambition."
        intro="We welcome conversations with investors, industry partners and organisations aligned with the responsible development of Australian resources and industrial capability."
        plain
      />

      <section className="py-28 md:py-40">
        <div className="container-site">
          <div data-reveal="">
            <SectionMark>Who we work with</SectionMark>
            <h2 className="t-display-lg mt-10">Three kinds of partner.</h2>
          </div>
          <ul className="mt-16 border-t border-line md:mt-24">
            {partnerTypes.map((p, i) => (
              <li key={p.title} data-reveal="" style={revealDelay(i * 90)}>
                <a
                  href={enquiryHref(p.subject)}
                  aria-label={`${p.title}: open an email draft`}
                  className="group grid gap-4 border-b border-line py-10 transition-colors duration-500 hover:bg-white/[0.03] md:grid-cols-12 md:items-baseline md:gap-8 md:px-4 md:py-14"
                >
                  <h3 className="t-display-md md:col-span-5">{p.title}</h3>
                  <p className="body-copy md:col-span-5">{p.body}</p>
                  <span className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-label text-white/70 transition-colors group-hover:text-white md:col-span-2 md:justify-end">
                    Enquire
                    <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-out group-hover:translate-x-1" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line bg-ink-900 py-28 md:py-40">
        <div className="container-site grid gap-14 lg:grid-cols-12">
          <div data-reveal="" className="lg:col-span-6">
            <SectionMark>Start a conversation</SectionMark>
            <Headline
              text="The right connection"
              accent="moves things forward."
              className="t-display-lg mt-10"
            />
          </div>
          <div data-reveal="" style={revealDelay(100)} className="lg:col-span-5 lg:col-start-8 lg:pt-20">
            <p className="t-lead">
              Tell us about your organisation, the area of shared interest and
              the expertise or perspective you bring. A concise introduction
              helps us understand the opportunity for alignment.
            </p>
            <p className="t-label mt-12">What we value</p>
            <ol className="mt-5 border-t border-line">
              {partnershipQualities.map((q, i) => (
                <li
                  key={q}
                  className="border-b border-line py-5 text-[16px] text-white/85"
                >
                  {q}
                </li>
              ))}
            </ol>
            <div className="mt-10">
              <TextLink href="/contact">Discuss a partnership</TextLink>
            </div>
            <p className="mt-12 text-[12px] leading-relaxed text-muted-dim">
              {company.disclaimer}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
