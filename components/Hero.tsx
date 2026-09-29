import Link from "next/link";
import { company, hero } from "@/lib/content";
import { TerrainBackground } from "./TerrainBackground";
import { ArrowRight } from "./icons";

export function Hero() {
  // "Advancing resources. Building industry." → statement + serif-italic answer.
  const [lead, ...rest] = hero.heading.split(/(?<=\.)\s+/);
  return (
    <section
      id="top"
      className="relative isolate flex min-h-screen-dyn flex-col justify-end overflow-hidden pt-32"
    >
      <TerrainBackground />
      <div className="container-site w-full">
        <p className="t-label animate-fade-up text-white/70">
          Australian resources · A broader ambition
        </p>
        <h1 className="t-display-xl mt-8 max-w-5xl animate-fade-up [animation-delay:90ms]">
          {lead}
          <span className="t-accent">{rest.join(" ")}</span>
        </h1>
        <div className="mt-12 grid items-end gap-10 md:mt-16 md:grid-cols-12">
          <p className="t-lead max-w-xl animate-fade-up md:col-span-6 lg:col-span-5 [animation-delay:180ms]">
            {hero.supporting}
          </p>
          <div className="flex animate-fade-up flex-wrap items-center gap-x-8 gap-y-5 md:col-span-6 md:justify-end lg:col-span-7 [animation-delay:260ms]">
            <Link href={hero.cta.href} className="btn btn-primary">
              {hero.cta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/company"
              className="link-draw text-[11px] font-medium uppercase tracking-label text-white/85 hover:text-white"
            >
              Discover MineralX
            </Link>
          </div>
        </div>
      </div>
      <div className="container-site mt-14 w-full md:mt-20">
        <div className="flex items-center justify-between border-t border-white/15 py-5">
          <p className="t-label text-white/55">
            {company.base.place}
            <span className="ml-4 hidden sm:inline">{company.base.coordinates}</span>
          </p>
          <a
            href="#overview"
            className="group flex min-h-11 items-center gap-3 t-label text-white/60 transition-colors hover:text-white"
          >
            Scroll
            <span aria-hidden="true" className="relative block h-6 w-px overflow-hidden bg-white/20">
              <span className="absolute inset-x-0 top-0 h-full origin-top animate-scroll-cue bg-white/80" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
