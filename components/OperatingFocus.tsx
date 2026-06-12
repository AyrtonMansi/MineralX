import { operatingFocus } from "@/lib/content";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

export function OperatingFocus() {
  return (
    <section id="focus" className="border-t border-line bg-ink-900 py-24 md:py-32">
      <div className="container-site">
        <SectionHeading
          eyebrow={operatingFocus.eyebrow}
          heading={operatingFocus.heading}
          intro={operatingFocus.intro}
        />

        <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
          {operatingFocus.cards.map((card, i) => (
            <Reveal
              key={card.title}
              as="article"
              delay={i * 0.1}
              className="group flex min-h-[20rem] flex-col justify-between bg-black p-8 transition-colors duration-500 hover:bg-ink-800 md:p-10"
            >
              <span
                className="text-6xl font-extralight leading-none tracking-tight text-white/[0.13] transition-colors duration-500 [font-variant-numeric:tabular-nums] group-hover:text-white/25 md:text-7xl"
                aria-hidden="true"
              >
                {card.index}
              </span>
              <div>
                <h3 className="text-xl font-semibold text-white md:text-2xl">
                  {card.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {card.body}
                </p>
                <span className="mt-6 block h-px w-10 bg-white/20 transition-all duration-500 group-hover:w-20 group-hover:bg-white/50" />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
