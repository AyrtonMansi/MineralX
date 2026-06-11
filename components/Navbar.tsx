"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { company, nav } from "@/lib/content";
import { CloseIcon, MenuIcon } from "./icons";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Slim, subtle scroll-progress indicator.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });

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
    <>
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
            className="text-base font-semibold uppercase tracking-brand text-white transition-opacity hover:opacity-80"
            aria-label={`${company.name} home`}
          >
            {company.shortName}
          </a>

          <div className="hidden items-center gap-9 lg:flex">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group relative text-[12px] font-medium uppercase tracking-wide text-muted transition-colors duration-300 hover:text-white"
              >
                {item.label}
                <span className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-white/70 transition-transform duration-300 ease-out group-hover:scale-x-100" />
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

        {/* Scroll progress line */}
        <motion.div
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-white/60"
          style={{ scaleX: progress }}
          aria-hidden="true"
        />
      </header>

      {/* Mobile menu — rendered outside the header so the blurred header's
          backdrop-filter doesn't trap this fixed overlay inside its box. */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="container-site flex h-16 items-center justify-between md:h-20">
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
            <nav className="container-site mt-6 flex flex-col">
              {nav.map((item, i) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 * i + 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="border-b border-line py-5 text-2xl font-medium text-white/90 transition-colors hover:text-white"
                >
                  {item.label}
                </motion.a>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
