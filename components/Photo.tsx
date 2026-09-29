import type { Photo as PhotoData } from "@/lib/content";

/**
 * Pre-sized WebP pair rather than next/image: the site already serves its hero
 * this way, and on-demand image optimisation is metered infrastructure.
 */
export function Photo({
  photo,
  sizes = "100vw",
  className = "",
  priority = false,
  decorative = false,
}: {
  photo: PhotoData;
  sizes?: string;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${photo.src}-2000.webp`}
      srcSet={`${photo.src}-1000.webp 1000w, ${photo.src}-2000.webp 2000w`}
      sizes={sizes}
      alt={decorative ? "" : photo.alt}
      width={2000}
      height={1125}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

export function PhotoCaption({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-white/60">
      <span aria-hidden="true" className="h-px w-6 bg-white/40" />
      {children}
    </p>
  );
}
