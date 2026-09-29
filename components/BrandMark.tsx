import { company } from "@/lib/content";

/** The X mark from the X brand concept (D01), traced from the source vector. */
export function XMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 471.95 367.16"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <path d="M251.14 221.89L471.32 1.71C471.95 1.08 471.50 0.00 470.61 0.00L369.75 0.00C367.40 0.00 365.15 0.93 363.48 2.60L242.25 123.83C238.78 127.30 233.17 127.30 229.71 123.83L108.47 2.60C106.80 0.93 104.55 0.00 102.20 0.00L1.34 0.00C0.45 0.00 0.00 1.08 0.63 1.71L126.46 127.53C128.12 129.20 130.38 130.13 132.73 130.13L214.54 130.13C222.44 130.13 226.40 139.68 220.81 145.27L0.63 365.45C0.00 366.08 0.45 367.16 1.34 367.16L102.20 367.16C104.55 367.16 106.80 366.22 108.47 364.56L229.71 243.32C233.17 239.86 238.78 239.86 242.25 243.32L363.48 364.56C365.15 366.22 367.40 367.16 369.75 367.16L470.61 367.16C471.50 367.16 471.95 366.08 471.32 365.45L345.49 239.62C343.83 237.96 341.58 237.03 339.22 237.03L257.41 237.03C249.51 237.03 245.55 227.47 251.14 221.89Z" />
    </svg>
  );
}

/** "MINERAL✕ | RESOURCES" lockup shared by the header, mobile menu and footer. */
export function BrandMark() {
  const [, ...rest] = company.name.split(" ");
  return (
    <span className="flex items-center gap-3 leading-none">
      <span className="sr-only">{company.name}</span>
      <span aria-hidden="true" className="flex items-center text-[15px] font-semibold uppercase tracking-brand text-white">
        Mineral
        {/* Cap-height of Inter at 15px; the tracking after "L" sets the gap. */}
        <XMark className="h-[11px] w-auto" />
      </span>
      <span aria-hidden="true" className="h-3.5 w-px bg-white/25" />
      <span aria-hidden="true" className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/60">
        {rest.join(" ")}
      </span>
    </span>
  );
}
