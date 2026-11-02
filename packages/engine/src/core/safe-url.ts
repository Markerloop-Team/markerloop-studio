// Elements carry no author JavaScript and no raw HTML (SDL-681). A page is
// JSON written by a workspace member and served to anonymous visitors on the
// workspace subdomain, so every prop that reaches the DOM is author input.
// Two holes are closed here, server-safe (no React, no DOM):
//
//   1. URL props — `href`, `src` and their kin. Only a string may stand
//      there: React joins an array into one string (`["data:text/html,x"]`
//      becomes `data:text/html,x`), and a number or object is no address.
//      Allowed strings: `http:`, `https:`,
//      `mailto:`, `tel:`, a relative address (no scheme: `/a`, `a`, `#x`,
//      `?q`, `//host`), and in a `src`-like prop also `data:image/*`. The
//      engine's own `mlfile:` reference passes too: the renderer turns it into
//      a URL (or drops it) before anything reaches the DOM. Everything else —
//      `javascript:`, `vbscript:`, `data:text/html`, … — is refused by the
//      validator and dropped by the renderer.
//   2. Raw-HTML and handler props — `dangerouslySetInnerHTML`, `srcDoc` and
//      every `onXxx`. The primitives spread unknown props onto their root
//      element (the editor's node id travels that way), so without this a
//      stored raw-HTML prop holding a script would be written into the
//      visitor's page verbatim.
//
// Both rules are the same in the validator (refuse on read) and the renderer
// (drop on render): a document that slipped past one is caught by the other.

/** Schemes a URL prop may carry. Anything without a scheme is relative and passes. */
export const SAFE_URL_SCHEMES: readonly string[] = ["http:", "https:", "mailto:", "tel:", "mlfile:"];

/** URL attributes, lower-cased: what the browser follows or loads. */
const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "action", "formaction", "poster", "xlink:href", "xlinkhref"]);
/** The one spelling of each a document may use — React's prop name. */
const URL_PROPS: ReadonlySet<string> = new Set(["href", "src", "action", "formAction", "poster", "xlinkHref"]);

/**
 * Prop names that hold an address: the URL attributes and any name ending in
 * `href` / `src` (`imageSrc`, `logoHref`), compared case-insensitively —
 * React writes an unknown `HREF` straight into the DOM, and HTML attribute
 * names are case-insensitive.
 */
export function isUrlPropName(name: string): boolean {
  const l = name.toLowerCase();
  return URL_ATTRS.has(l) || l.endsWith("href") || l.endsWith("src");
}

/** A `src`-like prop: the only kind where `data:image/*` is allowed. */
function isSrcPropName(name: string): boolean {
  const l = name.toLowerCase();
  return l === "poster" || l.endsWith("src");
}

/**
 * Whether `value` may stand in the URL prop `name`. Anything but a string is
 * refused — an array would reach the DOM joined into one string past the
 * scheme check, and a stored document is not typed. Browsers drop leading
 * control characters and spaces and ignore tabs and newlines anywhere in a
 * URL, so `" java\tscript:"` is `javascript:` to them; the check strips the
 * same before reading the scheme (and every other whitespace too, which only
 * makes it stricter).
 */
export function isSafeUrl(value: unknown, name = "href"): boolean {
  if (typeof value !== "string") return false;
  const compact = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase();
  if (scheme === undefined) return true;
  if (SAFE_URL_SCHEMES.includes(`${scheme}:`)) return true;
  return scheme === "data" && isSrcPropName(name) && /^data:image\//i.test(compact);
}

/**
 * Props an Element never accepts from a document, at any depth, compared
 * case-insensitively: raw HTML (`dangerouslySetInnerHTML`, `srcDoc`), every
 * `on…` (handlers in any case — `onclick` reaches the DOM as an attribute),
 * and a URL attribute in any spelling but React's (`HREF`, `formaction`,
 * `xlink:href`): React passes it to the DOM as it is, so its value would
 * bypass the URL check by name.
 */
export function isForbiddenPropName(name: string): boolean {
  const l = name.toLowerCase();
  if (l === "dangerouslysetinnerhtml" || l === "srcdoc" || /^on/.test(l)) return true;
  return URL_ATTRS.has(l) && !URL_PROPS.has(name);
}

export type UnsafePropFinding = {
  /** Dotted path below the props object: `href`, `items[2].href`. */
  path: string;
  /** `url-type` — a URL prop holding something other than a string. */
  reason: "url" | "url-type" | "forbidden";
  /** The refused string (`url`) or the type found instead of one (`url-type`). */
  value?: string;
};

/**
 * A URL prop's value the guard refuses: a string outside the allow list, or
 * any value but a string (an array, number, object, boolean). `null` and
 * `undefined` are an absent value — React writes no attribute for them.
 */
function unsafeUrlValue(value: unknown, name: string): UnsafePropFinding["reason"] | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "url-type";
  return isSafeUrl(value, name) ? null : "url";
}

function typeOf(value: unknown): string {
  return Array.isArray(value) ? "array" : typeof value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Every unsafe entry of a props object, at any depth (a nav item's `href`
 * inside an array counts): a forbidden prop name, an unsafe URL string, or a
 * URL prop holding anything but a string.
 */
export function findUnsafeProps(props: unknown): UnsafePropFinding[] {
  const out: UnsafePropFinding[] = [];
  if (!isPlainRecord(props)) return out;
  const walk = (value: unknown, path: string, key: string | null): void => {
    if (key !== null && isForbiddenPropName(key)) {
      out.push({ path, reason: "forbidden" });
      return;
    }
    if (key !== null && isUrlPropName(key)) {
      // A URL prop is checked as a whole and never walked: its value is
      // either one safe string or refused.
      const reason = unsafeUrlValue(value, key);
      if (reason !== null) out.push({ path, reason, value: reason === "url" ? (value as string) : typeOf(value) });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, null));
    } else if (isPlainRecord(value)) {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, k);
    }
  };
  walk(props, "", null);
  return out;
}

/**
 * A copy of `props` without its unsafe entries (forbidden names, unsafe URL
 * strings and non-string URL props, at any depth). Untouched branches keep their identity; React
 * elements, functions and class instances (an icon resolved from
 * `context.icons`) are not walked.
 */
export function stripUnsafeProps<T extends Record<string, unknown>>(props: T): T {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((v) => {
        const c = clean(v);
        if (c !== v) changed = true;
        return c;
      });
      return changed ? next : value;
    }
    if (!isPlainRecord(value)) return value;
    let next: Record<string, unknown> | null = null;
    for (const [k, v] of Object.entries(value)) {
      if (isForbiddenPropName(k) || (isUrlPropName(k) && unsafeUrlValue(v, k) !== null)) {
        next ??= { ...value };
        delete next[k];
        continue;
      }
      const c = clean(v);
      if (c !== v) {
        next ??= { ...value };
        next[k] = c;
      }
    }
    return next ?? value;
  };
  return clean(props) as T;
}
