import * as Sentry from "@sentry/nextjs";

// Next instrumentation hook (SDL-685): loads the server Sentry config and
// forwards every request error — a broken page body thrown by
// renderPublishedPage, an upstream 5xx — which no error boundary reports.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
