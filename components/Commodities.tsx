import { commodities } from "@/lib/content";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

export function Commodities() {
  return (
    <section
      id="commodities"
      className="border-t border-line bg-black py-24 md:py-32"
    >
      <div className="container-site">
        <SectionHeading
          eyebrow={commodities.eyebrow}
          heading={commodities.heading}
          intro={commodities.intro}
        />

        <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
          {commodities.items.map((item, i) => (
            <Reveal
              key={item.title}
              as="article"
              delay={i * 0.1}
              className="group flex flex-col bg-ink-900 p-8 transition-colors duration-500 hover:bg-ink-800 md:p-10"
            >
              <span className="flex h-20 w-20 items-center justify-center border border-line-strong text-2xl font-light tracking-tight text-white transition-colors duration-500 group-hover:border-white/45 group-hover:bg-white/[0.04]">
                {item.symbol}
              </span>
              <h3 className="mt-7 text-xl font-semibold text-white md:text-2xl">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
