// Session and locale cookie names and attributes (SDL-680).
//
// User sites are about to live on *.markerloop.com, i.e. on the SAME SITE as
// the admin. A cookie set without the `__Host-` prefix can be overwritten
// ("tossed") from any subdomain with `Domain=.markerloop.com`, and a cookie set
// with a Domain would leak to every such site. The `__Host-` prefix makes the
// browser itself refuse both: the cookie must be Secure, Path=/ and carry no
// Domain, so only this exact host can set or read it.
//
// The prefix requires Secure, so it is used only where the cookies are Secure
// already — the production build (both deployed contours). `next dev` on plain
// http keeps the old names.
//
// Transition: sessions issued before this change still carry the old names.
// The proxy copies them to the new names and expires the old ones
// (`migrateLegacyCookies`), so nobody is logged out by the rename. The old
// names are NOT trustworthy, though: the admin lives on the apex, so a user
// site on foo.markerloop.com can plant `access_token; Domain=markerloop.com`
// and the browser sends it here. Hence (review r1 of !253):
//   - the old session names are read only as a WHOLE pair (access + refresh),
//     only when no `__Host-` session cookie is present — never mixed;
//   - only until LEGACY_COOKIE_FALLBACK_UNTIL, after which they are ignored;
//   - an old locale is copied only when it is one of `locales`.
//
// Every writer goes through this file; `smoke:cookies` fails if another file
// starts writing these cookies or adds a Domain.
//
// Client-safe: the locale hook and the API client import it in the browser;
// `@/i18n` is already in the client bundle through the API client.

import { locales, type Locale } from "@/i18n";
import { DEMO_MODE } from "@/demo/config";

export type SessionCookieKind = "access" | "refresh" | "locale";

export const HOST_PREFIX = "__Host-";

// Showcase: the demo shares its origin with other demos, so its session
// cookies carry their own names.
const LEGACY_NAMES: Record<SessionCookieKind, string> = {
  access: DEMO_MODE ? "mlstudio_access_token" : "access_token",
  refresh: DEMO_MODE ? "mlstudio_refresh_token" : "refresh_token",
  locale: "NEXT_LOCALE",
};

/**
 * End of the transition. Remove the legacy fallback after this date: old
 * session cookies lived <= 24 h (refresh maxAge), so a week is plenty. Do NOT
 * enable user sites (EP-113) on prod before it — until then a tossed legacy
 * PAIR from a subdomain is still accepted when the victim has no session.
 */
export const LEGACY_COOKIE_FALLBACK_UNTIL = Date.UTC(2026, 9, 6); // 6 Oct 2026 00:00 UTC

/** Whether the old names may still be read (production, before the deadline). */
export function legacyFallbackActive(now = Date.now()): boolean {
  return hostPrefixEnabled() && now < LEGACY_COOKIE_FALLBACK_UNTIL;
}

/** Default lifetimes, seconds. */
export const ACCESS_COOKIE_MAX_AGE = 3600;
export const REFRESH_COOKIE_MAX_AGE = 24 * 60 * 60;
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Upper bounds for a lifetime the server reports (SDL-613 S6a) — auth-service's
 * own ceilings (maxJWTAccessTTL / maxJWTRefreshTTL). A value above them is not
 * a longer session, it is a broken response.
 */
export const ACCESS_COOKIE_MAX_AGE_CEILING = 24 * 60 * 60;
export const REFRESH_COOKIE_MAX_AGE_CEILING = 90 * 24 * 60 * 60;

/**
 * Max-Age for a session cookie, taken from what auth-service said about the
 * token (SDL-613 S6a): `expires_in` / `refresh_expires_in` of its response,
 * else the token's own JWT `exp`, else the kind's default. Before S6a the
 * cookies always lived the constants above, so a refresh token issued for
 * longer than 24 h died with its cookie, and a shorter one outlived it.
 */
