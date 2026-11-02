"use client";

import * as React from "react";

import type { SaunaId } from "../schema/types";
import type { SaunaComponentCatalog } from "./catalog";
import type { SaunaContext, SaunaRegistry } from "./types";

export type SaunaEndpointFn = (id: SaunaId) => string;

export type SaunaProviderProps = {
  /** Component map. Must be supplied here or via the `registry` prop on `<Sauna>`. */
  registry?: SaunaRegistry;
  /**
   * Runtime context for visibility rules, variants, and legacy render
   * helpers (icons / can / link). Merged with any per-instance `extra`
   * passed to `<Sauna>`.
   */
  context?: SaunaContext;
  /**
   * Builds the URL `<Sauna>` fetches schema from. Defaults to
   * `/api/sauna/<id>`. Override to point at a different route handler.
   */
  endpoint?: SaunaEndpointFn;
  /** Optional component catalog. The Studio uses it; pure render does not. */
  catalog?: SaunaComponentCatalog;
  children: React.ReactNode;
};

export type SaunaProviderValue = {
  registry?: SaunaRegistry;
  context?: SaunaContext;
  endpoint?: SaunaEndpointFn;
  catalog?: SaunaComponentCatalog;
};

const SaunaInternalContext = React.createContext<SaunaProviderValue | null>(null);

/**
 * Top-level wrapper that supplies registry, context, endpoint, and
 * catalog to nested `<Sauna>` instances via React Context.
 *
 * Backward-compatible: `<Sauna>` still accepts the same props directly.
 * When both are present, props win over the provider.
 */
export function SaunaProvider({
  registry,
  context,
  endpoint,
  catalog,
  children,
}: SaunaProviderProps) {
  const value = React.useMemo<SaunaProviderValue>(
    () => ({ registry, context, endpoint, catalog }),
    [registry, context, endpoint, catalog]
  );

  return (
    <SaunaInternalContext.Provider value={value}>{children}</SaunaInternalContext.Provider>
  );
}

/**
 * Read the surrounding `<SaunaProvider>` value. Returns `null` outside
 * a provider — `<Sauna>` falls back to its own props in that case.
 */
export function useSaunaContext(): SaunaProviderValue | null {
  return React.useContext(SaunaInternalContext);
}
