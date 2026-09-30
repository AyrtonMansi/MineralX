import { Fragment } from "react";
import {
  Figure,
  Headline,
  PageIntro,
  PartnerCTA,
  SectionMark,
  SideFigure,
  revealDelay,
} from "@/components/Corporate";
import { photos, stages, themes } from "@/lib/content";
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
        label="Our direction"
        title="From mineral potential"
        accent="to industrial possibility."
        intro="A connected direction across mining, research and industrial development. Each strengthens our understanding of how resources can create lasting value."
        plain
      />

      {themes.map((t, i) => (
        <Fragment key={t.id}>
          <section
            id={t.id}
            className="border-b border-line py-24 md:py-36"
            aria-labelledby={`${t.id}-title`}
          >
            <div className="container-site grid gap-8 md:grid-cols-12 md:gap-10">
              <h2
                id={`${t.id}-title`}
                data-reveal=""
                className="t-display-md md:col-span-5"
              >
                {t.title}
              </h2>
              <div data-reveal="" style={revealDelay(100)} className="md:col-span-6 md:col-start-7">
                <p className="t-lead text-white/85">{t.body}</p>
                <p className="body-copy mt-6 max-w-2xl">{t.detail}</p>
              </div>
            </div>
          </section>
          {i === 0 && <Figure photo={photos.landscape} height="band" />}
          {i === 1 && <SideFigure photo={photos.haulage} />}
        </Fragment>
      ))}

      <section className="bg-ink-900 py-28 md:py-40">
        <div className="container-site">
          <div className="grid gap-12 lg:grid-cols-12">
            <div data-reveal="" className="lg:col-span-7">
              <SectionMark>How it comes together</SectionMark>
              <Headline
                text="Connected by purpose."
                accent="Advanced in stages."
                className="t-display-lg mt-10"
              />
            </div>
            <p
              data-reveal=""
              style={revealDelay(100)}
              className="t-lead self-end lg:col-span-4 lg:col-start-9"
            >
              These themes form one corporate direction. We build progressively,
              connecting technical learning with commercial judgement and
              directing investment towards the next meaningful step.
            </p>
          </div>

          {/* The staged approach as a sequence: a rule with a node per stage,
              horizontal from md up, vertical on phones. */}
          <ol className="relative mt-20 grid gap-12 md:mt-28 md:grid-cols-3 md:gap-10">
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-[5px] top-2 w-px bg-white/15 md:bottom-auto md:left-0 md:right-0 md:top-[5px] md:h-px md:w-auto"
            />
            {stages.map((s, i) => (
              <li
                key={s.title}
                data-reveal=""
                style={revealDelay(i * 140)}
                className="relative pl-10 md:pl-0 md:pt-12"
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1 h-[11px] w-[11px] rounded-full border border-ore bg-ink-900 md:top-0"
                />
                <h3 className="t-title">{s.title}</h3>
                <p className="body-copy mt-3 max-w-xs">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <PartnerCTA photo={photos.ranges} />
    </main>
  );
}
