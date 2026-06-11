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
        "muted-dim": "#5f5f66",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        brand: "0.28em",
        wide: "0.18em",
      },
      maxWidth: {
        site: "1280px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        drift: {
          "0%": { transform: "translate3d(0,0,0) scale(1.05)" },
          "100%": { transform: "translate3d(-2%,-1.5%,0) scale(1.12)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        drift: "drift 28s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
