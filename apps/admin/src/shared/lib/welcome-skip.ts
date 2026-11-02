// «Skip» on /welcome, remembered where the SERVER can read it (SDL-759 re-open).
//
// The decision "no workspace → /welcome" is taken on the server before the
// first byte of a section (the proxy marks the request, the root layout
// asks the gateway and redirects), so a sessionStorage flag is invisible to
// it: after «Skip» every reload of Collections would bounce back to the form
// the person just declined. The flag is therefore a cookie:
//   - value = the account id, so another account signing in in the same
//     browser is offered the form again;
//   - no Max-Age: it lives until the browser session ends;
//   - `__Host-` in the production build (Secure, Path=/, no Domain), exactly
//     like the session cookies — user sites on *.markerloop.com cannot plant
//     or read it. Not httpOnly: the client writes it and reads it back.
//
// Plain TypeScript, no React: the proxy imports it.

import { HOST_PREFIX, hostPrefixEnabled } from "./session-cookies";

const BASE_NAME = "ml_welcome_skipped";

/**
 * Request header the proxy sets on a full page load of a workspace section
 * that needs the check (src/proxy/layers/welcome-check.ts); the root
 * layout acts only on "1" (src/shared/lib/api/welcome-server.ts).
 */
export const WELCOME_CHECK_HEADER = "x-ml-welcome-check";

export function welcomeSkipCookieName(): string {
  return hostPrefixEnabled() ? `${HOST_PREFIX}${BASE_NAME}` : BASE_NAME;
}

/** Whether the cookie's value says THIS account pressed «Skip». */
export function skipCookieMatches(value: string | undefined, userId: string | null | undefined): boolean {
  if (!value || !userId) return false;
  try {
    return decodeURIComponent(value) === userId;
  } catch {
    return false;
  }
}

/** Browser only: remember «Skip» for this account. */
export function writeWelcomeSkipCookie(userId: string): void {
  const secure = hostPrefixEnabled() ? "; Secure" : "";
  document.cookie = `${welcomeSkipCookieName()}=${encodeURIComponent(userId)}; path=/; SameSite=Lax${secure}`;
}

/** Browser only: the cookie's raw value, or undefined. */
export function readWelcomeSkipCookie(): string | undefined {
  const name = `${welcomeSkipCookieName()}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name)) return trimmed.slice(name.length);
  }
  return undefined;
}
