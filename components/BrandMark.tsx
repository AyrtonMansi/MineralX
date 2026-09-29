import { company } from "@/lib/content";

/** "MINERALX | RESOURCES" lockup shared by the header, mobile menu and footer. */
export function BrandMark() {
  const [word, ...rest] = company.name.split(" ");
  return (
    <span className="flex items-center gap-3 leading-none">
      <span className="text-[15px] font-semibold uppercase tracking-brand text-white">
        {word}
      </span>
      <span aria-hidden="true" className="h-3.5 w-px bg-white/25" />
      <span className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/60">
        {rest.join(" ")}
      </span>
    </span>
  );
}
