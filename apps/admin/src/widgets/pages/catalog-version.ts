// The pages catalog version (EP-128, SDL-668): sha256 over the Element
// catalog manifest `element-catalog.json` — every Element type with the
// version of its props contract. It moves when an Element is added, removed
// or bumps `propsVersion`, and only then; a look-only change of a component
// does not move it. Served by /api/health next to `build`.
//
// Server-safe: reads the generated JSON only. Regenerate the file with
// `pnpm --filter admin catalog:manifest`; `smoke:pages` fails on a stale one.

import manifest from "./element-catalog.json";

export const PAGES_CATALOG_VERSION: string = manifest.catalogVersion;
