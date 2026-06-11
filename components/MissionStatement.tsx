import { mission } from "@/lib/content";
import { Reveal } from "./Reveal";

export function MissionStatement() {
  return (
    <section
      id="mission"
      className="relative overflow-hidden border-t border-line bg-ink-900 py-24 md:py-36"
    >
      <div className="container-site">
        <Reveal>
          <p className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-white/25" aria-hidden="true" />
            {mission.eyebrow}
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="mt-8 max-w-5xl text-2xl font-medium leading-[1.3] tracking-[-0.01em] text-white sm:text-3xl md:text-[2.6rem] md:leading-[1.25]">
            {mission.statement}
          </p>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
          {mission.pillars.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 0.1}
              className="bg-ink-900 p-8 md:p-9"
            >
              <span className="text-[11px] tabular-nums tracking-wide text-muted-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {p.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {p.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
