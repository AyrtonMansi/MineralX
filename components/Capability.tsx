import { capability } from "@/lib/content";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

export function Capability() {
  return (
    <section
      id="capability"
      className="border-t border-line bg-ink-900 py-24 md:py-32"
    >
      <div className="container-site">
        <SectionHeading
          eyebrow={capability.eyebrow}
          heading={capability.heading}
          intro={capability.intro}
        />

        <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {capability.items.map((item, i) => (
            <Reveal
              key={item.title}
              delay={(i % 3) * 0.08}
              className="bg-black p-8 transition-colors duration-500 hover:bg-ink-800"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-[11px] tabular-nums text-muted-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-base font-semibold text-white">
                  {item.title}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
