"use client";

// The product rules' short strings on the client (SDL-666).
//
// @markerloop/policy decides per contour whether a string may be shown
// (`policyString(key, flags)` is null where a promise it carries is not in
// force), and the flags are the pod's env — readable only on the server. So the
// product layout resolves every string ON THE SERVER (resolvePolicyStrings) and
// hands the finished map down here; a dialog reads it with usePolicyString(key).
// The client bundle never carries the policy package or the flags, and no
// screen keeps a copy of a policy sentence in messages/ (smoke:usage-limits
// fails on one).
//
// Outside the provider every string is null — the fail-safe answer, same as an
// absent POLICY_LIVE_PROMISES: a screen nobody wired must not promise anything.

import { useLocale } from "next-intl";
import { createContext, useContext, useEffect } from "react";
import { setQuotaRefusalCopy } from "@/shared/lib/api/limit-refusal";
import type { PolicyStringKey, PolicyStrings } from "./policy-string-keys";

const PolicyStringsContext = createContext<PolicyStrings>({});

export function PolicyStringsProvider({
  strings,
  children,
}: {
  strings: PolicyStrings;
  children: React.ReactNode;
}) {
  const refused = strings.limit_write_refused ?? null;
  // apiClient has no React context; it reads the refusal sentence from here.
  // Also set during render so the very first request of the page has it.
  setQuotaRefusalCopy(refused);
  useEffect(() => {
    setQuotaRefusalCopy(refused);
  }, [refused]);
  return <PolicyStringsContext.Provider value={strings}>{children}</PolicyStringsContext.Provider>;
}

/**
 * The sentence in the interface locale where strings.json translates it
 * (`key@<locale>`, resolved on the server), otherwise its Russian `text`.
 * Null stays null in every locale: whether a string is in force does not
 * depend on the language.
 */
export function usePolicyString(key: PolicyStringKey): string | null {
  const strings = useContext(PolicyStringsContext);
  const locale = useLocale();
  const text = strings[key] ?? null;
  if (text === null) return null;
  return strings[`${key}@${locale}`] ?? text;
}
