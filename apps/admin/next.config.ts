import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { LEGACY_REDIRECTS } from "./src/shared/config/legacy-redirects";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Showcase: mounted under a sub-path (e.g. `/markerloop-studio`) of a shared
// showroom host. Empty = served at the root.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

// Showcase runtime defaults. In the product these come from the pod env of each
// contour (SDL-635/636); the demo turns the page builder and publishing on
// unless the environment says otherwise. next.config is evaluated by
// `next start` too, so these reach the server at run time.
process.env.PAGES_SECTION_ENABLED ??= "true";
process.env.PAGES_PUBLISH_ENABLED ??= "true";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The Docker image runs the standalone server (NEXT_OUTPUT=standalone in the
  // Dockerfile); `next start` serves the regular build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Оптимизация предзагрузки ресурсов
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Отключаем автоматическую предзагрузку для неиспользуемых ресурсов
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Old addresses that moved (SDL-607 /admin/*, EP-157 Blocks → Components):
  // the list lives in src/shared/config/legacy-redirects.ts, where
  // smoke:shell-layout reads it.
  async redirects() {
    return LEGACY_REDIRECTS;
  },
  async headers() {
    return [
      {
        // Telegram Mini App (/webapp) — разрешаем iframe
        source: "/webapp/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
        ],
      },
    ];
  },
};

// The product wraps this config in `withSentryConfig` (source-map upload to
// the team's Sentry); the public showcase ships without it. The Sentry SDK
// stays in the code and is inert without a DSN.
export default withNextIntl(nextConfig);
