# `@markerloop/engine/providers/http`

> Copied as-is from the reference (SDL-603); import paths below still read
> `sunday-sauna/...` — in this repo they are `@markerloop/engine/...`. The
> provider the admin uses is `@markerloop/engine/providers/pages` (see the
> package README); this generic ETag/If-Match adapter is kept for the
> matching `@markerloop/engine/next` route handlers.

HTTP-backed `SaunaProvider`. Reads and writes Sauna schemas over a
REST endpoint with ETag-based optimistic concurrency.

## When to use

- **Studio** that saves to a remote server (not local files).
- **Render route** that pulls schema from `sauna-service` or any
  other HTTP origin at request time.
- **Anywhere** the schema lives behind an HTTP API rather than on
  the local filesystem.

This is the only provider implementation: the local-file flavour that used
to back a default on-disk mode was removed in SDL-262.

## Quick start

### Default shape — bare schema body + ETag version

```ts
import { createHttpProvider } from "sunday-sauna/providers/http";

const provider = createHttpProvider({
  baseUrl: "/api/sauna",
});

// GET /api/sauna/dashboard
// expects: 200, body = SaunaSchema, header `ETag: <version>`
const snap = await provider.get("dashboard");

// PUT /api/sauna/dashboard
// sends: body = SaunaSchema, optional `If-Match: <prev version>`
// expects: 200, header `ETag: <new version>` (or 412 on conflict)
const { version } = await provider.put("dashboard", snap.schema, {
  ifMatch: snap.version,
});
```

This is the shape `sunday-sauna/next/route-handlers` produces — both
sides match by construction.

### Adapter — non-default response shape

When the upstream wraps the schema in an envelope (e.g. `sauna-service`
returns `Page` with the schema nested under `body` and the version
as a plain integer field):

```ts
import { createHttpProvider } from "sunday-sauna/providers/http";

type PageEnvelope = {
  id: string;
  body: import("sunday-sauna").SaunaSchema;
  version: number;
};

const provider = createHttpProvider({
  baseUrl: "https://api.example.com/v1/sauna/pages",
  headers: { Authorization: `Bearer ${process.env.SAUNA_API_TOKEN}` },

  mapResponse: (raw) => {
    const env = raw as PageEnvelope;
    return { schema: env.body, version: String(env.version) };
  },

  serializeBody: (schema, id) => ({ id, body: schema, version: 0 }),
});
```

`mapResponse` runs on every `get()` response, `serializeBody` on
every `put()` body. Defaults pass through the schema verbatim.

### Next.js cache integration

Pass `nextFetchOptions` to forward `init.next` to every fetch call.
Next.js uses it to populate the data cache and react to
`revalidateTag()`.

```ts
const provider = createHttpProvider({
  baseUrl: "https://api.example.com/v1/sauna/pages",
  cache: "force-cache",
  nextFetchOptions: {
    tags: ["sauna:pages"],
    revalidate: 60,
  },
});
```

When a webhook fires `revalidateTag("sauna:pages")` on the
Next.js side, the next `provider.get()` re-fetches; everything
served between cache refreshes hits the cache.

For PUT calls the provider always sets `cache: "no-store"` —
writes never read or populate the cache, regardless of the
`cache` option above.

### Non-default URL shapes (`buildUrl`)

When the upstream does not follow `<baseUrl>/<id>` — e.g. it expects
a slug as a query argument, or it routes reads and writes through
different endpoints — pass a `buildUrl` callback:

```ts
createHttpProvider({
  baseUrl: "https://api.example.com/v1/sauna",

  buildUrl: ({ baseUrl, id, method }) => {
    // GET by slug:  /pages/by-path?site_id=…&path=<id>
    // PUT by uuid:  /pages/<id>
    return method === "GET"
      ? `${baseUrl}/pages/by-path?site_id=${SITE_ID}&path=${encodeURIComponent(id)}`
      : `${baseUrl}/pages/${id}`;
  },

  mapResponse: (raw) => {
    const env = (raw as { data: PageEnvelope }).data;
    return { schema: env.body, version: String(env.version) };
  },
});
```

The `method` discriminator means a single provider can resolve
GET and PUT to different URL shapes — important when the upstream
exposes slug-based reads but UUID-based writes (sauna-service does
exactly that).

When omitted, the default is `<baseUrl>/<encodeURIComponent(id)>`
for both methods — matches `sunday-sauna/next/route-handlers`
contract, so most consumers never override.

### Auth headers — static or async

```ts
const provider = createHttpProvider({
  baseUrl: "/api/sauna",
  headers: async () => ({
    Authorization: `Bearer ${await getCurrentToken()}`,
  }),
});
```

The function runs on every request; cache the token if you have
many calls in tight loops.

## Error model

| HTTP | Thrown |
|---|---|
| 404 | `SaunaNotFoundError` |
| 412 | `SaunaConflictError` (with `latestVersion` from response `ETag` when present) |
| other non-2xx | generic `Error` with `<method> <id> failed: <status> <text>` |

Use the bundler-safe type guards `isSaunaNotFoundError` /
`isSaunaConflictError` from the root `sunday-sauna` export instead
of `instanceof` — see
`memory/feedback_instanceof_across_bundles.md`.

## Server contract (default mode)

If you're writing the server side from scratch, this is the contract
the provider expects without adapters:

- **GET `/<id>`**
  - 200: body = JSON schema (any valid `SaunaSchema`; v1 schemas are
    migrated client-side).
  - Header `ETag` carries the version. Required for optimistic
    concurrency; missing ETag = empty string → `put` cannot use
    `ifMatch`.
  - 404 → not found, schema absent.

- **PUT `/<id>`**
  - Body = JSON `SaunaSchema`.
  - `Content-Type: application/json`, `Accept: application/json`.
  - `If-Match: <version>` when caller wants to fail on concurrent
    writes.
  - 200: header `ETag` = new version.
  - 412: rejected on If-Match mismatch.
  - 404: target absent.

`sunday-sauna/next/route-handlers` exposes a `createSaunaRouteHandlers(provider)`
helper that mounts a Next.js route handler matching this contract,
so the round-trip is built-in when both ends are within this
package.