export function sessionMaxAge(
  kind: "access" | "refresh",
  reported: unknown,
  token: string,
  now = Date.now()
): number {
  const ceiling = kind === "access" ? ACCESS_COOKIE_MAX_AGE_CEILING : REFRESH_COOKIE_MAX_AGE_CEILING;
  if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) {
    return Math.min(ceiling, Math.floor(reported));
  }
  const left = secondsUntilJwtExpiry(token, now);
  if (left !== null && left > 0) return Math.min(ceiling, left);
  return kind === "access" ? ACCESS_COOKIE_MAX_AGE : REFRESH_COOKIE_MAX_AGE;
}

/**
 * Whether cookies get the `__Host-` prefix (and therefore `Secure`). Read at
 * call time: the server reads NODE_ENV per request, the client has it inlined.
 */
export function hostPrefixEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

export function sessionCookieName(kind: SessionCookieKind): string {
  const legacy = LEGACY_NAMES[kind];
  return hostPrefixEnabled() ? `${HOST_PREFIX}${legacy}` : legacy;
}

/** The pre-SDL-680 name; only read and expired, never written with a value. */
export function legacySessionCookieName(kind: SessionCookieKind): string {
  return LEGACY_NAMES[kind];
}

type CookieReader = { get(name: string): { value: string } | undefined };

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

/**
 * The session as one pair — never an access token from one source and a
 * refresh token from another. `__Host-` names win whenever either is present;
 * the legacy pair is used only whole, only while the fallback is active.
 */
export function readSessionPair(store: CookieReader): {
  access: string | undefined;
  refresh: string | undefined;
  legacy: boolean;
} {
  const access = store.get(sessionCookieName("access"))?.value || undefined;
  const refresh = store.get(sessionCookieName("refresh"))?.value || undefined;
  if (!hostPrefixEnabled() || access || refresh) return { access, refresh, legacy: false };
  const oldAccess = store.get(legacySessionCookieName("access"))?.value;
  const oldRefresh = store.get(legacySessionCookieName("refresh"))?.value;
  if (legacyFallbackActive() && oldAccess && oldRefresh) {
    return { access: oldAccess, refresh: oldRefresh, legacy: true };
  }
  return { access: undefined, refresh: undefined, legacy: false };
}

/** One cookie of the session pair, or the locale (validated). */
export function readSessionCookie(
  store: CookieReader,
  kind: SessionCookieKind
): string | undefined {
  if (kind !== "locale") return readSessionPair(store)[kind];
  const current = store.get(sessionCookieName("locale"))?.value;
  if (current) return current;
  const old = store.get(legacySessionCookieName("locale"))?.value;
  return legacyFallbackActive() && isLocale(old) ? old : undefined;
}

export type SessionCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax";
  maxAge: number;
  path: "/";
};

/** Attributes for a kind. Never a `domain` — the prefix forbids it. */
export function sessionCookieOptions(
  kind: SessionCookieKind,
  maxAge?: number
): SessionCookieOptions {
  const secure = hostPrefixEnabled();
  if (kind === "locale") {
    // Read by the client (use-locale, api client), so not httpOnly.
    return { httpOnly: false, secure, sameSite: "lax", maxAge: maxAge ?? LOCALE_COOKIE_MAX_AGE, path: "/" };
  }
  const fallback = kind === "access" ? ACCESS_COOKIE_MAX_AGE : REFRESH_COOKIE_MAX_AGE;
  return { httpOnly: true, secure, sameSite: "strict", maxAge: maxAge ?? fallback, path: "/" };
}

type CookieWriter = {
  set(name: string, value: string, options: SessionCookieOptions): unknown;
};

/**
 * Expire a cookie. Done with `set(…, maxAge: 0)` and the full attribute set,
 * not `cookies.delete(name)`: a browser drops a `__Host-` Set-Cookie that lacks
 * Secure or Path=/, and that includes the one meant to delete it.
 */
