import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MineralX Resources — Resources, Research & Industry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "radial-gradient(120% 120% at 50% 0%, #16161a 0%, #050506 55%, #000000 100%)",
        padding: "72px 80px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 14, fontWeight: 600 }}>
          MINERALX
        </div>
        <div
          style={{
            fontSize: 18,
            letterSpacing: 4,
            color: "#8a8a90",
            textTransform: "uppercase",
          }}
        >
          Resources
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: 44,
            lineHeight: 1.25,
            fontWeight: 400,
            color: "#ffffff",
            letterSpacing: -1,
            maxWidth: 940,
          }}
        >
          Advancing resources. Building industry.
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#9a9aa0",
            maxWidth: 880,
            lineHeight: 1.35,
          }}
        >
          Australian resources. Research. Industrial development.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          color: "#6a6a70",
          fontSize: 20,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        <div style={{ width: 56, height: 1, background: "#3a3a40" }} />
        mineral-x.com.au
      </div>
    </div>,
    { ...size },
  );
}
