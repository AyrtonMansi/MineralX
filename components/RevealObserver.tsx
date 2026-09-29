"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Arms `[data-reveal]` / `[data-reveal-media]` elements that start below the
 * fold, then releases each as it enters view. Content is fully visible in the
 * server HTML; nothing is hidden unless this runs, motion is allowed, and the
 * element is off-screen — so there is no flash and no dependence on JS.
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal],[data-reveal-media]"),
    );
    const key = (el: HTMLElement) =>
      el.hasAttribute("data-reveal-media") ? "revealMedia" : "reveal";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.dataset[key(el)] = "shown";
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const fold = window.innerHeight;
    for (const el of nodes) {
      if (el.getBoundingClientRect().top < fold) continue;
      el.dataset[key(el)] = "pending";
      io.observe(el);
    }
    return () => {
      io.disconnect();
      for (const el of nodes) el.dataset[key(el)] = "shown";
    };
  }, [pathname]);
  return null;
}
