// The frozen list of registry names (SDL-608) lives with the registry in
// `packages/studio/src/catalog/registry-contract.ts` since SDL-678; retire a
// name there, by hand. Re-exported for the admin's smokes, which import it by
// this path.
export { FROZEN_REGISTRY_TYPES } from "@markerloop/studio/catalog";
