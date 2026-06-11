"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { company } from "@/lib/content";

/**
 * Loading screen.
 *
 * Recreates the existing site's loading concept in the MineralX visual
 * language: a black screen with the letter-spaced wordmark and a thin progress
 * line that fills, then lifts away to reveal the hero. Shown once per browser
 * session so repeat navigation stays fast.
 */
export function Preloader() {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Skip on repeat visits within the same session.
    if (typeof window !== "undefined" && sessionStorage.getItem("mx_loaded")) {
      setVisible(false);
      return;
    }

    if (reduce) {
      setProgress(100);
      const t = setTimeout(() => finish(), 400);
      return () => clearTimeout(t);
    }

    let raf = 0;
    const start = performance.now();
    const duration = 1600;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => finish(), 320);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  function finish() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("mx_loaded", "1");
      document.body.style.removeProperty("overflow");
    }
    setVisible(false);
  }

  // Lock scroll while the loader is on screen.
  useEffect(() => {
    if (visible && typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
          initial={{ opacity: 1 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <span className="text-xl font-semibold uppercase tracking-brand text-white md:text-2xl">
              {company.shortName}
            </span>
            <span className="mt-3 text-[10px] uppercase tracking-wide text-muted-dim">
              Resources
            </span>
          </motion.div>

          {/* Progress line */}
          <div className="mt-10 h-px w-48 overflow-hidden bg-white/10">
            <motion.div
              className="h-full bg-white"
              style={{ width: `${progress}%` }}
              transition={{ ease: "linear" }}
            />
          </div>
          <div className="mt-4 text-[10px] tabular-nums tracking-wide text-muted-dim">
            {String(progress).padStart(3, "0")}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
