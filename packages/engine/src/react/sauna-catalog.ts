import type { SaunaComponentCatalog, SaunaElementAdapter } from "./catalog";
import type { SaunaRegistry } from "./types";
import { createSaunaComponentCatalog } from "./sauna-component-catalog";
import { createSaunaRegistry } from "./sauna-registry";

export type CreateSaunaCatalogOptions = {
  include?: string[];
  exclude?: string[];
  /** Editor-side data for each Component — its group (SDL-629). */
  adapter?: SaunaElementAdapter;
};

/**
 * Both halves the kit yields, kept as two objects (SDL-629): `registry`
 * answers "what to render with", `catalog` "what to offer for insertion".
 */
export type SaunaCatalog = {
  registry: SaunaRegistry;
  catalog: SaunaComponentCatalog;
};

export function createSaunaCatalog(
  ui: Record<string, unknown>,
  options?: CreateSaunaCatalogOptions
): SaunaCatalog {
  return {
    registry: createSaunaRegistry(ui, options),
    catalog: createSaunaComponentCatalog(ui, options),
  };
}

