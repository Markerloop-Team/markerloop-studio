// `@markerloop/engine/providers/pages` — the storage provider over
// pages-service, reached through the gateway with a workspace scope
// (SDL-603). The one provider the admin uses; `./providers/http` stays as
// the generic ETag/If-Match adapter it was in the reference.
export {
  createPagesServiceProvider,
  type PagesServiceProviderOptions,
  type PagesServiceDocumentKind,
} from "./provider";
