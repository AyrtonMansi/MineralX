import { PageIntro, PartnerCTA, TextLink } from "@/components/Corporate";
import { company, principles } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata(
  "Company",
  company.description,
  "/company",
);
export default function CompanyPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        eyebrow="The company"
        title="An Australian foundation. A broader future."
        intro={company.description}
      />
      <section className="py-20 md:py-28">
        <div className="container-site grid gap-10 lg:grid-cols-12">
          <p className="eyebrow lg:col-span-4">Who we are</p>
          <div className="lg:col-span-8">
            <h2 className="text-2xl font-semibold md:text-3xl">
              Building from the resource forward.
            </h2>
            <p className="body-copy mt-6">
              MineralX is an Australian resources company with roots in
              Queensland and a broader ambition for the role resources can play
              in industry. Mining and mineral development form the foundation of
              that direction.
            </p>
            <p className="body-copy mt-5">
              We see opportunity in connecting the understanding of mineral
              resources with processing knowledge, applied research and
              commercial development. Our purpose is to turn that connection
              into enduring value.
            </p>
            <p className="body-copy mt-5">
              Our approach is selective and practical. We evaluate opportunities
              on their fundamentals, advance in stages and seek collaboration
              where specialist knowledge and shared direction can strengthen the
              outcome.
            </p>
            <div className="mt-7">
              <TextLink href="/direction">Our strategic direction</TextLink>
            </div>
          </div>
        </div>
      </section>
      <section className="border-t border-line py-20 md:py-28">
        <div className="container-site">
          <p className="eyebrow">How we work</p>
          <h2 className="display mt-5 text-3xl md:text-5xl">
            A considered path forward.
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {principles.map((p) => (
              <article key={p.title} className="border-t border-line pt-7">
                <h3 className="text-xl font-semibold">{p.title}</h3>
                <p className="body-copy mt-4">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <PartnerCTA />
    </main>
  );
}
