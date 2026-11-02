"use client";

// The sites' base domain on the client side (SDL-687). Read on the server by
// app/(product)/layout.tsx from SITES_BASE_DOMAIN (site-address.ts) and handed
// down here, so a screen deep inside a section reads it with
// useSitesBaseDomain() and never from the environment. Outside the provider it
// is null: no address is printed (fail safe, like the section flags).

import { createContext, useContext } from "react";

const SitesBaseDomainContext = createContext<string | null>(null);

export function SitesBaseDomainProvider({ base, children }: { base: string | null; children: React.ReactNode }) {
  return <SitesBaseDomainContext.Provider value={base}>{children}</SitesBaseDomainContext.Provider>;
}

export function useSitesBaseDomain(): string | null {
  return useContext(SitesBaseDomainContext);
}
