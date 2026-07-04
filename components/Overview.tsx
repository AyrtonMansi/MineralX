import { overview } from "@/lib/content";
import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";

export function Overview() {
  return (
    <section
      id="overview"
      className="border-t border-line bg-black py-24 md:py-32"
    >
      <div className="container-site">
        <Reveal>
          <Eyebrow>{overview.eyebrow}</Eyebrow>
          <p className="mt-6 max-w-3xl text-lg font-medium leading-relaxed text-white md:text-2xl md:leading-[1.4]">
            {overview.mission}
          </p>
        </Reveal>

        {/* Build / Advance / Deliver pillars */}
        <div className="mt-16 grid gap-10 border-t border-line pt-12 md:grid-cols-3">
          {overview.pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.1}>
              <span className="text-[11px] tabular-nums tracking-wide text-muted-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {p.title}
              </h3>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
                {p.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
