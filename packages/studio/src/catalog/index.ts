// `@markerloop/studio/catalog` (SDL-678): the assembled pages registry and
// block catalog, shared by the admin's editor and the workspace-site renderer.
// A separate subpath from the package root on purpose: a host that only
// RENDERS pages must not pull the editor shell in with the registry.
// The server-safe entry is `@markerloop/studio/catalog/server`.

export {
  KIT,
  PAGES_BLOCKS,
  PAGES_COMPOUND_PARTS,
  PAGES_COMPOUND_REGISTRY,
  PAGES_PROPS_MANIFEST,
  PAGES_REGISTRY,
  Page,
  PageBlock,
  SUPERSEDED_KIT_ROOTS,
  Section,
  SectionBlock,
  SECTION_BACKGROUNDS,
  SECTION_WIDTHS,
  type SectionBackground,
  type SectionWidth,
  createPagesElementSet,
  isPagesIsolatedType,
  type PagesElementSet,
  type PagesElementSetOptions,
  type SectionProps,
} from "./catalog";
export { KIT_ADAPTER } from "./kit-adapter";
export { FROZEN_REGISTRY_TYPES } from "./registry-contract";
export { PUBLISHED_DEFERRED_ATTR, PublishedNodeBoundary, PublishedPage, type PublishedPageData, type PublishedPageFiles, type PublishedPageProps } from "./published-page";
