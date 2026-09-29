import Link from "next/link";
import type { ReactNode } from "react";
import type { Photo as PhotoData } from "@/lib/content";
import { ArrowRight } from "./icons";
import { Photo, PhotoCaption } from "./Photo";

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
  photo,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  photo?: PhotoData;
}) {
  if (photo) {
    return (
      <section className="relative isolate flex min-h-[78svh] items-end overflow-hidden border-b border-line pb-16 pt-36 md:pb-24">
        <div className="absolute inset-0 -z-10 bg-black">
          <Photo
            photo={photo}
            priority
            decorative
            className="animate-drift object-[center_68%] will-change-transform"
          />
          {/* Copy sits bottom-left: darken there, let the photo carry the right. */}
          <div className="absolute inset-0 bg-black/15" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/45 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/75 to-transparent" />
        </div>
        <div className="container-site flex w-full flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow text-white/70">{eyebrow}</p>
            <h1 className="display mt-6 max-w-2xl text-[28px] md:text-[40px]">
              {title}
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
              {intro}
            </p>
          </div>
          <PhotoCaption>{photo.caption}</PhotoCaption>
        </div>
      </section>
    );
  }
  return (
    <section className="border-b border-line pb-16 pt-36 md:pb-24 md:pt-48">
      <div className="container-site">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-6 max-w-2xl text-[28px] md:text-[36px]">
          {title}
        </h1>
        <p className="body-copy mt-7 max-w-2xl md:text-lg">{intro}</p>
      </div>
    </section>
  );
}
export function PartnerCTA({ photo }: { photo?: PhotoData }) {
  return (
    <section className="relative isolate overflow-hidden border-t border-line py-24 md:py-36">
      {photo && (
        <div className="absolute inset-0 -z-10 bg-black">
          <Photo photo={photo} decorative className="object-[center_70%]" />
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/5" />
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black to-transparent" />
        </div>
      )}
      <div className="container-site flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Build with MineralX</p>
          <h2 className="display mt-5 max-w-2xl text-2xl md:text-[28px]">
            Progress starts with a conversation.
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
