// `@markerloop/engine/providers/data` — the PUBLIC data provider of the
// DataView Element (SDL-679): how a published page reads a collection
// without anyone signed in.
//
// It reads the gateway's anonymous plane `/api/v1/data/<workspace>/<key>`
// (gw-service `routes.go`, the one group without jwt). `apiBase` carries the
// version prefix: in-cluster `http://gateway-service/api/v1` for the site's
// server, `https://api.<base>/v1` for the browser. collections-service
// derives the reader ONLY from `Authorization`: without it the reader is the
// workspace's built-in `public` role, so what comes back is exactly what the
// owner made public — published records, fields of the read grant. That is
// why this provider never sends `Authorization` and never sends a cookie
// (`credentials: "omit"`): a token would turn "what any visitor sees" into
// "what this one person may see", and the server-rendered HTML would then be
// served to everyone. The package tests plant a token and expect red.
//
// Every failure — no grant (the plane answers 404, the same as "no such
// collection"), 401, 429, 5xx, a network error, a body of the wrong shape —
// is ONE answer: `unavailable`. Nothing of the upstream error (status text,
// message, request id) travels into the page.
//
// Server-safe: plain `fetch`, no React. The site's server calls
// `loadPublicDataViewPage` for the first page (SSR); the component calls it
// again in the browser on a tab switch, against `https://api.<base>/v1` — the
// one origin the site's CSP `connect-src` lists.

import { publicDataViewRequest, type DataViewProps, type PublicDataViewRequest } from "../../core/data-view";

/** One record as the public projection gives it: only the read grant's fields are in `data`. */
export type PublicDataViewRecord = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PublicDataViewPage =
  | { status: "list"; records: PublicDataViewRecord[]; total: number }
  | { status: "unavailable" };

export const PUBLIC_DATA_VIEW_UNAVAILABLE: PublicDataViewPage = Object.freeze({ status: "unavailable" }) as PublicDataViewPage;

export type PublicDataViewLoadOptions = {
  /** The API base WITH the version prefix: `http://gateway-service/api/v1`, `https://api.markerloop.com/v1`. */
  apiBase: string;
  presetId?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The full URL of one public list. */
export function publicDataViewUrl(apiBase: string, request: PublicDataViewRequest): string {
  const url = new URL(`${apiBase.replace(/\/+$/, "")}${request.path}`);
  for (const [k, v] of Object.entries(request.query)) url.searchParams.set(k, v);
  return url.toString();
}

/** Keeps the four fields a record shows with; anything else the upstream adds stays out of the page. */
function readRecords(json: unknown): { records: PublicDataViewRecord[]; total: number } | null {
  if (!isRecord(json) || !Array.isArray(json.data)) return null;
  const records: PublicDataViewRecord[] = [];
  for (const raw of json.data) {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    records.push({
      id: raw.id,
      data: isRecord(raw.data) ? raw.data : {},
      created_at: typeof raw.created_at === "string" ? raw.created_at : "",
      updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    });
  }
  const meta = isRecord(json.meta) ? json.meta : {};
  const total = typeof meta.total === "number" ? meta.total : records.length;
  return { records, total };
}

/**
 * One page of records of a DataView, as an anonymous visitor may see it.
 * Never throws: every failure is `{ status: "unavailable" }`.
 */
export async function loadPublicDataViewPage(props: DataViewProps, options: PublicDataViewLoadOptions): Promise<PublicDataViewPage> {
  let request: PublicDataViewRequest | null;
  try {
    request = publicDataViewRequest(props, options.presetId);
  } catch {
    return PUBLIC_DATA_VIEW_UNAVAILABLE;
  }
  if (request === null || options.apiBase.trim() === "") return PUBLIC_DATA_VIEW_UNAVAILABLE;
  const doFetch = options.fetch ?? fetch;
  try {
    const res = await doFetch(publicDataViewUrl(options.apiBase, request), {
      method: "GET",
      // Accept only: no Authorization, no Cookie — see the header comment.
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: options.signal,
    });
    if (!res.ok) return PUBLIC_DATA_VIEW_UNAVAILABLE;
    const page = readRecords(await res.json());
    return page ? { status: "list", ...page } : PUBLIC_DATA_VIEW_UNAVAILABLE;
  } catch {
    return PUBLIC_DATA_VIEW_UNAVAILABLE;
  }
}
