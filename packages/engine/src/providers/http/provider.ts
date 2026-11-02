import type { SaunaAnySchema, SaunaId, SaunaSchema } from "../../schema/types";
import { migrateSaunaSchema } from "../../schema/migrate";
import { validateSaunaSchema } from "../../schema/validate";
import { SaunaConflictError, SaunaNotFoundError } from "../errors";
import type {
  SaunaProvider,
  SaunaPutOptions,
  SaunaPutResult,
  SaunaSnapshot,
  SaunaVersion,
} from "../types";

/**
 * Headers can be a static object or a (sync/async) provider — useful
 * for injecting an auth token that may need to refresh.
 */
export type HttpProviderHeaders =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

/**
 * Options Next.js consumers can attach to every fetch call this
 * provider issues. Mirrors the shape of `RequestInit['next']` — kept
 * narrow so the package doesn't depend on Next.js types.
 *
 * - `tags`: cache tags for `revalidateTag()` invalidation.
 * - `revalidate`: TTL in seconds, or `false` to opt out of the cache.
 */
export type HttpProviderNextOptions = {
  tags?: string[];
  revalidate?: number | false;
};

/**
 * Adapts an arbitrary server response shape into the
 * `SaunaSnapshot` contract. Use it when the upstream API wraps the
 * schema in a metadata envelope (e.g. sauna-service `Page` returns
 * `{ id, body, version, ... }` with the schema at `body` and the
 * version as a plain integer).
 *
 * The default behaviour — when `mapResponse` is not provided — is:
 *   - response body is parsed as JSON and treated as the schema
 *     directly
 *   - the ETag header carries the version
 *
 * Implementations must always return both a validated schema and a
 * non-empty version. Throw `SaunaNotFoundError` if the response
 * indicates absence, even if HTTP status is 200.
 */
export type MapResponseFn = (
  rawJson: unknown,
  response: Response,
  id: SaunaId
) => SaunaSnapshot | Promise<SaunaSnapshot>;

/**
 * Inverse of `mapResponse`: builds the PUT body when the upstream
 * expects an envelope rather than a bare schema. Default: schema is
 * serialised verbatim.
 */
export type SerializeBodyFn = (schema: SaunaSchema, id: SaunaId) => unknown;

export type HttpProviderOptions = {
  /**
   * Base URL the schema id is appended to (URL-encoded). Examples:
   *   - "/api/sauna"           → PUT /api/sauna/dashboard
   *   - "https://x.com/v1/s"   → PUT https://x.com/v1/s/dashboard
   */
  baseUrl: string;
  /** Override `globalThis.fetch` (for tests, instrumentation, polyfills). */
  fetch?: typeof globalThis.fetch;
  /** Extra request headers (e.g. `Authorization`). */
  headers?: HttpProviderHeaders;
  /**
   * Adapter for non-default response shapes. See `MapResponseFn`.
   * When omitted, the response JSON is treated as the schema and
   * `ETag` is used as the version.
   */
  mapResponse?: MapResponseFn;
  /** Adapter for non-default PUT body shapes. See `SerializeBodyFn`. */
  serializeBody?: SerializeBodyFn;
  /**
   * Next.js fetch options applied to every request. Forwarded as
   * `init.next`. Ignored in non-Next environments — the property is
   * just silently dropped by the standard fetch implementation.
   */
  nextFetchOptions?: HttpProviderNextOptions;
  /**
   * Cache hint for runtimes that honour it (Next.js, browsers).
   * Defaults to `no-store` to avoid surprise stale reads at the
   * authoring layer. Set to `force-cache` or pair with
   * `nextFetchOptions.revalidate` for production read paths.
   */
  cache?: RequestCache;
  /**
   * Optional URL builder for non-default upstream URL shapes. See
   * `BuildUrlFn`.
   */
  buildUrl?: BuildUrlFn;
};

/**
 * URL builder for non-default upstream URL shapes. When the upstream
 * does not follow `<baseUrl>/<id>` (e.g. it expects `<baseUrl>?slug=<id>`
 * or routes reads and writes through different endpoints), use this to
 * construct the URL per request. The `method` argument lets a single
 * provider handle asymmetric read/write paths — for instance, a CMS
 * that exposes "get by slug" at `/pages/by-path?path=<slug>` but
 * "update" only at `/pages/<uuid>`. In that case `buildUrl` looks up
 * the canonical UUID from a context closure for PUTs while keeping
 * the slug-based query for GETs.
 *
 * Defaults to `<baseUrl>/<encodeURIComponent(id)>` for both methods —
 * matches the contract the engine route-handlers (src/engine/next) produce,
 * so most consumers never need to override this.
 */
