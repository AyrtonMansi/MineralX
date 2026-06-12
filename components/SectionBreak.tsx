import { sectionBreak } from "@/lib/content";
import { Reveal } from "./Reveal";

/**
 * Full-bleed cinematic section break.
 *
 * Drop an (unedited) drone shot at `sectionBreak.image` and the baked-in
 * treatment — desaturate, darken, contrast, charcoal tint, vignette and grain
 * — brings it in line with the dark theme automatically. With no image, a
 * tasteful dark gradient stands in so the band still reads as intentional.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function SectionBreak() {
  return (
    <section className="relative flex min-h-[68svh] items-end overflow-hidden border-t border-line bg-black">
      {sectionBreak.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sectionBreak.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full animate-drift object-cover object-bottom [filter:grayscale(0.85)_brightness(0.42)_contrast(1.15)_saturate(0.55)] will-change-transform"
        />
      ) : (
        <div className="absolute inset-0 animate-drift bg-[radial-gradient(120%_120%_at_50%_0%,#1b1b20,#0a0a0b_58%,#000_100%)] will-change-transform" />
      )}

      {/* Charcoal tint + vignette + edge fades to seat the copy */}
      <div className="absolute inset-0 bg-black/25 mix-blend-multiply" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(125%_95%_at_50%_40%,transparent_28%,rgba(0,0,0,0.6)_82%,#000_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/70 to-transparent" aria-hidden="true" />
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
        aria-hidden="true"
      />

      <div className="container-site relative z-10 pb-16 md:pb-20">
        <Reveal>
          <p className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-white/40" aria-hidden="true" />
            {sectionBreak.caption}
          </p>
          <p className="display mt-5 max-w-4xl text-3xl leading-[1.1] sm:text-4xl md:text-[3.25rem]">
            {sectionBreak.statement}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
