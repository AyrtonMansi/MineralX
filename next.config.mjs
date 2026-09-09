/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ];
    return ["/gic/:path*", "/gic-review.html", "/ops/:path*", "/api/ops/:path*"].map(source => ({ source, headers: privateHeaders }));
  },
  async rewrites() {
    return [{ source: "/clothing", destination: "/clothing/index.html" }];
  },
};

export default nextConfig;
