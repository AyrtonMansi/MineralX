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
      transition: { staggerChildren: 0.14, delayChildren: 0.2 },
    },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-center overflow-hidden"
    >
      <TerrainBackground />

      {/* Copy sits lower-left, matching the original hero composition. */}
      <div className="container-site relative z-10 mt-[14vh] w-full">
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="max-w-xl"
        >
          <motion.p
            variants={item}
            className="text-lg leading-relaxed text-white/90 md:text-2xl md:leading-[1.5]"
          >
            {hero.supporting}
          </motion.p>

          <motion.div variants={item} className="mt-10">
            <a href={hero.cta.href} className="btn btn-ghost group">
              {hero.cta.label}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
