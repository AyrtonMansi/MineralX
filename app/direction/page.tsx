import { PageIntro, PartnerCTA } from "@/components/Corporate";
import { themes } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata(
  "Our direction",
  "MineralX’s direction across Australian resources, applied research, mineral processing and industrial development.",
  "/direction",
);
export default function DirectionPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        eyebrow="Our direction"
        title="From mineral potential to industrial possibility."
        intro="A connected direction across mining, research and industrial development. Each strengthens our understanding of how resources can create lasting value."
      />
      <div className="container-site">
        {themes.map((t) => (
          <section
            id={t.id}
            key={t.id}
            className="grid gap-6 border-b border-line py-16 last:border-0 md:grid-cols-12 md:gap-10 md:py-20"
          >
            <p className="eyebrow md:col-span-2">{t.index} / Direction</p>
            <div className="md:col-span-4">
              <h2 className="text-2xl font-semibold md:text-3xl">{t.title}</h2>
            </div>
            <div className="md:col-span-6">
              <p className="text-lg leading-relaxed text-white/90">{t.body}</p>
              <p className="body-copy mt-5">{t.detail}</p>
            </div>
          </section>
        ))}
      </div>
      <section className="border-t border-line bg-ink-900 py-20">
        <div className="container-site grid gap-8 lg:grid-cols-2">
          <h2 className="display text-3xl md:text-4xl">
            Connected by purpose.
            <br />
            Advanced in stages.
          </h2>
          <p className="body-copy max-w-xl">
            These themes form one corporate direction. We build progressively,
            connecting technical learning with commercial judgement and
            directing investment towards the next meaningful step.
          </p>
        </div>
      </section>
      <PartnerCTA />
    </main>
  );
}
