import { company, footer, investors } from "@/lib/content";
import { InstagramIcon, LinkedInIcon } from "./icons";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-black">
      <div className="container-site py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="text-base font-semibold uppercase tracking-brand text-white">
              {company.shortName}
            </span>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              {footer.blurb}
            </p>
            <div className="mt-6 flex items-center gap-3">
              {company.social.map((s) => (
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

          {footer.columns.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <p className="eyebrow">{col.title}</p>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="text-sm text-muted transition-colors hover:text-white"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
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

        <p className="mt-14 max-w-3xl text-[11px] leading-relaxed text-muted-dim">
          {investors.disclaimer}
        </p>
      </div>

      <div className="border-t border-line">
        <div className="container-site flex flex-col gap-3 py-6 text-[11px] uppercase tracking-wide text-muted-dim sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {company.legalName} — All rights reserved
          </span>
          <span>Australian Mining &amp; Exploration Company</span>
        </div>
      </div>
    </footer>
  );
}
