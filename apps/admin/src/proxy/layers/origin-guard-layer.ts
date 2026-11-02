import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF guard for the admin's own route handlers (SDL-680).
 *
 * User sites are about to live on *.markerloop.com — the same SITE as the
 * admin, so `SameSite=Strict` cookies no longer stop them: a page on
 * `foo.markerloop.com` can POST to `markerloop.com/api/auth/set-tokens` and the
 * browser would attach the admin's cookies (session fixation), or call any
 * other mutating handler. Only the origin can tell these apart.
 *
 * The rule, for POST/PUT/PATCH/DELETE on /api/*:
 *   1. `Sec-Fetch-Site` present → allowed only for `same-origin` or `none`
 *      (typed URL / bookmark). `same-site` is exactly the subdomain case, so
 *      it is rejected, as is `cross-site`.
 *   2. No `Sec-Fetch-Site` (older browser, or plain http outside localhost)
 *      → `Origin` must be this host; `Origin: null` is rejected.
 *   3. Neither header → allowed: it is not a browser. Every browser sends
 *      `Origin` on a non-GET request, so a forged cross-site request always
 *      carries one; a client without both (Node fetch from the server, the
 *      Playwright request context of e2e/auth.setup.ts, curl) holds no
 *      victim's cookies to abuse. Same algorithm as Go's
 *      net/http.CrossOriginProtection.
 *
 * "This host": `X-Forwarded-Host` (set by the ingress), else `Host`. A browser
 * cannot set either on a cross-origin request without a CORS preflight, which
 * the admin does not answer.
 *
 * The gateway strips Origin/Sec-Fetch-* (gw-service proxy_handler.go), but
 * /api/v1/* goes to the gateway by the ingress and never reaches this proxy;
 * this guard sits in front of the Next route handlers only.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function ownHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("host") || request.nextUrl.host).toLowerCase();
}

export function isCrossOriginMutation(request: NextRequest): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;

  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";

  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    // Host only, scheme not compared: behind the ingress the pod sees plain
    // http, and HSTS (includeSubDomains, next.config.ts) keeps browsers off
    // http://markerloop.com, so an http:// origin of this host is not reachable.
    return new URL(origin).host.toLowerCase() !== ownHost(request);
  } catch {
    return true; // "null" and anything unparsable
  }
}

/** Returns a 403 for a cross-origin mutation, null otherwise. */
export function originGuardLayer(request: NextRequest): NextResponse | null {
  if (!isCrossOriginMutation(request)) return null;
  return NextResponse.json(
    { error: "Cross-origin request rejected" },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}
