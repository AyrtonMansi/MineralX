/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/clothing", destination: "/clothing/index.html" }];
  },
};

export default nextConfig;
