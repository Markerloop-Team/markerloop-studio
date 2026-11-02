// An in-app announcement from the contour's configuration (SDL-744, EP-142).
//
// Why it exists: an e-mail is optional at sign-up, so a person without one
// never hears "the terms change in 15 days" or "there was a leak" by mail.
// The product shell shows this strip to everyone signed in instead.
//
// Same mechanism and same reasons as the runtime flags in product-features.ts:
// prod runs the very image the test contour passed, so the text can only come
// from the pod's own environment, read on the server per request
// (app/(product)/layout.tsx is force-dynamic). In a browser bundle these vars
// are undefined, which reads as "no announcement".
//
// Fail safe everywhere: an empty, broken or expired value means NO strip and
// never an error — a typo in a configmap must not take the product down.

/**
 * Pod env var: JSON object with the text per admin locale, e.g.
 * `{"ru":"…","en":"…","kk":"…"}`. Keys other than ru/en/kk are ignored;
 * empty strings count as absent. Empty, not JSON, not an object, or no text
 * at all → no announcement.
 */
export const PRODUCT_NOTICE_ENV = "PRODUCT_NOTICE";

/**
 * Pod env var: the moment the announcement stops showing. ISO 8601: either a
 * date `2026-10-22` (= 00:00 UTC of that day) or a date-time WITH an offset,
 * `2026-10-22T18:00:00+05:00` / `…Z`. A date-time without an offset is refused
 * (it would mean the pod's local time, which nobody can see), as is anything
 * unparsable — refused = no announcement. Empty = no end date.
 */
export const PRODUCT_NOTICE_UNTIL_ENV = "PRODUCT_NOTICE_UNTIL";

export const PRODUCT_NOTICE_LOCALES = ["ru", "en", "kk"] as const;
export type ProductNoticeLocale = (typeof PRODUCT_NOTICE_LOCALES)[number];

/** The fallback when the reader's locale has no text (then ru, then kk). */
const FALLBACK_ORDER: readonly ProductNoticeLocale[] = ["en", "ru", "kk"];

export type ProductNotice = {
  /**
   * Hash of the texts. The browser remembers "hidden" under a key that
   * contains it, so a NEW announcement shows again to someone who hid the
   * previous one, while the same text under a moved end date stays hidden.
   */
  id: string;
  text: Partial<Record<ProductNoticeLocale, string>>;
  /** Normalized ISO instant (UTC), or null = no end date. */
  until: string | null;
};

type Env = Record<string, string | undefined>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `null` = no end date; `undefined` = refused (broken value). Exported for the
 * smoke; callers use readProductNotice.
 */
export function parseNoticeUntil(raw: string | undefined): number | null | undefined {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (!DATE_ONLY.test(value) && !DATE_TIME_WITH_OFFSET.test(value)) return undefined;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  // Date.parse rolls 2026-02-31 over to March; a date that does not survive
  // the round trip is a typo, not a deadline.
  if (DATE_ONLY.test(value) && new Date(at).toISOString().slice(0, 10) !== value) {
    return undefined;
  }
  return at;
}

function parseNoticeText(raw: string | undefined): ProductNotice["text"] | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const text: ProductNotice["text"] = {};
  for (const locale of PRODUCT_NOTICE_LOCALES) {
    const item = record[locale];
    if (typeof item === "string" && item.trim() !== "") text[locale] = item.trim();
  }
  return Object.keys(text).length > 0 ? text : null;
}

/** FNV-1a, 32 bit — stable on the server and in the browser, no crypto needed. */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function productNoticeId(text: ProductNotice["text"]): string {
  const canonical = PRODUCT_NOTICE_LOCALES.map((locale) => [locale, text[locale] ?? ""]);
  return hashString(JSON.stringify(canonical));
}

const warned = new Set<string>();

/** One line per distinct broken value per process, not one per request. */
function warnOnce(what: string, value: string): void {
  const key = `${what}\u0000${value}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`product notice: ${what} is not valid, no announcement is shown`);
}

/**
 * The announcement in force now, or null. Server only (reads the pod env).
 */
export function readProductNotice(
  env: Env = process.env,
  now: number = Date.now()
): ProductNotice | null {
  const rawText = env[PRODUCT_NOTICE_ENV];
  const text = parseNoticeText(rawText);
  if (!text) {
    if ((rawText ?? "").trim() !== "") warnOnce(PRODUCT_NOTICE_ENV, rawText ?? "");
    return null;
  }
  const rawUntil = env[PRODUCT_NOTICE_UNTIL_ENV];
  const until = parseNoticeUntil(rawUntil);
  if (until === undefined) {
    warnOnce(PRODUCT_NOTICE_UNTIL_ENV, rawUntil ?? "");
    return null;
  }
  if (until !== null && now >= until) return null;
  return {
    id: productNoticeId(text),
    text,
    until: until === null ? null : new Date(until).toISOString(),
  };
}

/** True once the end date has passed (a tab left open past it). */
export function isProductNoticeExpired(notice: ProductNotice, now: number = Date.now()): boolean {
  return notice.until !== null && now >= Date.parse(notice.until);
}

/**
 * The text for the reader's locale (next-intl), else en, else ru, else kk.
 * Null only if the notice carries no text at all, which readProductNotice
 * never returns.
 */
export function productNoticeText(notice: ProductNotice, locale: string): string | null {
  const own = (PRODUCT_NOTICE_LOCALES as readonly string[]).includes(locale)
    ? notice.text[locale as ProductNoticeLocale]
    : undefined;
  if (own) return own;
  for (const fallback of FALLBACK_ORDER) {
    const value = notice.text[fallback];
    if (value) return value;
  }
  return null;
}
