/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  async headers() {
    const baselineHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Download-Options", value: "noopen" },
    ];
    const privateHeaders = [
      ...baselineHeaders,
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ];
    return [
      { source: "/(.*)", headers: baselineHeaders },
      ...["/gic/:path*", "/gic-review.html", "/ops/:path*", "/api/ops/:path*"].map(source => ({ source, headers: privateHeaders })),
    ];
  },
  async rewrites() {
    return [{ source: "/clothing", destination: "/clothing/index.html" }];
  },
  async redirects() {
    // The GIC pages are retired in favour of their Operations equivalents.
    // The underlying database and RPCs are untouched — only these routes moved.
    return [
      { source: "/gic", destination: "/ops/gold", permanent: true },
      { source: "/gic/login", destination: "/ops/login", permanent: true },
      { source: "/gic/forgot-password", destination: "/ops/login", permanent: true },
      { source: "/gic/access", destination: "/ops", permanent: true },
      { source: "/gic/password", destination: "/ops/account", permanent: true },
      { source: "/gic/reports", destination: "/ops/reports", permanent: true },
      { source: "/gic/runs/new", destination: "/ops/gold", permanent: true },
      { source: "/gic/runs/:path*", destination: "/ops/gold", permanent: true },
      { source: "/gic/export", destination: "/ops/reports", permanent: true },
      { source: "/gic/auth/callback", destination: "/ops/auth/callback", permanent: true },
      { source: "/gic/auth/complete", destination: "/ops/auth/complete", permanent: true },
    ];
  },
};

export default nextConfig;
