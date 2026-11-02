import * as Sentry from "@sentry/nextjs";
import {
  CLIENT_DSN,
  RELEASE,
  environmentForHost,
} from "@/shared/lib/sentry-shared";
import { scrubDeep } from "@/shared/lib/sentry-scrub";

// Client-side Sentry (SDL-85). Gated on hostname, not merely on DSN presence:
// the DSN is baked into every image at build time, but only the platform's own
// hosts may report — a self-host install running this same artifact on another
// domain must stay silent. See sentry-shared.ts for the full reasoning.
const environment = environmentForHost(window.location.hostname);

if (CLIENT_DSN && environment) {
  Sentry.init({
    dsn: CLIENT_DSN,
    environment,
    release: RELEASE,
    // Errors are the deliverable of SDL-85; tracing is deliberately off until
    // someone decides what volume is worth paying for.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // SDL-615: an invite link carries its token in `#token=`; nothing that
    // leaves the browser may still hold it (sentry-scrub.ts).
    beforeSend: (event) => scrubDeep(event),
    beforeBreadcrumb: (breadcrumb) => scrubDeep(breadcrumb),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
