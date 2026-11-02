import { createHash } from "node:crypto";

import document from "@/widgets/pages/element-catalog-api.json";

// GET /api/element-catalog (SDL-696, EP-20): every pages Element with the JSON
// Schema (draft 2020-12) of its props, for the markerloop MCP. Public — it is
// the same for every visitor and carries no user data — and outside /api/v1 on
// purpose: that prefix belongs to the gateway. `catalogVersion` is the one
// /api/health serves as `pagesCatalogVersion`.
//
// The document is generated from PAGES_BLOCKS + PAGES_PROPS_MANIFEST and
// committed (`pnpm --filter admin catalog:api`; `smoke:pages` fails on a stale
// file or an Element without a props schema) — the catalog is a "use client"
// module and cannot be read from a route handler. Shape and rules:
// src/widgets/pages/element-catalog-api.ts.
//
// It depends only on the image, so the bytes and their ETag (sha256 of the
// bytes) are computed once per process; a matching If-None-Match gets a 304.
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, max-age=0, must-revalidate";

const BODY = JSON.stringify(document);
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
