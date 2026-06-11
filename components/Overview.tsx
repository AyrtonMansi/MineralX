import { overview } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Overview() {
  return (
    <section id="overview" className="border-t border-line bg-black py-24 md:py-32">
      <div className="container-site grid gap-14 lg:grid-cols-12 lg:gap-12">
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
            <p className="max-w-2xl text-lg leading-relaxed text-white/80 md:text-xl">
              {overview.body}
            </p>
          </Reveal>

          <Reveal delay={0.2}>
            <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-4">
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
        </div>
      </div>
    </section>
  );
}
