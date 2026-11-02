// Product rules on a contour (SDL-658): packages/policy holds the texts, the
// pod env (readPolicyFlags) says which promises are in force here. Pure — the
// pages, the route handler and smoke:policy all go through these two calls.
import {
  policySection,
  policySections,
  sectionStatus,
  type PolicySection,
  type PolicyStatus,
} from "@markerloop/policy";
import type { PolicyFlags } from "@/shared/config/product-features";

export type VisiblePolicySection = PolicySection & {
  status: Exclude<PolicyStatus, "hidden">;
};

/** Sections this contour shows, in manifest order; hidden ones are absent. */
export function visiblePolicySections(
  flags: PolicyFlags
): VisiblePolicySection[] {
  return policySections().flatMap((section) => {
    const status = sectionStatus(section, flags);
    return status === "hidden" ? [] : [{ ...section, status }];
  });
}

/** One section, or null when it does not exist or is hidden here (→ 404). */
export function resolvePolicySection(
  slug: string,
  flags: PolicyFlags
): VisiblePolicySection | null {
  const section = policySection(slug);
  if (!section) return null;
  const status = sectionStatus(section, flags);
  return status === "hidden" ? null : { ...section, status };
}

// next-intl locale → the BCP 47 tag dates are written in.
const DATE_LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-GB", kk: "kk-KZ" };

/**
 * "29 сентября 2026" / "29 September 2026" — effective dates are calendar
 * days, read in UTC, written in the interface locale (Russian by default).
 */
export function formatEffectiveDate(isoDay: string, locale = "ru"): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString(DATE_LOCALES[locale] ?? "ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Titles of all sections and the slugs visible here — for [[slug]] links.
 * `titlesByLocale` carries the translated titles (SDL-784): the client picks
 * them with localizeSectionRefs, since the locale switches without a reload.
 */
export function policySectionRefs(flags: PolicyFlags): {
  titles: Record<string, string>;
  titlesByLocale: Record<string, Record<string, string>>;
  visible: string[];
} {
  const all = policySections();
  const titlesByLocale: Record<string, Record<string, string>> = {};
  for (const section of all) {
    for (const [locale, t] of Object.entries(section.translations)) {
      (titlesByLocale[locale] ??= {})[section.slug] = t.title;
    }
  }
  return {
    titles: Object.fromEntries(all.map((s) => [s.slug, s.title])),
    titlesByLocale,
    visible: visiblePolicySections(flags).map((s) => s.slug),
  };
}
