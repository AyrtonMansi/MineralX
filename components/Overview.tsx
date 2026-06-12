import { overview } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Overview() {
  return (
    <section
      id="overview"
      className="border-t border-line bg-black py-24 md:py-32"
    >
      <div className="container-site">
        <Reveal>
          <p className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-white/25" aria-hidden="true" />
            {overview.eyebrow}
          </p>
          <p className="mt-7 max-w-4xl text-2xl font-medium leading-[1.3] tracking-[-0.01em] text-white sm:text-3xl md:text-[2.5rem] md:leading-[1.25]">
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
