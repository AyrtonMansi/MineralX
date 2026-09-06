import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "./icons";

export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-white underline decoration-white/25 underline-offset-8 hover:decoration-white"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
export function PageIntro({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <section className="border-b border-line pb-16 pt-36 md:pb-24 md:pt-48">
      <div className="container-site">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-6 max-w-4xl text-4xl sm:text-5xl lg:text-7xl">
          {title}
        </h1>
        <p className="body-copy mt-7 max-w-2xl md:text-lg">{intro}</p>
      </div>
    </section>
  );
}
export function PartnerCTA() {
  return (
    <section className="border-t border-line py-20 md:py-28">
      <div className="container-site flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Build with MineralX</p>
          <h2 className="display mt-5 max-w-2xl text-3xl md:text-5xl">
            Progress starts with
            <br />a conversation.
          </h2>
          <p className="body-copy mt-6 max-w-xl">
            Connect with us about investment, strategic collaboration and
            technical or industrial partnerships.
          </p>
        </div>
        <Link href="/contact" className="btn btn-ghost">
          Contact MineralX <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
