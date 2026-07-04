type Props = {
  children: React.ReactNode;
  /** Leading hairline colour — most sections use a dim line; the hero/section
   * break sit over imagery and use a brighter one for contrast. */
  tone?: "default" | "bright";
  className?: string;
};

/**
 * Tracked uppercase label with a leading hairline, used to introduce every
 * section and article. Single source of truth for this markup — previously
 * hand-duplicated across six call sites.
 */
export function Eyebrow({ children, tone = "default", className }: Props) {
  return (
    <p
      className={`eyebrow flex items-center gap-3${className ? ` ${className}` : ""}`}
    >
      <span
        className={`h-px w-8 ${tone === "bright" ? "bg-white/40" : "bg-white/25"}`}
        aria-hidden="true"
      />
      {children}
    </p>
  );
}
