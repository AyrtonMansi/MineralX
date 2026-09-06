import Link from "next/link";
import { hero } from "@/lib/content";
import { TerrainBackground } from "./TerrainBackground";
import { ArrowRight } from "./icons";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-screen-dyn items-end overflow-hidden pb-16 pt-36 md:pb-24 md:pt-44"
    >
      <TerrainBackground />
      <div className="container-site relative z-10 w-full">
        <div className="max-w-4xl">
          <p className="eyebrow text-white/75">
            Australian resources. A broader ambition.
          </p>
          <h1 className="display mt-6 max-w-4xl text-[clamp(2.5rem,6.3vw,5.6rem)]">
            Advancing resources.
            <br />
            Building industry.
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            {hero.supporting}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Link href={hero.cta.href} className="btn btn-ghost group">
              {hero.cta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/company"
              className="py-3 text-[11px] uppercase tracking-wide text-white/80 underline decoration-white/30 underline-offset-8 hover:text-white"
            >
              Discover MineralX
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