export function expireCookie(
  cookies: CookieWriter,
  name: string,
  kind: SessionCookieKind
): void {
  cookies.set(name, "", { ...sessionCookieOptions(kind), maxAge: 0 });
}

/**
 * Write a fresh session pair (SDL-613 S6a: the BFF refresh). Max-Age comes
 * from what auth-service reported (`sessionMaxAge`); leftover pre-SDL-680
 * names are expired so the readers' fallback cannot pick a stale token.
 */
export function writeSessionPair(
  cookies: CookieWriter,
  pair: { access: string; refresh: string; expiresIn?: unknown; refreshExpiresIn?: unknown }
): void {
  cookies.set(
    sessionCookieName("access"),
    pair.access,
    sessionCookieOptions("access", sessionMaxAge("access", pair.expiresIn, pair.access))
  );
  cookies.set(
    sessionCookieName("refresh"),
    pair.refresh,
    sessionCookieOptions("refresh", sessionMaxAge("refresh", pair.refreshExpiresIn, pair.refresh))
  );
  if (hostPrefixEnabled()) {
    expireCookie(cookies, legacySessionCookieName("access"), "access");
    expireCookie(cookies, legacySessionCookieName("refresh"), "refresh");
  }
}

/** Expire the whole session: current names and, in production, the legacy ones. */
export function expireSession(cookies: CookieWriter): void {
  expireCookie(cookies, sessionCookieName("access"), "access");
  expireCookie(cookies, sessionCookieName("refresh"), "refresh");
  if (hostPrefixEnabled()) {
    expireCookie(cookies, legacySessionCookieName("access"), "access");
    expireCookie(cookies, legacySessionCookieName("refresh"), "refresh");
  }
}

const SESSION_KINDS: SessionCookieKind[] = ["access", "refresh", "locale"];

/** Seconds until the JWT's `exp`, or null when the value is not a JWT. */
export function secondsUntilJwtExpiry(token: string, now = Date.now()): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    if (typeof exp !== "number") return null;
    return Math.floor(exp - now / 1000);
  } catch {
    return null;
  }
}

/**
 * Transition: copy a legacy session PAIR (see readSessionPair) and a valid
 * legacy locale to their `__Host-` names, and expire every legacy name that
 * arrived. A no-op when the prefix is off.
 *
 * The copy keeps the token's remaining life where it can read it (JWT `exp`,
 * capped at the kind's default lifetime), the kind's default otherwise — the
 * browser does not send the old cookie's expiry, and the token's own `exp` is
 * what the gateway enforces anyway.
 */
export function migrateLegacyCookies(
  request: { cookies: CookieReader },
  response: { cookies: CookieWriter }
): void {
  if (!hostPrefixEnabled()) return;

  const pair = readSessionPair(request.cookies);
  if (pair.legacy && pair.access && pair.refresh) {
    for (const [kind, value] of [["access", pair.access], ["refresh", pair.refresh]] as const) {
      const cap = sessionCookieOptions(kind).maxAge;
      const left = secondsUntilJwtExpiry(value);
      const maxAge = left === null ? undefined : Math.min(cap, Math.max(60, left));
      response.cookies.set(sessionCookieName(kind), value, sessionCookieOptions(kind, maxAge));
    }
  }

  const oldLocale = request.cookies.get(legacySessionCookieName("locale"))?.value;
  if (
    legacyFallbackActive() &&
    isLocale(oldLocale) &&
    !request.cookies.get(sessionCookieName("locale"))?.value
  ) {
    response.cookies.set(sessionCookieName("locale"), oldLocale, sessionCookieOptions("locale"));
  }

  // Expire whatever old name arrived — copied, ignored or tossed. (A cookie a
  // subdomain set with its own Domain is not removed by this host-only
  // expiry; after the deadline it is simply never read.)
  for (const kind of SESSION_KINDS) {
    const legacyName = legacySessionCookieName(kind);
    if (request.cookies.get(legacyName) !== undefined) {
      expireCookie(response.cookies, legacyName, kind);
    }
  }
}
