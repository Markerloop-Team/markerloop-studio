"use client";

// The admin's pages registry (SDL-605). Assembled in `@markerloop/studio/catalog`
// since SDL-678 — the same set of names the workspace site renders with; the
// admin's only contribution is its data provider for `DataView`: the live
// component that reads the collection's records as the signed-in person.

import type { BlockDefinition } from "@markerloop/engine";
import type { SaunaRegistry } from "@markerloop/engine/react";
import { createPagesElementSet } from "@markerloop/studio/catalog";
import { LiveDataView } from "./data-view";

export {
  KIT,
  PAGES_COMPOUND_PARTS,
  PAGES_COMPOUND_REGISTRY,
  PAGES_PROPS_MANIFEST,
  Page,
  PageBlock,
  SUPERSEDED_KIT_ROOTS,
  Section,
  SectionBlock,
  type SectionProps,
} from "@markerloop/studio/catalog";

const PAGES = createPagesElementSet({ dataView: LiveDataView });

export const PAGES_BLOCKS: readonly BlockDefinition[] = PAGES.blocks;
export const PAGES_REGISTRY: SaunaRegistry = PAGES.registry;
