import { PageIntro, TextLink } from "@/components/Corporate";
import { company, partnerTypes } from "@/lib/content";
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
        eyebrow="Investors & partnerships"
        title="Build on shared ambition."
        intro="We welcome conversations with investors, industry partners and organisations aligned with the responsible development of Australian resources and industrial capability."
      />
      <section className="py-20 md:py-28">
        <div className="container-site grid gap-10 md:grid-cols-3">
          {partnerTypes.map((p, i) => (
            <article key={p.title} className="border-t border-line pt-7">
              <p className="eyebrow">0{i + 1}</p>
              <h2 className="mt-7 text-xl font-medium">{p.title}</h2>
              <p className="body-copy mt-5">{p.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-t border-line py-20 md:py-28">
        <div className="container-site grid gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Start a conversation</p>
            <h2 className="display mt-5 text-2xl md:text-[28px]">
              The right connection moves things forward.
            </h2>
          </div>
          <div>
            <p className="body-copy">
              Tell us about your organisation, the area of shared interest and
              the expertise or perspective you bring. A concise introduction
              helps us understand the opportunity for alignment.
            </p>
            <p className="body-copy mt-5">
              We value a clear purpose, complementary strengths and a practical
              view of what can be achieved together.
            </p>
            <div className="mt-7">
              <TextLink href="/contact">Discuss a partnership</TextLink>
            </div>
            <p className="mt-8 text-xs leading-relaxed text-muted">
              {company.disclaimer}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
