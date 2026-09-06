import { hero } from "@/lib/content";
import { GRAIN_TEXTURE } from "./grain";

/**
 * Hero backdrop.
 *
 * Recreates the original site's hero: a dark, warm-toned aerial view of eroded
 * terrain with fine drainage lines radiating from a bright central point.
 *
 * If `hero.backgroundImage` is set (the original photographic asset placed in
 * /public), that image is used for a pixel-exact match; otherwise this
 * generated backdrop stands in. The pattern is produced with a seeded PRNG so
 * server and client render identical markup (no hydration mismatch).
 */

// Deterministic pseudo-random generator (mulberry32).
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VW = 1440;
const VH = 900;
const CX = 720;
const CY = 360;

// Generate radial drainage strokes once (deterministic).
function buildRays() {
  const rand = rng(20240611);
  const rays: { d: string; w: number; o: number; light: boolean }[] = [];
  const count = 260;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.04;
    const innerR = 30 + rand() * 60;
    const outerR = 520 + rand() * 620;
    const segs = 5;
    const wobble = (rand() - 0.5) * 0.12;

    let d = "";
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = innerR + (outerR - innerR) * t;
      // Drift the angle slightly outward for an organic, branching look.
      const a = angle + wobble * t + (rand() - 0.5) * 0.012;
      const x = CX + Math.cos(a) * r;
      const y = CY + Math.sin(a) * r * 0.92; // slight vertical compression
      d += `${s === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }

    const light = rand() > 0.78;
    rays.push({
      d: d.trim(),
      w: light ? 0.6 + rand() * 0.8 : 0.5 + rand() * 1.6,
      o: light ? 0.05 + rand() * 0.08 : 0.12 + rand() * 0.4,
      light,
    });
  }
  return rays;
}

const RAYS = buildRays();

export function TerrainBackground() {
  if (hero.backgroundImage) {
    return (
      <div className="absolute inset-0 -z-10 overflow-hidden bg-black">
        {/* Original warm aerial image, zoomed to fill the viewport. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero.backgroundImage}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full animate-drift object-cover [filter:brightness(0.9)_contrast(1.03)] will-change-transform"
        />
        {/* Black overlay — heavier across the whole image, with extra
            darkening left/bottom for legible copy and a clean top for nav. */}
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/85 to-transparent" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#070402]">
      {/* Warm aerial terrain, slowly drifting */}
      <div className="absolute inset-0 animate-drift will-change-transform">
        <svg
          className="h-full w-full"
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            {/* Warm earth field: bright warm centre fading to near-black. */}
            <radialGradient id="heroWarm" cx="50%" cy="40%" r="68%">
              <stop offset="0%" stopColor="#7a5630" />
              <stop offset="22%" stopColor="#5a3d22" />
              <stop offset="48%" stopColor="#32200f" />
              <stop offset="74%" stopColor="#150c05" />
              <stop offset="100%" stopColor="#070402" />
            </radialGradient>
            <radialGradient id="heroGlow" cx="50%" cy="40%" r="30%">
              <stop offset="0%" stopColor="#b78a55" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#b78a55" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="rayFade" cx="50%" cy="40%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="18%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.6" />
            </radialGradient>
            <mask id="rayMask">
              <rect width={VW} height={VH} fill="url(#rayFade)" />
            </mask>
          </defs>

          <rect width={VW} height={VH} fill="url(#heroWarm)" />

          {/* Radial drainage striations */}
          <g mask="url(#rayMask)">
            {RAYS.map((r, i) => (
              <path
                key={i}
                d={r.d}
                fill="none"
                stroke={r.light ? "#e9c89a" : "#000000"}
                strokeWidth={r.w}
                strokeOpacity={r.o}
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Central warm glow */}
          <rect width={VW} height={VH} fill="url(#heroGlow)" />
        </svg>
      </div>

      {/* Vignette + bottom fade to seat the copy */}
      <div className="absolute inset-0 bg-[radial-gradient(125%_95%_at_50%_36%,transparent_24%,rgba(0,0,0,0.5)_70%,#000_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
      {/* Top fade so the navigation reads cleanly */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />

      {/* Fine grain */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_TEXTURE }}
      />
    </div>
  );
}
