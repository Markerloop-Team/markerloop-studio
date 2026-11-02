import { NextResponse } from "next/server";
import { limitLabel, policyLimits, refsToTitles } from "@markerloop/policy";
import { locales, type Locale } from "@/i18n";
import { readPolicyFlags } from "@/shared/config/product-features";
import {
  currentPolicyEdition,
  localizeSection,
  visiblePolicySections,
} from "@/entities/policy";

// SDL-784: limits.json also holds the numbers of the Terms and the Privacy
// Policy (periods, the liability cap, cookie lifetimes) so that their prose
// never carries a bare digit. They are terms of the contract, not limits of a
// workspace, and stay out of the `limits` table this route returns.
const CONTRACT_TERMS = new Set([
  "purge_hours",
  "log_retention_days",
  "sentry_retention_days",
  "backup_days",
  "invitation_log_days",
  "content_copy_days",
  "dispute_settlement_days",
  "service_closing_notice_days",
  "liability_cap_usd",
  "access_token_hours",
  "refresh_token_hours",
  "locale_cookie_years",
]);
const workspaceLimitKeys = Object.keys(policyLimits).filter(
  (key) => !CONTRACT_TERMS.has(key)
);

// SDL-784: `?locale=en` returns the sections that have an English text in
// English and the limits with English labels; without it (or ru, kk, an
// unknown value) the answer is the Russian one, as before. version, sha256 and
// the edition are the same in every locale: a translation is not a revision.
function workspaceLimits(locale: Locale | null) {
  return Object.fromEntries(
    workspaceLimitKeys.map((key) => [
      key,
      locale
        ? { ...policyLimits[key], label: limitLabel(key, locale) }
        : policyLimits[key],
    ])
  );
}

function requestedLocale(request?: Request): Locale | null {
  if (!request) return null;
  const value = new URL(request.url).searchParams.get("locale");
  return value && value !== "ru" && locales.includes(value as Locale)
    ? (value as Locale)
    : null;
}

// GET /api/policy (SDL-658): the product rules as JSON — a stable address for
// the markerloop MCP (EP-20). Same visibility as /rules: a section whose
// promises are not all in force is absent, or present with status "draft"
// where the contour shows drafts. The limits table is a claim of the limits
// section, so it travels only with that section: absent when the section is
// hidden, marked "draft" when it is shown as a draft. Outside /api/v1 on
// purpose: that prefix belongs to the gateway.
export const dynamic = "force-dynamic";

export function GET(request?: Request) {
  const flags = readPolicyFlags();
  const locale = requestedLocale(request);
  const visible = visiblePolicySections(flags);
  const sections = visible.map((original) => {
    const section = locale ? localizeSection(original, locale) : original;
    return {
      slug: section.slug,
      title: section.title,
      version: section.version,
      effective_date: section.effective_date,
      sha256: section.sha256,
      status: section.status,
      in_force: section.status === "live",
      promises: section.promises,
      url: `/rules/${section.slug}`,
      body: refsToTitles(section.body, locale ?? undefined),
    };
  });
  const limitsSection = visible.find((section) => section.slug === "limits");
  // The edition an account accepts on this contour (SDL-665): the value for
  // PUT /users/my {policy_accepted_version} — e.g. for a test harness session.
  const edition = currentPolicyEdition(flags).version;
  return NextResponse.json(
    limitsSection
      ? {
          edition,
          sections,
          limits: workspaceLimits(locale),
          limits_status: limitsSection.status,
        }
      : { edition, sections },
    { headers: { "Cache-Control": "no-store" } }
  );
}
