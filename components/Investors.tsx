import { company, investors } from "@/lib/content";
import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";

export function Investors() {
  return (
    <section
      id="investors"
      className="border-t border-line bg-black py-24 md:py-32"
    >
      <div className="container-site">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <Eyebrow>{investors.eyebrow}</Eyebrow>
              <h2 className="display mt-5 text-3xl sm:text-4xl lg:text-[3.25rem]">
                {investors.heading}
              </h2>
              <p className="body-copy mt-6 max-w-md">{investors.body}</p>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
              {investors.partners.map((p, i) => (
                <Reveal
                  key={p.title}
                  delay={(i % 2) * 0.08}
                  className="bg-ink-900 p-7"
                >
                  <h3 className="text-base font-semibold text-white">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {p.body}
                  </p>
                </Reveal>
              ))}
              {/* Balancing CTA cell to complete the grid. */}
              <Reveal delay={0.08} className="flex bg-white p-7 text-black">
                <a
                  href="#contact"
                  className="flex w-full flex-col justify-between"
                >
                  <h3 className="text-base font-semibold">Enquiries</h3>
                  <span className="mt-6 inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide">
                    Contact MineralX
                    <span aria-hidden="true">→</span>
                  </span>
                </a>
              </Reveal>
            </div>
          </div>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-12 max-w-3xl border-l-2 border-line-strong pl-5 text-xs leading-relaxed text-muted-dim">
            {company.disclaimer}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
