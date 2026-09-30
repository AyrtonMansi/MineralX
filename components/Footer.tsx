import Link from "next/link";
import { getArticles } from "@/lib/articles";
import { company, footer } from "@/lib/content";
import { BrandMark } from "./BrandMark";
import { InstagramIcon, LinkedInIcon } from "./icons";

export function Footer() {
  const year = new Date().getFullYear();
  const hasUpdates = getArticles().length > 0;
  const columns = footer.columns.map((column) =>
    column.title === "Connect"
      ? {
          ...column,
          links: [
            ...column.links,
            ...(hasUpdates ? [{ label: "Updates", href: "/updates" }] : []),
            { label: "Staff sign in", href: "/ops/login" },
          ],
        }
      : column,
  );
  // Placeholder ("#") social links are hidden until real URLs are configured.
  const socials = company.social.filter((s) => s.href && s.href !== "#");

  return (
    <footer className="border-t border-line bg-ink-900">
      <div className="container-site pb-14 pt-20 md:pt-28">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link
              href="/"
              aria-label={`${company.name} home`}
              className="inline-block py-2"
            >
              <BrandMark />
            </Link>
            <p className="mt-6 max-w-sm text-[15px] leading-[1.7] text-muted">
              {footer.blurb}
            </p>
            {socials.length > 0 && (
              <div className="mt-6 flex items-center gap-3">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="flex h-10 w-10 items-center justify-center border border-line text-muted transition-colors hover:border-white/40 hover:text-white"
                  >
                    {s.icon === "linkedin" ? (
                      <LinkedInIcon className="h-4 w-4" />
                    ) : (
                      <InstagramIcon className="h-4 w-4" />
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
            {columns.map((col) => (
              <nav key={col.title} aria-label={`${col.title} footer links`}>
                <p className="t-label">{col.title}</p>
                <ul className="mt-6 space-y-1">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-flex min-h-9 items-center text-[15px] text-white/70 transition-colors hover:text-white"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <div className="col-span-2 sm:col-span-1">
              <p className="t-label">Contact</p>
              <a
                href={`mailto:${company.email}`}
                className="link-draw mt-6 inline-block text-[15px] text-white/90 hover:text-white"
              >
                {company.email}
              </a>
              <address className="mt-7 border-t border-line pt-6 text-[14px] not-italic leading-[1.8] text-muted">
                <span className="block text-white/85">{company.legalName}</span>
                <span className="block">ABN {company.abn}</span>
                {company.postal.lines.map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </address>
            </div>
          </div>
        </div>

        <p className="mt-20 max-w-3xl text-[12px] leading-relaxed text-muted-dim">
          {company.disclaimer}
        </p>
      </div>

      <div className="border-t border-line">
        <div className="container-site flex flex-col gap-4 py-6 font-medium text-[10.5px] uppercase tracking-label text-white/50 md:flex-row md:items-center md:justify-between">
          <span>
            © {year} {company.legalName}{" "}
            <span className="block whitespace-nowrap md:inline">
              <span className="hidden md:inline">· </span>ABN {company.abn}
            </span>
          </span>
          <span className="whitespace-nowrap">
            {company.base.place} · {company.base.coordinates}
          </span>
          <a
            href="#top"
            className="inline-flex min-h-9 items-center self-start text-white/60 transition-colors hover:text-white md:self-auto"
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
