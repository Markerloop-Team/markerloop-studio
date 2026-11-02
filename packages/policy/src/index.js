// @markerloop/policy runtime (SDL-658). Plain ESM, copied to dist/ as is;
// types are in index.d.ts next to it.
import { limits, promiseKeys, sections, strings } from "./content.js";

export const LIMIT_PLACEHOLDER = /\{\{\s*limit:([a-z0-9_]+)\s*\}\}/g;

export const policyLimits = limits;
export const policyPromiseKeys = promiseKeys;

/** "256 KB", "1000", "10 %" — the value from limits.json and its unit. */
export function formatLimit(key) {
  const limit = limits[key];
  if (!limit) throw new Error(`@markerloop/policy: unknown limit "${key}"`);
  return limit.unit ? `${limit.value} ${limit.unit}` : String(limit.value);
}

/** Replaces every {{limit:key}} with its value; an unknown key throws. */
export function fillLimits(text) {
  return text.replace(LIMIT_PLACEHOLDER, (_, key) => formatLimit(key));
}

/**
 * The label of a limit in `locale` (limits.json `translations`, SDL-784);
 * Russian `label` for ru, for a locale without a translation and without one.
 */
export function limitLabel(key, locale) {
  const limit = limits[key];
  if (!limit) throw new Error(`@markerloop/policy: unknown limit "${key}"`);
  return (locale && limit.translations?.[locale]) || limit.label;
}

// SDL-784: a section may carry the same text in another language
// (sections/<locale>/<slug>.md). A translation is not a revision: version,
// effective_date and sha256 stay the Russian ones. Every translation travels
// with the section (limits filled), so a client screen whose locale switches
// without a reload can pick one — like the short strings.
function toPublic(section) {
  const translations = Object.fromEntries(
    Object.entries(section.translations ?? {}).map(([locale, t]) => [
      locale,
      { title: t.title, body: fillLimits(t.body) },
    ])
  );
  return { ...section, body: fillLimits(section.body), translations };
}

/** Every section in manifest order, limits already substituted. */
export function policySections() {
  return sections.map(toPublic);
}

export function policySection(slug) {
  const section = sections.find((s) => s.slug === slug);
  return section ? toPublic(section) : null;
}

/**
 * Where a section stands on a contour:
 *  - "live"   — every promise it carries is in force here;
 *  - "draft"  — some promise is not, but the contour shows drafts
 *               (test, POLICY_SHOW_DRAFTS=true): shown with a banner;
 *  - "hidden" — some promise is not and drafts are off: 404.
 * A section without promises is always live.
 */
export function sectionStatus(section, flags) {
  const live = new Set(flags.livePromises);
  const inForce = section.promises.every((p) => live.has(p));
  if (inForce) return "live";
  return flags.showDrafts ? "draft" : "hidden";
}

/** [[slug]] — a reference to another section inside a body. */
export const SECTION_REF = /\[\[([a-z0-9-]+)\]\]/g;

/** Title of a section by slug (in `locale` when translated), or null. */
export function sectionTitle(slug, locale) {
  const section = sections.find((s) => s.slug === slug);
  if (!section) return null;
  return (locale && section.translations?.[locale]?.title) || section.title;
}

/** Replaces every [[slug]] with «Title» — for plain-text consumers (API). */
export function refsToTitles(text, locale) {
  return text.replace(SECTION_REF, (_, slug) => `«${sectionTitle(slug, locale) ?? slug}»`);
}

export const policyStringKeys = Object.keys(strings);

/**
 * Short string for dialogs and messages of other screens, limits filled —
 * or null when any promise it carries is not in force on this contour.
 * `flags` is required: a string must never be shown where it is not true.
 * `locale` picks `translations[locale]` when the string has one (the
 * acceptance screen and the sign-up checkbox, SDL-665); `text` is Russian and
 * is what every other locale, and a call without one, gets.
 */
export function policyString(key, flags, locale) {
  const entry = strings[key];
  if (!entry) throw new Error(`@markerloop/policy: unknown string "${key}"`);
  if (!flags) throw new Error("@markerloop/policy: policyString needs the contour flags");
  const live = new Set(flags.livePromises);
  if (!entry.promises.every((p) => live.has(p))) return null;
  const text = (locale && entry.translations?.[locale]) || entry.text;
  return fillLimits(text);
}
