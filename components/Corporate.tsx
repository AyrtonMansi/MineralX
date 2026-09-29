import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { company, type Photo as PhotoData } from "@/lib/content";
import { ContourField } from "./ContourField";
import { ArrowRight } from "./icons";
import { Photo, PhotoCaption } from "./Photo";

export const revealDelay = (ms: number) =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

/**
 * Section title block: ore-coloured index, hairline, mono label — the site's
 * one recurring device, like the title block on a survey drawing.
 */
export function SectionMark({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-4 ${className}`}>
      <span aria-hidden="true" className="h-px w-10 bg-white/25" />
      <span className="t-label">{children}</span>
    </p>
  );
}

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
      className="link-draw group inline-flex min-h-11 items-center gap-3 text-[11px] font-medium uppercase tracking-label text-white"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-out group-hover:translate-x-1" />
    </Link>
  );
}

/** Headline with an optional serif-italic second phrase. */
export function Headline({
  as: Tag = "h2",
  text,
  accent,
  className,
}: {
  as?: "h1" | "h2";
  text: string;
  accent?: string;
  className: string;
}) {
  return (
    <Tag className={className}>
      {text}
      {accent && (
        <>
          {" "}
          <span className="t-accent">{accent}</span>
        </>
      )}
    </Tag>
  );
}

export function PageIntro({
  label,
  title,
  accent,
  intro,
  photo,
}: {
  label: string;
  title: string;
  accent?: string;
  intro: string;
  photo?: PhotoData;
}) {
  return (
    <section
      className={`relative isolate flex items-end overflow-hidden border-b border-line pb-14 pt-36 md:pb-20 ${photo ? "min-h-[86svh]" : "min-h-[64svh] md:min-h-[70svh]"}`}
    >
      <div className="absolute inset-0 -z-10 bg-black">
        {photo ? (
          <>
            <Photo
              photo={photo}
              priority
              decorative
              className="animate-drift object-[center_68%] will-change-transform"
            />
            {/* Copy sits bottom-left: darken there, let the photo carry the right. */}
            <div className="absolute inset-0 bg-black/15" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/55 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/75 to-transparent" />
          </>
        ) : (
          <ContourField className="animate-fade-in" />
        )}
      </div>
      <div className="container-site w-full">
        <p className="t-label animate-fade-up text-white/70">{label}</p>
        <Headline
          as="h1"
          text={title}
          accent={accent}
          className="t-display-xl mt-7 max-w-5xl animate-fade-up [animation-delay:80ms]"
        />
        <div className="mt-10 grid gap-8 border-t border-white/15 pt-7 md:mt-14 md:grid-cols-12">
          <p className="t-lead animate-fade-up md:col-span-7 lg:col-span-6 [animation-delay:160ms]">
            {intro}
          </p>
          {photo && (
            <div className="flex items-end md:col-span-5 md:justify-end lg:col-span-6">
              <PhotoCaption>{photo.caption}</PhotoCaption>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Full-bleed photograph used as a chapter break inside a page. */
export function Figure({ photo, height = "tall" }: { photo: PhotoData; height?: "tall" | "band" }) {
  return (
    <figure
      data-reveal-media=""
      className={`relative overflow-hidden border-y border-line bg-black ${height === "tall" ? "h-[70svh] min-h-[420px]" : "h-[48svh] min-h-[320px]"}`}
    >
      <Photo photo={photo} className="absolute inset-0 object-[center_80%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      <figcaption className="container-site absolute inset-x-0 bottom-6 md:bottom-8">
        <PhotoCaption>{photo.caption}</PhotoCaption>
      </figcaption>
    </figure>
  );
}

export function PartnerCTA({ photo }: { photo?: PhotoData }) {
  return (
    <section className="relative isolate overflow-hidden border-t border-line py-28 md:py-44">
      {photo && (
        <div data-reveal-media="" className="absolute inset-0 -z-10 bg-black">
          <Photo photo={photo} decorative className="object-[center_70%]" />
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-black/10" />
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black to-transparent" />
        </div>
      )}
      <div className="container-site grid gap-12 lg:grid-cols-12 lg:items-end">
        <div data-reveal="" className="lg:col-span-8">
          <SectionMark>Contact</SectionMark>
          <h2 className="t-display-lg mt-8">Work with MineralX.</h2>
          <p className="t-lead mt-8 max-w-xl">
            For investment, partnership and corporate enquiries, contact our
            team.
          </p>
        </div>
        <div
          data-reveal=""
          style={revealDelay(120)}
          className="flex flex-col items-start gap-5 lg:col-span-4 lg:items-end"
        >
          <Link href="/contact" className="btn btn-primary">
            Contact MineralX <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={`mailto:${company.email}`}
            className="link-draw text-[13px] text-white/70 hover:text-white"
          >
            {company.email}
          </a>
        </div>
      </div>
    </section>
  );
}
