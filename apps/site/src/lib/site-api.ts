// The one read of the workspace site (SDL-685): the published snapshot of the
// route at `path` of the site that answers to `host`, from pages-service's
// anonymous public plane `GET /pages/public/site` (SDL-684).
//
// Server-only. `cache: "no-store"` is load-bearing: a cached answer would keep
// serving the previous snapshot after the owner presses "Update publication".
// `test/ssr.test.ts` changes the snapshot between two requests and fails when
// the second one still shows the first body.

import { cache } from "react";
import { PAGES_CATALOG_VERSION } from "./catalog-version";

export type SitePageFile = { url?: string };

/**
 * One Component the page references through a `Ref` node (SDL-722): the
 * block's version frozen by the publication and its schema after the public
 * cut. `schema` stays opaque here — `renderPublishedPage` validates it.
 */
export type SitePageBlock = { version: number; schema: unknown };

export type SitePage = {
  path: string;
  title: string;
  body: unknown;
  files: Record<string, string>;
  /**
   * The answer's `blocks` (SDL-722): block id (= the Ref's `props.blockId`) →
   * the Component. Flat — nested Refs' Components are on the top level too.
   * Empty when the page has no Refs or the snapshot predates SDL-722.
   */
  blocks: Record<string, SitePageBlock>;
  /**
   * The answer's `theme` (SDL-773): the workspace's PUBLISHED site theme, as
   * pages-service sent it (opaque here — `renderPublishedPage` checks every
   * field). `undefined` until a theme is published: the page then renders
   * without a theme stylesheet, exactly as before.
   */
  theme: unknown;
  /** The snapshot's validator as pages-service sent it (`ETag`), or "" without one. */
  etag: string;
};

export type SitePageResult = { kind: "page"; page: SitePage } | { kind: "not-found" };

/**
 * Connection-reset causes of undici's `TypeError: fetch failed` (SDL-732):
 * the peer closed a kept-alive socket the pool handed out again — the gateway
 * draining its idle connections after preStop during a rollout. Matched by
 * `cause.code` / `cause.name`, never by message text.
 */
const RESET_CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE"]);
const IDEMPOTENT = new Set(["GET", "HEAD"]);
const RETRY_PAUSE_MS = 20;

/** The reset's code when `err` is fetch's network failure on a dropped socket, else null. */
export function connectionResetCode(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== "TypeError") return null;
  const cause: unknown = (err as { cause?: unknown }).cause;
  if (cause === null || typeof cause !== "object") return null;
  const { code, name } = cause as { code?: unknown; name?: unknown };
  if (typeof code === "string" && RESET_CODES.has(code)) return code;
  if (name === "SocketError") return name;
  return null;
}

/**
 * `fetch` to the in-cluster gateway with ONE retry of an idempotent request
 * (GET/HEAD) that died on a reset connection (SDL-732). Any HTTP answer, 5xx
 * included, goes back as is; a timeout/abort and any other error are thrown
 * as is; other methods are never retried. The retry shares the caller's
 * `signal`, so it cannot outlive the original timeout. Same signature as
 * `fetch`, so it is also handed to `loadPublishedPageData` (DataView reads).
 */
export const fetchGateway: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (err) {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const code = connectionResetCode(err);
    if (code === null || !IDEMPOTENT.has(method)) throw err;
    // One line, no host/query: the query carries the visitor's host and path.
    console.warn(`[site-api] ${method} ${pathOf(input)}: connection reset (${code}), retrying once`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
    return fetch(input, init);
  }
};

function pathOf(input: RequestInfo | URL): string {
  try {
    return new URL(input instanceof Request ? input.url : String(input)).pathname;
  } catch {
    return "?";
  }
}

/** The in-cluster gateway base with its version prefix (`http://gateway-service/api/v1`). Server-only. */
export function apiBase(): string {
  const base = (process.env.PAGES_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  if (base === "") throw new Error("PAGES_PUBLIC_API_URL is not set");
  return base;
}

function fileUrls(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === null || typeof raw !== "object") return out;
  for (const [id, file] of Object.entries(raw as Record<string, SitePageFile>)) {
    if (file && typeof file.url === "string" && file.url !== "") out[id] = file.url;
  }
  return out;
}

function blockEntries(raw: unknown): Record<string, SitePageBlock> {
  // Null prototype: an id "__proto__" is an own key, not the map's prototype,
  // and "constructor" finds nothing. The map stays on the server
  // (`renderPublishedPage` re-keys it), so the serializer never sees it.
  const out: Record<string, SitePageBlock> = Object.create(null);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, block] of Object.entries(raw as Record<string, unknown>)) {
    if (block === null || typeof block !== "object") continue;
    const { version, schema } = block as { version?: unknown; schema?: unknown };
    if (schema === null || typeof schema !== "object") continue;
    out[id] = { version: typeof version === "number" ? version : 0, schema };
  }
  return out;
}

/**
 * Unknown host, a workspace without an address, an unpublished route and an
 * invalid path all answer the same 404 upstream (and a 400 for a malformed
 * path) — the site answers them with one and the same not-found page, so a
 * visitor cannot tell "no such site" from "not published".
 */
export const loadSitePage = cache(async (host: string, path: string): Promise<SitePageResult> => {
  const url = new URL(`${apiBase()}/pages/public/site`);
  url.searchParams.set("host", host);
  url.searchParams.set("path", path);
  const res = await fetchGateway(url, {
    cache: "no-store",
    // A pages-service that does not answer must end in the 500 page, not in a
    // request that hangs until the ingress gives up.
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: "application/json", "X-Element-Catalog": PAGES_CATALOG_VERSION },
  });
  if (res.status === 404 || res.status === 400) return { kind: "not-found" };
  if (!res.ok) throw new Error(`pages-service answered ${res.status} for the site page`);
  const json = (await res.json()) as { data?: { path?: string; title?: string; body?: unknown; files?: unknown; blocks?: unknown; theme?: unknown } };
  const data = json.data;
  if (!data || data.body === undefined) throw new Error("pages-service answered 200 without a page body");
  return {
    kind: "page",
    page: {
      path: typeof data.path === "string" ? data.path : path,
      title: typeof data.title === "string" ? data.title : "",
      body: data.body,
      files: fileUrls(data.files),
      blocks: blockEntries(data.blocks),
      theme: data.theme,
      etag: res.headers.get("etag") ?? "",
    },
  };
});

/** `[[...path]]` segments → the route path pages-service expects ("/" for the root). */
export function routePath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) return "/";
  return "/" + segments.map(safeDecode).join("/");
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
