// Test of GET /api/site-theme-presets (SDL-778). node:test under tsx (the
// admin has no unit runner), run by `smoke:pages`:
//
//   pnpm --filter admin site-theme-presets:test
//
// What it pins: the route serves `SITE_THEME_PRESETS` of @markerloop/studio
// byte for byte (one source of truth, nothing re-typed), all 7 presets, each
// with `theme.preset` = its id and an id pages-service accepts; 200 with a
// strong sha256 ETag and `Cache-Control: public`, 304 on a matching
// If-None-Match.

import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

import { SITE_THEME_PRESETS, type SiteThemePreset } from "@markerloop/studio";
import { GET } from "@/app/api/site-theme-presets/route";

const ROUTE = "http://localhost/api/site-theme-presets";
/** pages-service `SiteTheme.Validate` on `preset` (internal/models/theme.go). */
const PRESET_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type Body = { presets: SiteThemePreset[] };

test("body: { presets } = SITE_THEME_PRESETS, 7 of them, theme.preset = id", async () => {
  const res = GET(new Request(ROUTE));
  const text = await res.text();
  assert.equal(text, JSON.stringify({ presets: SITE_THEME_PRESETS }), "the package's presets, byte for byte");
  const body = JSON.parse(text) as Body;
  assert.deepEqual(Object.keys(body), ["presets"]);
  assert.equal(body.presets.length, 7);
  const ids = body.presets.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  for (const p of body.presets) {
    assert.match(p.id, PRESET_ID, `${p.id}: an id pages-service accepts`);
    assert.equal(p.theme.preset, p.id, `${p.id}: theme.preset`);
    assert.ok(p.name && p.note, `${p.id}: name and note`);
    assert.equal(Object.keys(p.theme.colors).length, 8, `${p.id}: 8 colour roles`);
    assert.ok(p.theme.fonts.heading && p.theme.fonts.body, `${p.id}: fonts`);
  }
});

test("route: 200 with an ETag of the bytes; 304 on If-None-Match", async () => {
  const first = GET(new Request(ROUTE));
  assert.equal(first.status, 200);
  assert.match(first.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(first.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const etag = first.headers.get("etag");
  assert.ok(etag && /^"[0-9a-f]{64}"$/.test(etag), `strong sha256 ETag, got ${etag}`);
  const text = await first.text();
  assert.equal(etag, `"${createHash("sha256").update(text, "utf8").digest("hex")}"`, "ETag = sha256 of the body");

  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
    const again = GET(new Request(ROUTE, { headers: { "If-None-Match": header } }));
    assert.equal(again.status, 304, `If-None-Match: ${header}`);
    assert.equal(again.headers.get("etag"), etag);
    assert.equal(await again.text(), "");
  }
  const miss = GET(new Request(ROUTE, { headers: { "If-None-Match": '"0000"' } }));
  assert.equal(miss.status, 200);
});
