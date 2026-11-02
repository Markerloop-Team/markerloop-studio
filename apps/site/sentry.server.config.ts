import * as Sentry from "@sentry/nextjs";

// Server-side Sentry of the workspace site (SDL-685), configured exactly like
// the admin's (SDL-85): runtime env from the contour's ConfigMap. No DSN → the
// SDK stays off (local runs, self-host). Errors only, no tracing, no PII —
// the request of a visitor never carries cookies here anyway (src/proxy.ts).
//
// There is no client-side Sentry: the site's CSP allows `connect-src` to its
// own origin and the platform API only, so a browser SDK could not deliver.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || "unknown",
  release: process.env.BUILD_SHA || undefined,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  initialScope: { tags: { app: "site" } },
});
