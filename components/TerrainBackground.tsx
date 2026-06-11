"use client";

/**
 * Generative hero backdrop.
 *
 * Preserves the existing site's "aerial survey terrain" hero concept without
 * relying on stock photography. Layered topographic contour rings evoke an
 * aerial / geological survey, rendered in monochrome charcoal with a slow
 * parallax drift. No gold tones are used.
 */
export function TerrainBackground() {
  // Concentric, slightly irregular contour rings forming a survey-style field.
  const rings = Array.from({ length: 26 });

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-black">
      {/* Drifting contour field */}
      <div className="absolute inset-0 animate-drift will-change-transform">
        <svg
          className="h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="terrainFade" cx="50%" cy="42%" r="62%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g
            transform="translate(720 380)"
            stroke="url(#terrainFade)"
            fill="none"
          >
            {rings.map((_, i) => {
              const r = 26 + i * 30;
              // Subtle eccentricity so the rings read as terrain, not a target.
              const rx = r * (1 + (i % 5) * 0.05);
              const ry = r * (1 - (i % 4) * 0.04);
              const rot = (i * 13) % 360;
              return (
                <ellipse
                  key={i}
                  cx="0"
                  cy="0"
                  rx={rx}
                  ry={ry}
                  strokeWidth={i % 6 === 0 ? 1.2 : 0.6}
                  transform={`rotate(${rot})`}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Centre glow */}
      <div className="absolute left-1/2 top-[34%] h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_60%)]" />

      {/* Vignette + bottom fade to seat the copy */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_30%,transparent_30%,rgba(0,0,0,0.55)_75%,#000_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/70 to-transparent" />

      {/* Fine grain for a premium, non-flat finish */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
