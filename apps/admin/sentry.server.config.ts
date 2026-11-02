import * as Sentry from "@sentry/nextjs";

// Server-side Sentry (SDL-85). Everything comes from runtime env set by the
// contour's ConfigMap (dev-infra apps/markerloop-app): SENTRY_DSN enables the
// SDK, SENTRY_ENVIRONMENT names the contour, BUILD_SHA is the image tag the
// pipeline baked in (same marker /api/health reports). A self-host stack that
// sets none of these runs with the SDK disabled — no DSN, no reporting.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || "unknown",
  release: process.env.BUILD_SHA || undefined,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
