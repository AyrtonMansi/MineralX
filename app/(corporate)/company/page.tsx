import {
  Headline,
  PageIntro,
  PartnerCTA,
  SectionMark,
  TextLink,
  revealDelay,
} from "@/components/Corporate";
import { company, photos, principles, themes } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata(
  "Company",
  company.description,
  "/company",
);
export default function CompanyPage() {
  const facts: Array<[string, React.ReactNode]> = [
    ["Registered name", company.legalName],
    ["ABN", company.abn],
    ["Based", company.base.place],
    ["Focus", themes.map((t) => t.title).join(" · ")],
    [
      "Enquiries",
      <a key="e" href={`mailto:${company.email}`} className="link-draw hover:text-white">
        {company.email}
      </a>,
    ],
  ];
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        label="The company"
        title="An Australian foundation."
        accent="A broader future."
        intro={company.description}
        photo={photos.ranges}
      />

      <section className="py-28 md:py-40">
        <div className="container-site">
          <div data-reveal="">
            <SectionMark>Who we are</SectionMark>
            <Headline
              text="Building from the resource"
              accent="forward."
              className="t-display-lg mt-10 max-w-4xl"
            />
          </div>
          <div className="mt-16 grid gap-12 md:mt-24 md:grid-cols-12">
            <p data-reveal="" className="t-lead md:col-span-6">
              MineralX is an Australian resources company with roots in
              Queensland and a broader ambition for the role resources can play
              in industry. Mining and mineral development form the foundation of
              that direction.
            </p>
            <div
              data-reveal=""
              style={revealDelay(120)}
              className="space-y-6 md:col-span-5 md:col-start-8"
            >
              <p className="body-copy">
                We see opportunity in connecting the understanding of mineral
                resources with processing knowledge, applied research and
                commercial development. Our purpose is to turn that connection
                into enduring value.
              </p>
              <p className="body-copy">
                Our approach is selective and practical. We evaluate
                opportunities on their fundamentals, advance in stages and seek
                collaboration where specialist knowledge and shared direction
                can strengthen the outcome.
              </p>
              <div className="pt-2">
                <TextLink href="/direction">Our strategic direction</TextLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* A register, not marketing: the verifiable facts an investor looks for first. */}
      <section className="border-y border-line bg-ink-900 py-24 md:py-32">
        <div className="container-site grid gap-12 lg:grid-cols-12">
          <div data-reveal="" className="lg:col-span-4">
            <SectionMark>At a glance</SectionMark>
            <h2 className="t-display-md mt-10">Company details</h2>
          </div>
          <dl data-reveal="" style={revealDelay(100)} className="border-t border-line lg:col-span-8">
            {facts.map(([term, value]) => (
              <div
                key={term}
                className="grid gap-2 border-b border-line py-6 sm:grid-cols-[12rem_1fr] sm:gap-8"
              >
                <dt className="t-label pt-1">{term}</dt>
                <dd className="text-[17px] font-light text-white/90">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="py-28 md:py-40">
        <div className="container-site">
          <div data-reveal="">
            <SectionMark>How we work</SectionMark>
            <Headline
              text="A considered"
              accent="path forward."
              className="t-display-lg mt-10"
            />
          </div>
          <ol className="mt-16 border-t border-line md:mt-24">
            {principles.map((p, i) => (
              <li
                key={p.title}
                data-reveal=""
                style={revealDelay(i * 90)}
                className="grid gap-4 border-b border-line py-10 md:grid-cols-12 md:gap-8 md:py-14"
              >
                <h3 className="t-display-md md:col-span-6">{p.title}</h3>
                <p className="body-copy md:col-span-4 md:col-start-9 md:pt-3">
                  {p.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <PartnerCTA photo={photos.drillRig} />
    </main>
  );
}
