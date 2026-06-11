"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { hero } from "@/lib/content";
import { TerrainBackground } from "./TerrainBackground";
import { ArrowRight } from "./icons";

export function Hero() {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.12, delayChildren: 0.15 },
    },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-end overflow-hidden"
    >
      <TerrainBackground />

      <div className="container-site relative z-10 pb-20 pt-32 md:pb-28">
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="max-w-3xl"
        >
          <motion.p
            variants={item}
            className="eyebrow flex items-center gap-3 text-white/70"
          >
            <span className="h-px w-8 bg-white/40" aria-hidden="true" />
            {hero.eyebrow}
          </motion.p>

          <motion.h1
            variants={item}
            className="display mt-6 text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-7xl"
          >
            {hero.headline}
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-xl text-base leading-relaxed text-white/75 md:text-lg"
          >
            {hero.supporting}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <a href={hero.primaryCta.href} className="btn btn-primary group">
              {hero.primaryCta.label}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a href={hero.secondaryCta.href} className="btn btn-ghost">
              {hero.secondaryCta.label}
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-muted-dim md:flex">
        <span className="text-[10px] uppercase tracking-wide">Scroll</span>
        <span className="h-10 w-px bg-gradient-to-b from-white/40 to-transparent" />
      </div>
    </section>
  );
}
