/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The site download compiles a stylesheet for the exported pages at
    // request time. These are CommonJS build tools — let them be required
    // from node_modules rather than bundled into the server output.
    serverComponentsExternalPackages: ["tailwindcss", "postcss", "autoprefixer"],
  },
  images: {
    remotePatterns: [
      // Only allow images from trusted domains. Add more as needed.
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.googleapis.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
