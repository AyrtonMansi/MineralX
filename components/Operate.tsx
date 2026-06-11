import { operate } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Operate() {
  return (
    <section
      id="operate"
      className="relative overflow-hidden border-t border-line bg-black py-24 md:py-32"
    >
      {/* Faint contour map texture on the right to evoke the operating region. */}
      <div
        className="pointer-events-none absolute right-0 top-0 hidden h-full w-1/2 opacity-[0.16] lg:block"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 600 600"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <g stroke="rgba(255,255,255,0.5)" fill="none" strokeWidth="0.6">
            {Array.from({ length: 18 }).map((_, i) => (
              <ellipse
                key={i}
                cx={420}
                cy={300}
                rx={20 + i * 24}
                ry={(20 + i * 24) * 0.7}
                transform={`rotate(${i * 8} 420 300)`}
              />
            ))}
          </g>
        </svg>
      </div>

      <div className="container-site relative">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <p className="eyebrow flex items-center gap-3">
                <span className="h-px w-8 bg-white/25" aria-hidden="true" />
                {operate.eyebrow}
              </p>
              <h2 className="display mt-5 text-3xl sm:text-4xl lg:text-[2.6rem]">
                {operate.heading}
              </h2>
            </Reveal>

            <div className="mt-7 max-w-xl space-y-5">
              {operate.body.map((p, i) => (
                <Reveal key={i} delay={0.1 + i * 0.08}>
                  <p className="body-copy text-white/75">{p}</p>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 lg:pl-6">
            <Reveal delay={0.15}>
              <ul className="divide-y divide-line border-y border-line">
                {operate.attributes.map((attr) => (
                  <li
                    key={attr}
                    className="flex items-center gap-4 py-4 text-sm text-white/85"
                  >
                    <span
                      className="h-1 w-1 shrink-0 bg-white/50"
                      aria-hidden="true"
                    />
                    {attr}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
