import Link from "next/link";
import { company, hero } from "@/lib/content";
import { TerrainBackground } from "./TerrainBackground";
import { ArrowRight } from "./icons";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-screen-dyn flex-col justify-end overflow-hidden pb-16 pt-32 md:pb-24"
    >
      <TerrainBackground />
      <div className="container-site w-full">
        <p className="t-label animate-fade-up text-white/70">
          Australian resources · A broader ambition
        </p>
        <h1 className="sr-only">{company.name}</h1>
        <div className="mt-8 grid items-end gap-10 md:grid-cols-12">
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
    </section>
  );
}
