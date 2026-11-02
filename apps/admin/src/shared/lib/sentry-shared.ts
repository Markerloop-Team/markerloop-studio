/**
 * The one place that decides whether and how this deployment reports to
 * Sentry (SDL-85).
 *
 * The image is environment-free by design (SDL-71): one artifact serves prod,
 * test and any self-host install. That rules out both baking an environment
 * name into the bundle and unconditionally enabling the SDK:
 *
 * - The *server* reads `SENTRY_DSN` / `SENTRY_ENVIRONMENT` at runtime — they
 *   come from the contour's ConfigMap (dev-infra), so a self-host stack that
 *   does not set them simply runs with the SDK disabled.
 * - The *client* cannot read runtime env (NEXT_PUBLIC_* is inlined at build
 *   time), so the DSN is baked in — but reporting is gated on the hostname:
 *   only the platform's own hosts ever initialise Sentry. A self-hoster
 *   running the same image on their domain sends us nothing.
 */

/** Inlined at build time; empty in images built without the arg. */
export const CLIENT_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export const RELEASE = process.env.NEXT_PUBLIC_BUILD_SHA || undefined;

/**
 * Maps a browser hostname to a Sentry environment, or null for "do not report".
 *
 * HOSTS ARE NAMED EXACTLY, NEVER INFERRED FROM A SUFFIX. SDL-607 moved the TEST
 * contour onto the apex `staging.example.com` (step 4, 23 Sep 2026 14:16) and
 * retired `admin.staging.example.com` (step 5, the same day 18:25). This
 * function still tested the suffix `.staging.example.com`, and that does NOT
 * match the apex — the leading dot is part of the needle. So from 14:16 every
 * browser arriving on the new address fell through to the self-host branch,
 * `environmentForHost` returned null and client-side Sentry never initialised;
 * from 18:25, when the old host went away, that was every browser. Hours, not
 * weeks — but nothing went red for them either, and nothing would have, because
 * "no events from the contour" is exactly what a healthy contour looks like.
 *
 * That is the only way this function can fail, so it is written against it:
 * a name it does not know is silence, and silence is invisible. Guard —
 * `apps/admin/smoke/sentry-hosts.tsx`, job `smoke:sentry-hosts`.
 *
 * PROD MOVED TOO. Since 24 Sep 2026 (dev-infra !594) the old prod host
 * `admin.<apex>` answers nothing but a 301 to the same path on the apex, so
 * no page is ever rendered with it as `location.hostname` and it is no longer
 * listed. Both retired hosts — this one and `admin.test.<apex>` — are
 * deliberately NOT here; the smoke asserts they are silent.
 *
 * DELIBERATE CONSEQUENCE, NOT A SIDE EFFECT: a NEW contour subdomain is silent
 * until someone adds it here. The old suffix would have adopted it
 * automatically — and would equally have adopted anything else under that
 * domain. Explicit silence is the safer default for a gate whose whole job is
 * to keep a self-host install from reporting into our project, but it means
 * "add a contour host" is a two-line change: here and in the smoke.
 */
export function environmentForHost(hostname: string): string | null {
  if (hostname === "markerloop.com") {
    return "production";
  }
  if (hostname === "staging.example.com") {
    return "test";
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // Local dev noise is worse than no data — stay silent unless someone
    // deliberately wires a DSN through NEXT_PUBLIC_SENTRY_DSN at build time
    // AND flips this to return "development".
    return null;
  }
  // Unknown host — a self-host install or a custom domain. Not ours to watch.
  return null;
}
