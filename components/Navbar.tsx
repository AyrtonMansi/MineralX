"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { company, nav } from "@/lib/content";
import { BrandMark } from "./BrandMark";
import { CloseIcon, MenuIcon } from "./icons";

export function Navbar({ hasUpdates = false }: { hasUpdates?: boolean }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const primary = [
    ...nav,
    ...(hasUpdates ? [{ label: "Updates", href: "/updates" }] : []),
  ];
  const contact = { label: "Contact", href: "/contact" };
  const menu = [...primary, contact];
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Solid once the intro scrolls away; tucked away while reading downwards and
  // back on any upward scroll. Never hidden while it holds keyboard focus.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      const focused = header.current?.contains(document.activeElement);
      if (y < 160 || y < last - 4 || focused) setHidden(false);
      else if (y > last + 4) setHidden(true);
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setHidden(false), [pathname]);

  function openMenu() {
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
  }
  function closeMenu() {
    dialog.current?.close();
    document.body.style.overflow = "";
    trigger.current?.focus();
  }
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches) {
        dialog.current?.close();
        document.body.style.overflow = "";
      }
    };
    desktop.addEventListener("change", onResize);
    return () => {
      desktop.removeEventListener("change", onResize);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <>
      <header
        ref={header}
        onFocusCapture={() => setHidden(false)}
        className={`fixed inset-x-0 top-0 z-50 border-b transition-[transform,background-color,border-color] duration-700 ease-out ${hidden ? "-translate-y-full" : "translate-y-0"} ${scrolled ? "border-line bg-black/80 backdrop-blur-xl" : "border-transparent bg-gradient-to-b from-black/60 to-transparent"}`}
      >
        <nav
          aria-label="Main navigation"
          className="container-site grid h-16 grid-cols-[1fr_auto] items-center md:h-[76px] lg:grid-cols-[1fr_auto_1fr]"
        >
          <Link
            href="/"
            className="justify-self-start py-3"
            aria-label={`${company.name} home`}
          >
            <BrandMark />
          </Link>
          <ul className="hidden items-center gap-11 lg:flex">
            {primary.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={`relative block py-3 text-[11px] font-medium uppercase tracking-label transition-colors duration-300 hover:text-white after:absolute after:inset-x-0 after:bottom-1.5 after:h-px after:origin-left after:bg-current after:transition-transform after:duration-500 after:ease-out ${isCurrent(item.href) ? "text-white after:scale-x-100" : "text-white/60 after:scale-x-0 hover:after:scale-x-100"}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-8 justify-self-end lg:flex">
            <Link
              href={contact.href}
              aria-current={isCurrent(contact.href) ? "page" : undefined}
              className="btn btn-ghost min-h-10 px-5"
            >
              {contact.label}
            </Link>
          </div>
          <button
            ref={trigger}
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-controls="mobile-menu"
            className="-mr-2.5 flex h-11 w-11 items-center justify-center justify-self-end lg:hidden"
            onClick={openMenu}
          >
            <MenuIcon className="h-6 w-6" />
          </button>
        </nav>
      </header>

      <dialog
        ref={dialog}
        id="mobile-menu"
        aria-label="Navigation menu"
        onClose={() => {
          document.body.style.overflow = "";
        }}
        className="mobile-menu fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-black p-0 text-white backdrop:bg-black"
      >
        <div className="flex h-full flex-col">
          <div className="container-site flex h-16 shrink-0 items-center justify-between border-b border-line md:h-[76px]">
            <BrandMark />
            <button
              type="button"
              autoFocus
              aria-label="Close menu"
              className="-mr-2.5 flex h-11 w-11 items-center justify-center"
              onClick={closeMenu}
            >
              <CloseIcon className="h-6 w-6" />
            </button>
          </div>
          <nav
            aria-label="Mobile navigation"
            className="container-site flex flex-1 flex-col overflow-y-auto py-6"
          >
            <ol>
              {menu.map((item, i) => (
                <li key={item.href} className="border-b border-line">
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    aria-current={isCurrent(item.href) ? "page" : undefined}
                    className="mobile-menu-item flex py-5"
                    style={{ animationDelay: `${80 + i * 60}ms` }}
                  >
                    <span className="text-2xl">
                      {item.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <div className="mt-auto grid gap-2 border-t border-line pt-6 font-medium text-[11px] uppercase tracking-label text-white/60">
              <a href={`mailto:${company.email}`} className="normal-case tracking-normal text-[13px] text-white/80">
                {company.email}
              </a>
              <span>{company.base.place}</span>
            </div>
          </nav>
        </div>
      </dialog>
    </>
  );
}
