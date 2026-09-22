/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Nothing about this server is a secret, but the version in the banner is a
  // free hint about which advisories to try.
  poweredByHeader: false,
  // The site download compiles a stylesheet for the exported pages at request
  // time. These are CommonJS build tools — let them be required from
  // node_modules rather than bundled into the server output. This was
  // `experimental.serverComponentsExternalPackages` until Next 15 stabilised
  // it under this name.
  serverExternalPackages: ["tailwindcss", "postcss", "autoprefixer"],
  images: {
    /**
     * The image optimizer is off, because nothing here uses it.
     *
     * No component imports `next/image`, so `/_next/image` was pure surface:
     * an endpoint any page could point at an allowed remote host — and
     * `*.googleapis.com` matched `storage.googleapis.com`, where anyone can
     * put an object — which then buffered the whole upstream body into an
     * unbounded disk cache. It was also the one thing in a product that
     * promises to make no outbound requests that made outbound requests.
     */
    unoptimized: true,
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
            // Over plain http this changes nothing; over https it turns
            // prefetching back on, so the hosts behind links somebody wrote
            // into their content get resolved before anyone clicks.
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
          {
            // Another origin can neither share a browsing context group with
            // the builder nor read what it serves — including an upload it
            // guessed the name of.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        // These answer with somebody's sites and somebody's visitor
        // submissions. A proxy in front of this has no business keeping a
        // copy, and none of it is the same twice.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

module.exports = nextConfig;
