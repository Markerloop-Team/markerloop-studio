import { createHash } from "node:crypto";

import { SITE_THEME_PRESETS } from "@markerloop/studio";

// GET /api/site-theme-presets (SDL-778, EP-160): the site theme presets of
// SDL-777 for the markerloop MCP (`theme_presets`, `theme_apply_preset`) —
// mcp-service is Go and cannot import the TS module, so the admin serves it.
// Public — the same for every visitor, no user data — and outside /api/v1 on
// purpose: that prefix belongs to the gateway. Same recipe as
// /api/element-catalog (SDL-696).
//
// One source of truth: the body is `SITE_THEME_PRESETS` as the package holds
// it (`{ id, name, note, theme }`, theme in pages-service's shape with
// `preset` = id), nothing re-typed here. The presets module is plain data with
// no "use client", so unlike the element catalog it is read directly — no
// generated file. No version field: the ETag already is the content version.
//
// It depends only on the image, so the bytes and their ETag (sha256 of the
// bytes) are computed once per process; a matching If-None-Match gets a 304.
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, max-age=0, must-revalidate";

const BODY = JSON.stringify({ presets: SITE_THEME_PRESETS });
const ETAG = `"${createHash("sha256").update(BODY, "utf8").digest("hex")}"`;

/** RFC 9110 §13.1.2 for a GET: weak comparison; `*` matches. */
function ifNoneMatchHits(header: string | null): boolean {
  if (!header) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => {
    const t = tag.trim();
    return t === "*" || opaque(t) === ETAG;
  });
}

export function GET(request: Request) {
  const headers = { ETag: ETAG, "Cache-Control": CACHE_CONTROL };
  if (ifNoneMatchHits(request.headers.get("if-none-match"))) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(BODY, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
