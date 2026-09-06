"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { company, nav } from "@/lib/content";
import { CloseIcon, MenuIcon } from "./icons";

export function Navbar({ hasUpdates = false }: { hasUpdates?: boolean }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const links = [
    ...nav,
    ...(hasUpdates ? [{ label: "Updates", href: "/updates" }] : []),
    { label: "Contact", href: "/contact" },
  ];
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
        className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${scrolled || pathname !== "/" ? "border-line bg-black/95 backdrop-blur-md" : "border-transparent bg-gradient-to-b from-black/80 to-transparent"}`}
      >
        <nav
          aria-label="Main navigation"
          className="container-site flex h-16 items-center justify-between md:h-20"
        >
          <Link
            href="/"
            className="py-3 text-base font-semibold uppercase tracking-brand"
            aria-label={`${company.name} home`}
          >
            {company.shortName}
          </Link>
          <div className="hidden items-center gap-8 lg:flex">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={
                  item.href === "/contact"
                    ? "btn btn-ghost"
                    : `py-3 text-[11px] font-medium uppercase tracking-wide transition-colors hover:text-white ${pathname === item.href ? "text-white underline underline-offset-8" : "text-muted"}`
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
          <button
            ref={trigger}
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-controls="mobile-menu"
            className="flex h-11 w-11 items-center justify-center lg:hidden"
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
        <div className="container-site flex h-16 items-center justify-between md:h-20">
          <span className="text-base font-semibold uppercase tracking-brand">
            {company.shortName}
          </span>
          <button
            type="button"
            autoFocus
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center"
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
              aria-current={pathname === item.href ? "page" : undefined}
              className="border-b border-line py-6 text-2xl"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </dialog>
    </>
  );
}
