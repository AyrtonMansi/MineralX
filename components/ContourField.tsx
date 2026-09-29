/**
 * Topographic contour field for pages without photography (Contact, Privacy,
 * Updates, 404). Deterministic (seeded) so server and client markup match, and
 * static SVG so it costs no request and no script. Every fifth ring is an
 * "index contour", drawn brighter, as on a survey map.
 */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ring = { d: string; index: boolean };

function hill(cx: number, cy: number, rings: number, seed: number): Ring[] {
  const rand = rng(seed);
  const harmonics = Array.from({ length: 4 }, (_, k) => ({
    k: k + 2,
    amp: 0.05 + rand() * 0.07,
    phase: rand() * Math.PI * 2,
    drift: (rand() - 0.5) * 0.9,
  }));
  const out: Ring[] = [];
  const pts = 64;
  for (let i = 0; i < rings; i++) {
    const r = 26 + i * 30 + i * i * 0.35;
    let d = "";
    for (let p = 0; p <= pts; p++) {
      const a = (p / pts) * Math.PI * 2;
      let wobble = 0;
      for (const h of harmonics)
        wobble += h.amp * Math.sin(h.k * a + h.phase + h.drift * i * 0.18);
      const rr = r * (1 + wobble);
      const x = cx + Math.cos(a) * rr * 1.25;
      const y = cy + Math.sin(a) * rr * 0.82;
      d += `${p ? "L" : "M"}${Math.round(x)} ${Math.round(y)}`;
    }
    out.push({ d: `${d}Z`, index: i % 5 === 4 });
  }
  return out;
}

const RINGS = [...hill(1080, 360, 22, 7), ...hill(1500, 980, 12, 19)];

export function ContourField({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="contourFade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0.12" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="contourMask">
          <rect width="1440" height="900" fill="url(#contourFade)" />
        </mask>
      </defs>
      <g mask="url(#contourMask)" fill="none">
        {RINGS.map((r, i) => (
          <path
            key={i}
            d={r.d}
            stroke="#fff"
            strokeOpacity={r.index ? 0.16 : 0.07}
            strokeWidth={r.index ? 1.1 : 0.8}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}