export type BuildUrlFn = (args: {
  baseUrl: string;
  id: SaunaId;
  method: "GET" | "PUT";
}) => string;

function readEtag(res: Response): SaunaVersion {
  // RFC 7232 §2.3: ETag is case-insensitive on the wire; Headers normalises.
  return res.headers.get("etag") ?? "";
}

async function resolveHeaders(h: HttpProviderHeaders | undefined): Promise<Record<string, string>> {
  if (!h) return {};
  if (typeof h === "function") return await h();
  return h;
}

function defaultUrlFor(baseUrl: string, id: SaunaId): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}/${encodeURIComponent(id)}`;
}

function urlFor(
  opts: HttpProviderOptions,
  id: SaunaId,
  method: "GET" | "PUT"
): string {
  if (opts.buildUrl) {
    return opts.buildUrl({ baseUrl: opts.baseUrl, id, method });
  }
  return defaultUrlFor(opts.baseUrl, id);
}

function defaultMapResponse(
  rawJson: unknown,
  response: Response,
  id: SaunaId
): SaunaSnapshot {
  const validated = validateSaunaSchema(rawJson);
  if (!validated.ok) {
    throw new Error(
      `HTTP provider: server returned invalid schema for "${id}": ${validated.error.message}`
    );
  }
  const schema = migrateSaunaSchema(validated.value as SaunaAnySchema);
  const version = readEtag(response);
  return { schema, version };
}

function defaultSerializeBody(schema: SaunaSchema): unknown {
  return schema;
}

// `init.next` is a Next.js-specific extension — strip it when running
// against a Node fetch that does not understand the property. Most
// runtimes already silently ignore unknown init keys, but the type
// here is intentionally narrow.
function attachNextOptions(
  init: RequestInit,
  next: HttpProviderNextOptions | undefined
): RequestInit & { next?: HttpProviderNextOptions } {
  if (!next) return init;
  return { ...init, next };
}

export function createHttpProvider(opts: HttpProviderOptions): SaunaProvider {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "createHttpProvider: no `fetch` available. Pass `opts.fetch` or run on a fetch-capable runtime."
    );
  }

  const mapResponse = opts.mapResponse ?? defaultMapResponse;
  const serializeBody = opts.serializeBody ?? defaultSerializeBody;
  const cache = opts.cache ?? "no-store";

  return {
    async get(id: SaunaId): Promise<SaunaSnapshot> {
      const headers = await resolveHeaders(opts.headers);
      const init = attachNextOptions(
        {
          method: "GET",
          headers,
          cache,
        },
        opts.nextFetchOptions
      );

      const res = await fetchImpl(urlFor(opts, id, "GET"), init);

      if (res.status === 404) {
        throw new SaunaNotFoundError(`Schema not found: ${id}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `GET ${id} failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`
        );
      }

      const rawJson = (await res.json()) as unknown;
      return await mapResponse(rawJson, res, id);
    },

    async put(
      id: SaunaId,
      schema: SaunaSchema,
      options?: SaunaPutOptions
    ): Promise<SaunaPutResult> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(await resolveHeaders(opts.headers)),
      };
      if (options?.ifMatch !== undefined) {
        headers["If-Match"] = options.ifMatch;
      }

      const body = JSON.stringify(serializeBody(schema, id));
      const init = attachNextOptions(
        {
          method: "PUT",
          headers,
          body,
          // PUT is never served from the cache; explicit so consumers
          // know.
          cache: "no-store",
        },
        opts.nextFetchOptions
      );

      const res = await fetchImpl(urlFor(opts, id, "PUT"), init);

      if (res.status === 412) {
        const latest = readEtag(res) || undefined;
        throw new SaunaConflictError(id, latest);
      }
      if (res.status === 404) {
        throw new SaunaNotFoundError(`Schema not found: ${id}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `PUT ${id} failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`
        );
      }

      const version = readEtag(res);
      return { version };
    },
  };
}
