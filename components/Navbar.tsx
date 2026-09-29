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
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const primary = [
    ...nav,
    ...(hasUpdates ? [{ label: "Updates", href: "/updates" }] : []),
  ];
  const signIn = { label: "Staff sign in", href: "/ops/login" };
  const contact = { label: "Contact", href: "/contact" };
  const links = [...primary, contact, signIn];
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
        className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ${scrolled || pathname !== "/" ? "border-line bg-black/85 backdrop-blur-md" : "border-transparent bg-gradient-to-b from-black/70 to-transparent"}`}
      >
        <nav
          aria-label="Main navigation"
          className="container-site grid h-16 grid-cols-[1fr_auto] items-center md:h-[72px] lg:grid-cols-[1fr_auto_1fr]"
        >
          <Link
            href="/"
            className="justify-self-start py-3"
            aria-label={`${company.name} home`}
          >
            <BrandMark />
          </Link>
          <ul className="hidden items-center gap-10 lg:flex">
            {primary.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={`relative block py-3 text-[11px] font-medium uppercase tracking-wide transition-colors duration-300 hover:text-white after:absolute after:inset-x-0 after:bottom-1.5 after:h-px after:origin-left after:bg-white after:transition-transform after:duration-300 ${isCurrent(item.href) ? "text-white after:scale-x-100" : "text-white/55 after:scale-x-0 hover:after:scale-x-100"}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden items-center justify-self-end gap-7 lg:flex">
            <Link
              href={signIn.href}
              className="py-3 text-[11px] font-medium uppercase tracking-wide text-white/55 transition-colors hover:text-white"
            >
              {signIn.label}
            </Link>
            <Link
              href={contact.href}
              aria-current={isCurrent(contact.href) ? "page" : undefined}
              className="border border-white/25 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-white transition-colors duration-300 hover:border-white hover:bg-white hover:text-black"
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
            onClick={() => {
              dialog.current?.showModal();
              document.body.style.overflow = "hidden";
            }}
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
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-black p-0 text-white backdrop:bg-black"
      >
        <div className="container-site flex h-16 items-center justify-between md:h-[72px]">
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
          className="container-site mt-8 flex flex-col"
        >
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMenu}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className={`border-b border-line py-6 text-2xl font-light tracking-tight ${item.href === signIn.href ? "text-base font-normal uppercase tracking-wide text-white/55" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </dialog>
    </>
  );
}
