// Server half of policy-strings-context.tsx (SDL-666): resolves the short
// strings of @markerloop/policy against this contour's flags. Call it only on
// the server — the flags are the pod env (readPolicyFlags).
import { policyString } from "@markerloop/policy";
import { defaultLocale, locales } from "@/i18n";
import { readPolicyFlags, type PolicyFlags } from "./product-features";
import { POLICY_STRING_KEYS, type PolicyStrings } from "./policy-string-keys";

/** Key of a string's translation in the resolved map (SDL-743). */
export function localizedPolicyKey(key: string, locale: string): string {
  return `${key}@${locale}`;
}

export function resolvePolicyStrings(flags: PolicyFlags = readPolicyFlags()): PolicyStrings {
  const out: Record<string, string | null> = {};
  for (const key of POLICY_STRING_KEYS) {
    const text = policyString(key, flags);
    out[key] = text;
    if (text === null) continue;
    // The interface locale switches on the client without a reload, so every
    // translation travels down and the hook picks one (the acceptance screen
    // does the same with edition.text, SDL-665). Strings without translations
    // add nothing: policyString returns the Russian text for them.
    for (const locale of locales) {
      if (locale === defaultLocale) continue;
      const translated = policyString(key, flags, locale);
      if (translated !== null && translated !== text) {
        out[localizedPolicyKey(key, locale)] = translated;
      }
    }
  }
  return out;
}
