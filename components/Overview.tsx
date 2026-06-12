import { overview } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Overview() {
  return (
    <section
      id="overview"
      className="border-t border-line bg-black py-24 md:py-32"
    >
      <div className="container-site">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="eyebrow flex items-center gap-3">
                <span className="h-px w-8 bg-white/25" aria-hidden="true" />
                {overview.eyebrow}
              </p>
              <h2 className="display mt-5 text-3xl sm:text-4xl lg:text-[2.6rem]">
                {overview.heading}
              </h2>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <Reveal delay={0.1}>
              <p className="text-lg leading-relaxed text-white/80 md:text-xl">
                {overview.lead}
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="mt-8 border-l-2 border-line-strong pl-6">
                <p className="eyebrow">Our mission</p>
                <p className="mt-3 text-base leading-relaxed text-white/90 md:text-lg">
                  {overview.mission}
                </p>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Credentials */}
        <Reveal delay={0.1}>
          <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-4">
            {overview.credentials.map((c) => (
              <div key={c.label} className="bg-ink-900 p-5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-dim">
                  {c.label}
                </dt>
                <dd className="mt-2 text-sm font-medium text-white">
                  {c.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* Build / Advance / Deliver pillars */}
        <div className="mt-14 grid gap-10 border-t border-line pt-12 md:grid-cols-3">
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
