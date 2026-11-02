import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * Deliberate test event for Sentry (SDL-85).
 *
 * The acceptance criterion of the integration is "an intentional error on the
 * test contour is visible in Sentry with the right release and environment" —
 * this route is that error, made repeatable. It captures (not throws), so
 * probing it never trips alerting-by-500 or pollutes gateway error rates; the
 * event carries a `sentry-check` tag to keep it filterable from real issues.
 *
 * Safe to keep in prod: it needs an explicit call, reports only what this
 * deployment already reports, and answers 200 with the event id.
 */
export function GET() {
  const eventId = Sentry.captureException(
    new Error("sentry-check: deliberate test event"),
    { tags: { "sentry-check": "true" } },
  );

  return NextResponse.json({
    status: "captured",
    eventId,
    // Mirrors /api/health so one response says which artifact and where from.
    build: process.env.BUILD_SHA ?? "unknown",
    environment: process.env.SENTRY_ENVIRONMENT ?? "unknown",
    enabled: Boolean(process.env.SENTRY_DSN),
  });
}
