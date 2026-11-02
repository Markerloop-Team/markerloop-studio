import * as Sentry from "@sentry/nextjs";

// Next instrumentation hook (SDL-85): loads the right Sentry config per
// runtime and forwards request errors — including errors thrown in Server
// Components and route handlers, which no error boundary ever sees.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
