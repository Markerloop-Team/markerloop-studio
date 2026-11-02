import path from "node:path";
import type { NextConfig } from "next";

// The workspace site (SDL-685). Standalone output for the Docker image; the
// static headers here are the ones that do not vary per request — the CSP
// carries a per-request nonce and is set in src/proxy.ts.
const nextConfig: NextConfig = {
  output: "standalone",
  // The workspace root, not whatever lockfile sits above the checkout: the
  // standalone server must land at .next/standalone/apps/site/server.js.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: { root: path.join(__dirname, "../..") },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The theme's fonts (SDL-774): a week, then a day of stale-while-revalidate.
        // Not `immutable` — the file names carry no version, a refreshed face
        // keeps its URL.
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

// The product wraps this config in `withSentryConfig` (source-map upload);
// the public snapshot ships without it.
export default nextConfig;
