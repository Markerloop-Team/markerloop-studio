"use client";

// Carries the contour's current rules edition (computed on the server from the
// pod env, SDL-665) to client screens: the sign-up form and the product shell.
import { createContext, useContext } from "react";
import type { PolicyEdition } from "./edition";

const PolicyEditionContext = createContext<PolicyEdition | null>(null);

export function PolicyEditionProvider({
  edition,
  children,
}: {
  edition: PolicyEdition;
  children: React.ReactNode;
}) {
  return (
    <PolicyEditionContext.Provider value={edition}>
      {children}
    </PolicyEditionContext.Provider>
  );
}

/** null outside a provider — callers treat it as "no edition known". */
export function usePolicyEdition(): PolicyEdition | null {
  return useContext(PolicyEditionContext);
}
