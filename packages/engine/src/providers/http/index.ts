// Sunday-Sauna `./providers/http` subpath.
//
// HTTP-backed `SaunaProvider`:
//   - PUT with `If-Match` for optimistic concurrency
//   - 412 surfaces as `SaunaConflictError`
//   - 404 surfaces as `SaunaNotFoundError`
//   - opaque `SaunaVersion` carried via `ETag`
//
// Pairs with `next/route-handlers.ts`, which exposes the matching
// server side.
export {
  createHttpProvider,
  type HttpProviderHeaders,
  type HttpProviderOptions,
  type HttpProviderNextOptions,
  type MapResponseFn,
  type SerializeBodyFn,
  type BuildUrlFn,
} from "./provider";
