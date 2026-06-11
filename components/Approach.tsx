import { approach } from "@/lib/content";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

export function Approach() {
  return (
    <section
      id="approach"
      className="border-t border-line bg-ink-900 py-24 md:py-32"
    >
      <div className="container-site">
        <SectionHeading
          eyebrow={approach.eyebrow}
          heading={approach.heading}
          intro={approach.intro}
        />

        <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-2">
          {approach.items.map((item, i) => (
            <Reveal
              key={item.title}
              delay={(i % 2) * 0.08}
              className="bg-black p-8 transition-colors duration-500 hover:bg-ink-800 md:p-10"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-[11px] tabular-nums text-muted-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-lg font-semibold text-white">
                  {item.title}
                </h3>
              </div>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
