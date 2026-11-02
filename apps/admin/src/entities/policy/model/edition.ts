// The current edition of the product rules on a contour (SDL-665): what a
// person accepts at sign-up and what the product shell compares with
// policy_accepted_version from GET /users/my.
//
// user-service (SDL-659) stores the edition as a real date YYYY-MM-DD, so the
// edition is the latest effective_date among the sections IN FORCE here — the
// current revision of each section whose every promise is listed in
// POLICY_LIVE_PROMISES. Drafts shown on the test contour are not in force and
// never count. A new revision (owner edit) or a newly live section with a later
// revision (the offer after legal_review) moves the date, and everyone sees the
// acceptance screen again.
import {
  policySections,
  policyString,
  sectionStatus,
  type PolicySection,
} from "@markerloop/policy";
import { defaultLocale, locales, type Locale } from "@/i18n";
import type { PolicyFlags } from "@/shared/config/product-features";

/**
 * `title` is the section's own (Russian) title; `translations` its title in
 * other locales (SDL-784) — the links follow the interface locale.
 */
export type PolicyEditionSection = {
  slug: string;
  title: string;
  translations?: Readonly<Record<string, string>>;
};

/** The section's title in `locale`, its own title when not translated. */
export function editionSectionTitle(section: PolicyEditionSection, locale: string): string {
  return section.translations?.[locale] ?? section.title;
}

/**
 * Owner-approved texts of the acceptance screen and the sign-up checkbox
 * (1 Oct 2026) — keys of packages/policy/strings.json, not of messages/: they
 * live with the rest of the rules and change only on an owner request. Button
 * labels and status lines of the screen stay in next-intl (policyAcceptance).
 */
export const POLICY_ACCEPTANCE_STRINGS = {
  title: "acceptance_title",
  description: "acceptance_description",
  checkbox: "acceptance_checkbox",
} as const;

export type PolicyAcceptanceText = Record<keyof typeof POLICY_ACCEPTANCE_STRINGS, string>;

export type PolicyEdition = {
  /** YYYY-MM-DD — the value written to policy_accepted_version. */
  version: string;
  /** Sections in force here, manifest order — the links next to the checkbox. */
  sections: PolicyEditionSection[];
  /**
   * The acceptance texts for every admin locale, resolved on the server
   * where the contour flags are (policyString needs them); a client screen
   * picks its locale with acceptanceText().
   */
  text: Record<Locale, PolicyAcceptanceText>;
};

function acceptanceTexts(flags: PolicyFlags): Record<Locale, PolicyAcceptanceText> {
  const live = { livePromises: flags.livePromises, showDrafts: false };
  const forLocale = (locale: Locale) =>
    Object.fromEntries(
      Object.entries(POLICY_ACCEPTANCE_STRINGS).map(([field, key]) => [
        field,
        // These strings carry no promise, so null cannot happen today; ""
        // keeps the screen rendering if one is ever given a promise.
        policyString(key, live, locale) ?? "",
      ])
    ) as PolicyAcceptanceText;
  return Object.fromEntries(locales.map((locale) => [locale, forLocale(locale)])) as Record<
    Locale,
    PolicyAcceptanceText
  >;
}

/** The acceptance texts in the viewer's locale; Russian for an unknown one. */
export function acceptanceText(
  edition: Pick<PolicyEdition, "text">,
  locale: string
): PolicyAcceptanceText {
  return edition.text[locale as Locale] ?? edition.text[defaultLocale];
}

type EditionSource = Pick<
  PolicySection,
  "slug" | "title" | "promises" | "effective_date"
> &
  Partial<Pick<PolicySection, "translations">>;

export function currentPolicyEdition(
  flags: PolicyFlags,
  sections: readonly EditionSource[] = policySections()
): PolicyEdition {
  const inForce = sections.filter(
    (section) =>
      sectionStatus(section, {
        livePromises: flags.livePromises,
        showDrafts: false,
      }) === "live"
  );
  // ISO days compare correctly as strings.
  const version = inForce.reduce(
    (latest, section) =>
      section.effective_date > latest ? section.effective_date : latest,
    ""
  );
  return {
    version,
    sections: inForce.map(({ slug, title, translations }) => {
      const titles = Object.fromEntries(
        Object.entries(translations ?? {}).map(([locale, t]) => [locale, t.title])
      );
      return Object.keys(titles).length > 0
        ? { slug, title, translations: titles }
        : { slug, title };
    }),
    text: acceptanceTexts(flags),
  };
}

/**
 * True when the person has to (re)accept: never accepted, or accepted an
 * edition other than the current one. An empty current version (no section in
 * force) asks nothing.
 */
export function needsPolicyAcceptance(
  accepted: string | null | undefined,
  edition: Pick<PolicyEdition, "version">
): boolean {
  if (!edition.version) return false;
  return accepted !== edition.version;
}
