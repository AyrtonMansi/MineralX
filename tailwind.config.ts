import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core monochrome system: black / charcoal / white.
        ink: {
          DEFAULT: "#000000",
          900: "#050506",
          800: "#0a0a0b",
          700: "#101012",
          600: "#16161a",
          500: "#1d1d22",
        },
        line: "rgba(255,255,255,0.10)",
        "line-strong": "rgba(255,255,255,0.18)",
        muted: "#8a8a90",
        // 5.2:1 on black — the previous #5f5f66 (3.3:1) failed WCAG AA for text.
        "muted-dim": "#7d7d86",
        // Sparing warm accent drawn from gold-bearing ground: indices and markers only.
        ore: "#c9a46a",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        brand: "0.28em",
        wide: "0.18em",
        label: "0.14em",
      },
      maxWidth: {
        site: "1440px",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scroll-cue": {
          "0%": { transform: "scaleY(0)", transformOrigin: "top" },
          "45%": { transform: "scaleY(1)", transformOrigin: "top" },
          "55%": { transform: "scaleY(1)", transformOrigin: "bottom" },
          "100%": { transform: "scaleY(0)", transformOrigin: "bottom" },
        },
        drift: {
          "0%": { transform: "translate3d(0,0,0) scale(1.05)" },
          "100%": { transform: "translate3d(-2%,-1.5%,0) scale(1.12)" },
        },
      },
      animation: {
        "fade-up": "fade-up 1.1s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 2.4s cubic-bezier(0.16,1,0.3,1) both",
        drift: "drift 28s ease-in-out infinite alternate",
        "scroll-cue": "scroll-cue 2.6s cubic-bezier(0.65,0,0.35,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
