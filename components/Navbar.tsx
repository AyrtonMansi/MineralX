"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { company, nav } from "@/lib/content";
import { CloseIcon, MenuIcon } from "./icons";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled
          ? "border-b border-line bg-black/80 backdrop-blur-md"
          : "border-b border-transparent bg-gradient-to-b from-black/70 to-transparent"
      }`}
    >
      <nav className="container-site flex h-16 items-center justify-between md:h-20">
        <a
          href="#top"
          className="text-base font-semibold uppercase tracking-brand text-white"
          aria-label={`${company.name} home`}
        >
          {company.shortName}
        </a>

        <div className="hidden items-center gap-9 lg:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[12px] font-medium uppercase tracking-wide text-muted transition-colors duration-300 hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <span className="h-4 w-px bg-line-strong" aria-hidden="true" />
          <a
            href="#contact"
            className="text-[12px] font-medium uppercase tracking-wide text-white transition-opacity hover:opacity-70"
          >
            Enquire
          </a>
        </div>

        <button
          type="button"
          className="p-2 text-white lg:hidden"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <MenuIcon className="h-6 w-6" />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-black lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="container-site flex h-16 items-center justify-between">
              <span className="text-base font-semibold uppercase tracking-brand text-white">
                {company.shortName}
              </span>
              <button
                type="button"
                className="p-2 text-white"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="container-site mt-8 flex flex-col gap-1">
              {nav.map((item, i) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i + 0.1 }}
                  className="border-b border-line py-5 text-2xl font-medium text-white"
                >
                  {item.label}
                </motion.a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
