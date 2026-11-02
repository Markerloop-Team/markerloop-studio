// The Element catalog version this build renders with (EP-128, SDL-668),
// sent to pages-service as `X-Element-Catalog` with every snapshot read.
//
// The site renders through the same `@markerloop/studio/catalog` registry as
// the admin's editor, so its catalog is the admin's manifest at the same
// commit. The manifest is generated and checked by the admin
// (`pnpm --filter admin catalog:manifest`, `smoke:pages`); the site only reads
// it. The Dockerfile copies this one file next to the site sources.
import manifest from "../../../admin/src/widgets/pages/element-catalog.json";

export const PAGES_CATALOG_VERSION: string = manifest.catalogVersion;
