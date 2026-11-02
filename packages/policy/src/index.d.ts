export type PolicyStatus = "live" | "draft" | "hidden";

export type PolicyFlags = {
  /** Promise keys in force on this contour (POLICY_LIVE_PROMISES). */
  livePromises: readonly string[];
  /** POLICY_SHOW_DRAFTS=true: sections not in force are shown with a banner. */
  showDrafts: boolean;
};

export type PolicyLimit = {
  value: number;
  unit: string;
  /** Russian label. */
  label: string;
  /** The label in other locales (SDL-784); absent locales read `label`. */
  translations?: Readonly<Record<string, string>>;
};

/** A section's text in another language, limits substituted (SDL-784). */
export type PolicySectionTranslation = { title: string; body: string };

export type PolicySection = {
  slug: string;
  title: string;
  /** Markdown body, limits substituted, title line removed. */
  body: string;
  /**
   * The same section in other locales ("en"), limits substituted. Not a
   * revision: version, effective_date and sha256 are the section's own.
   * A locale absent here reads `title`/`body`.
   */
  translations: Readonly<Record<string, PolicySectionTranslation>>;
  promises: readonly string[];
  version: number;
  effective_date: string;
  sha256: string;
  owner_request: string;
};

export declare const LIMIT_PLACEHOLDER: RegExp;
export declare const policyLimits: Readonly<Record<string, PolicyLimit>>;
export declare const policyPromiseKeys: readonly string[];
export declare const policyStringKeys: readonly string[];
export declare function formatLimit(key: string): string;
export declare function fillLimits(text: string): string;
export declare function limitLabel(key: string, locale?: string): string;
export declare function policySections(): PolicySection[];
export declare function policySection(slug: string): PolicySection | null;
export declare function sectionStatus(
  section: Pick<PolicySection, "promises">,
  flags: PolicyFlags
): PolicyStatus;
export declare const SECTION_REF: RegExp;
export declare function sectionTitle(slug: string, locale?: string): string | null;
export declare function refsToTitles(text: string, locale?: string): string;
/**
 * null when any promise of the string is not in force under `flags`.
 * `locale` ("en", "kk") picks the string's translation when it has one;
 * otherwise, and for "ru", the Russian `text`.
 */
export declare function policyString(
  key: string,
  flags: PolicyFlags,
  locale?: string
): string | null;
