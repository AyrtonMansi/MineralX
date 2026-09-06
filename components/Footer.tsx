import Link from "next/link";
import { getArticles } from "@/lib/articles";
import { company, footer } from "@/lib/content";
import { InstagramIcon, LinkedInIcon } from "./icons";

export function Footer() {
  const year = new Date().getFullYear();
  const hasUpdates = getArticles().length > 0;
  const columns = footer.columns.map((column) =>
    column.title === "Connect"
      ? {
          ...column,
          links: [...column.links, ...(hasUpdates ? [{ label: "Updates", href: "/updates" }] : []), { label: "GIC login", href: "/gic/login" }],
        }
      : column,
  );
  // Placeholder ("#") social links are hidden until real URLs are configured.
  const socials = company.social.filter((s) => s.href && s.href !== "#");

  return (
    <footer className="border-t border-line bg-black">
      <div className="container-site py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link
              href="/"
              aria-label={`${company.name} home`}
              className="inline-block py-2 text-base font-semibold uppercase tracking-brand text-white"
            >
              {company.shortName}
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              {footer.blurb}
            </p>
            <div className="mt-6 flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center border border-line text-muted transition-colors hover:border-line-strong hover:text-white"
                >
                  {s.icon === "linkedin" ? (
                    <LinkedInIcon className="h-4 w-4" />
                  ) : (
                    <InstagramIcon className="h-4 w-4" />
                  )}
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <nav
              key={col.title}
              aria-label={`${col.title} footer links`}
              className="lg:col-span-2"
            >
              <p className="eyebrow">{col.title}</p>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="inline-block min-h-8 py-1 text-sm text-muted transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="lg:col-span-3">
            <p className="eyebrow">Contact</p>
            <a
              href={`mailto:${company.email}`}
              className="mt-5 block text-sm text-muted transition-colors hover:text-white"
            >
              {company.email}
            </a>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {company.postal.lines.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </p>
          </div>
        </div>

        <p className="mt-14 max-w-3xl text-[11px] leading-relaxed text-muted">
          {company.disclaimer}
        </p>
      </div>

      <div className="border-t border-line">
        <div className="container-site flex flex-col gap-3 py-6 text-[11px] uppercase tracking-wide text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {company.legalName} — All rights reserved
          </span>
          <span>Australian Resources Company</span>
        </div>
      </div>
    </footer>
  );
}
