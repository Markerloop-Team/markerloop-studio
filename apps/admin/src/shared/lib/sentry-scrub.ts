// Scrubs invite tokens out of everything the browser sends to Sentry
// (SDL-615 S9, risk 8 of the plan).
//
// The invite page removes `#token=` from the address on its first client
// frame, but Sentry initialises earlier (instrumentation-client) and records
// the URL of the page, navigation breadcrumbs and fetch bodies — an error
// thrown before that frame, or a breadcrumb of the very first navigation,
// would carry the token. The hook walks the whole event rather than chasing
// known fields: a future SDK field holding a URL is covered too.

const TOKEN_PARAM = /([#?&]token=)[^&#\s"'<>]+/gi;
/**
 * The same parameter URL-encoded once — e.g. the invite address sitting
 * inside another URL's query (`?referrer=…%23token%3Dmli_…`).
 */
const TOKEN_PARAM_ENCODED = /(token%3D)[^&#\s"'<>%]+/gi;
/**
 * The token's own shape (`mli_` + at least 16 url-safe chars), wherever it
 * ends up — a request body, or glued to `%3D` where a `\b` would not match.
 */
const TOKEN_LITERAL = /mli_[A-Za-z0-9_-]{16,}/g;

/**
 * Presigned storage URLs (SDL-780): the SDK records every XHR/fetch as a
 * breadcrumb with its full URL, and a signed PUT/GET carries a live
 * credential in X-Amz-Signature / X-Amz-Credential / X-Amz-Security-Token.
 * Every X-Amz-* value goes, raw or URL-encoded once.
 */
const AMZ_PARAM = /([?&]X-Amz-[A-Za-z-]+=)[^&#\s"'<>]+/gi;
const AMZ_PARAM_ENCODED = /(X-Amz-[A-Za-z-]+%3D)[^&#\s"'<>%]+/gi;

export const REDACTED = "[redacted]";
export const CIRCULAR = "[Circular]";

export function scrubString(value: string): string {
  return value
    .replace(TOKEN_PARAM, `$1${REDACTED}`)
    .replace(TOKEN_PARAM_ENCODED, `$1${REDACTED}`)
    .replace(TOKEN_LITERAL, REDACTED)
    .replace(AMZ_PARAM, `$1${REDACTED}`)
    .replace(AMZ_PARAM_ENCODED, `$1${REDACTED}`);
}

type Crumb = { category?: string; data?: { [key: string]: unknown } };

/**
 * An xhr/fetch breadcrumb to ANOTHER origin (the storage bucket) loses its
 * whole query string: nothing in a third-party query is ours to keep, and a
 * signature scheme we do not know by name is still a credential. Same-origin
 * calls keep their query (it is scrubbed by scrubDeep like everything else).
 */
export function stripForeignQuery<T extends Crumb>(crumb: T, ownOrigin: string): T {
  if (crumb.category !== "xhr" && crumb.category !== "fetch") return crumb;
  const raw = crumb.data?.url;
  if (typeof raw !== "string") return crumb;
  let parsed: URL;
  try {
    parsed = new URL(raw, ownOrigin);
  } catch {
    return crumb;
  }
  if (parsed.origin === ownOrigin || !parsed.search) return crumb;
  return { ...crumb, data: { ...crumb.data, url: `${parsed.origin}${parsed.pathname}?${REDACTED}` } };
}

/** Nesting past this is cut: DOM nodes / React fibers in breadcrumbs are deep. */
export const MAX_DEPTH = 10;
export const DEPTH_CUT = "[depth]";

/**
 * Deep copy with every string scrubbed — values AND object keys (a token
 * can end up as a key, e.g. a map keyed by URL).
 *
 * An object referenced twice (the SDK shares objects between `request` and
 * `contexts`, say) is copied once and that copy is reused — returning the
 * original on the second visit would ship it unscrubbed. A true cycle (an
 * object reached again while it is still being copied) becomes "[Circular]";
 * anything nested deeper than MAX_DEPTH becomes "[depth]", so a DOM node or
 * a React fiber in a breadcrumb cannot overflow the stack. An Error becomes
 * its scrubbed stack (or message), a Date its ISO string.
 */
export function scrubDeep<T>(value: T): T {
  const copies = new WeakMap<object, unknown>();
  const inProgress = new WeakSet<object>();

  const walk = (item: unknown, depth: number): unknown => {
    if (typeof item === "string") return scrubString(item);
    if (typeof item !== "object" || item === null) return item;
    if (item instanceof Error) return scrubString(item.stack ?? String(item));
    if (item instanceof Date) {
      return Number.isNaN(item.getTime()) ? String(item) : item.toISOString();
    }
    if (inProgress.has(item)) return CIRCULAR;
    if (copies.has(item)) return copies.get(item);
    if (depth >= MAX_DEPTH) return DEPTH_CUT;
    inProgress.add(item);
    let copy: unknown;
    if (Array.isArray(item)) {
      copy = item.map((child: unknown) => walk(child, depth + 1));
    } else {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        out[scrubString(key)] = walk(child, depth + 1);
      }
      copy = out;
    }
    inProgress.delete(item);
    copies.set(item, copy);
    return copy;
  };

  // SDL-780: in the browser an xhr/fetch crumb to the storage keeps no query
  // (presigned credentials) — applied here so beforeBreadcrumb stays the one
  // `scrubDeep(breadcrumb)` call the invite smoke guards.
  const origin =
    typeof globalThis.location === "object" && globalThis.location ? globalThis.location.origin : null;
  const start =
    origin && typeof value === "object" && value !== null && !Array.isArray(value)
      ? stripForeignQuery(value as Crumb, origin)
      : value;
  return walk(start, 0) as T;
}
