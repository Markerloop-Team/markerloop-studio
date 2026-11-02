// SSR contract of the workspace site (SDL-685), against the BUILT app
// (`pnpm --filter site build` first): a fake pages-service, a fake Sentry
// ingest, `next start`. Run: `pnpm --filter site test:ssr`.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { BLOCK_GONE, BROKEN_HOST, COMPONENTS_PATH, FONTS_PAGES_DEFAULT_PATH, FONTS_PATH, HANGING_HOST, PROTO_KEYS, PROTO_KEYS_PATHS, SITE_HOST, THEME_PATHS, UNPUBLISHED_HOST, get, startStand, type Stand } from "./stand";

let stand: Stand;
before(async () => {
  stand = await startStand();
});
after(async () => {
  await stand?.stop();
});

const NONCE = /'nonce-([^']+)'/;

test("a published page: 200, rendered body, <title> from the snapshot, no Set-Cookie, CSP + X-Frame-Options", async () => {
  const res = await get(stand.siteUrl, "/", SITE_HOST, { cookie: "__Host-access_token=secret; NEXT_LOCALE=ru" });
  assert.equal(res.status, 200, res.body.slice(0, 400));
  assert.match(res.body, /Hello from Acme/);
  assert.match(res.body, /<title>Acme v\d+<\/title>/);
  assert.equal(res.headers["set-cookie"], undefined, "the site never sets a cookie");
  assert.equal(res.headers["x-frame-options"], "DENY");
  const csp = String(res.headers["content-security-policy"] ?? "");
  for (const directive of [
    "default-src 'none'",
    "img-src https: data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self' https://api.sites.test",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]) {
    assert.ok(csp.includes(directive), `CSP lacks "${directive}": ${csp}`);
  }
  assert.match(csp, /script-src 'self' 'nonce-[^']+'(;|$)/, csp);
  // Every inline script Next wrote carries this response's nonce — otherwise
  // the browser blocks hydration under `script-src 'self'`.
  const nonce = NONCE.exec(csp)![1];
  const inline = [...res.body.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[1]);
  assert.ok(inline.length > 0, "expected Next's inline hydration scripts");
  for (const attrs of inline) assert.ok(attrs.includes(`nonce="${nonce}"`), `inline script without the nonce: <script${attrs}>`);
  assert.equal((res.body.match(/<form\b/g) ?? []).length, 0, "the site renders no forms");
});

test("a page with Components (SDL-722): each Ref draws its Component with the page's params, a nested Ref too, a missing one the placeholder", async () => {
  const res = await get(stand.siteUrl, COMPONENTS_PATH, SITE_HOST);
  assert.equal(res.status, 200, res.body.slice(0, 400));
  // The drawn markup only: the RSC payload in <script> carries the schemas
  // themselves, defaults included, as data for hydration.
  const html = res.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  assert.match(html, /Card title from the page/, "the page's value reached the Component");
  assert.doesNotMatch(html, /Card default/, "the Component's default was overridden");
  assert.match(html, /Badge from the card/, "the nested Component drew with the card's value");
  assert.doesNotMatch(html, /Badge default/);
  assert.match(html, new RegExp(`data-sauna-ref-placeholder="missing"[^>]*data-sauna-ref-block="${BLOCK_GONE}"|data-sauna-ref-block="${BLOCK_GONE}"[^>]*data-sauna-ref-placeholder="missing"`), "a Ref to a Component the answer lacks is the placeholder");
  assert.equal((html.match(/data-sauna-ref-placeholder=/g) ?? []).length, 1, "only that one Ref is a placeholder");
});

test("SDL-722 review: a Ref whose blockId names an Object.prototype member is the placeholder, the page answers 200 — blocks absent, empty or not", async () => {
  for (const [variant, p] of Object.entries(PROTO_KEYS_PATHS)) {
    const res = await get(stand.siteUrl, p, SITE_HOST);
    assert.equal(res.status, 200, `${variant}: ${res.body.slice(0, 400)}`);
    const html = res.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    const placeholders = [...html.matchAll(/<[^>]*data-sauna-ref-placeholder="missing"[^>]*>/g)].map((m) => m[0]);
    for (const key of PROTO_KEYS) {
      assert.ok(placeholders.some((tag) => tag.includes(`data-sauna-ref-block="${key}"`)), `${variant}: Ref "${key}" is the missing placeholder`);
    }
    assert.match(html, /After the refs/, `${variant}: the page around the Refs renders`);
    assert.equal(/Card title from the page/.test(html), variant === "full", `${variant}: the real Component draws only when the answer carries it`);
  }
});

test("SDL-773: the published theme is one <style> at the top of the page; none published → no <style>; a dark Section carries the kit's .dark scope", async () => {
  const strip = (body: string) => body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const none = await get(stand.siteUrl, THEME_PATHS.none, SITE_HOST);
  assert.equal(none.status, 200, none.body.slice(0, 400));
  assert.doesNotMatch(strip(none.body), /data-pages-theme/, "no theme in the answer → no theme sheet");
  const custom = await get(stand.siteUrl, THEME_PATHS.custom, SITE_HOST);
  assert.equal(custom.status, 200, custom.body.slice(0, 400));
  const html = strip(custom.body);
  const sheets = [...html.matchAll(/<style data-pages-theme="">([^<]*)<\/style>/g)];
  assert.equal(sheets.length, 1, "exactly one theme sheet");
  const css = sheets[0][1];
  assert.match(css, /^:root\{--background:#faf7f2;/);
  assert.match(css, /--pages-density:1\.5/);
  assert.match(css, /--radius:1rem/);
  assert.match(css, /--pages-text-h1:2\.75rem/);
  assert.match(css, /:root \.dark, :root \[data-background="dark"\]\{--background:#0b1020;/);
  // The sheet is the first thing of the page body's markup, ahead of the Page root.
  assert.ok(html.indexOf("<style data-pages-theme") < html.indexOf('data-pages-primitive="page"'), "the sheet precedes the page root");
  assert.match(html, /<section[^>]*data-background="dark"[^>]*class="dark"|<section[^>]*class="dark"[^>]*data-background="dark"/);
});

test("SDL-774: a theme with fonts — two preloads (heading 700, body 400) from /fonts, @font-face with swap in the sheet, the files served by the site itself as font/woff2", async () => {
  const res = await get(stand.siteUrl, FONTS_PATH, SITE_HOST);
  assert.equal(res.status, 200, res.body.slice(0, 400));
  assert.match(String(res.headers["content-security-policy"] ?? ""), /(^|; )font-src 'self'(;|$)/);
  const head = res.body.slice(0, res.body.indexOf("</head>"));
  const preloads = [...head.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g)].map((m) => m[0]);
  assert.equal(preloads.length, 2, preloads.join("\n"));
  assert.ok(preloads[0].includes('href="/fonts/playfair-display/latin-700.woff2"'), preloads[0]);
  assert.ok(preloads[1].includes('href="/fonts/inter/latin-400.woff2"'), preloads[1]);
  for (const l of preloads) assert.match(l, /crossorigin=""/i);
  const sheet = /<style data-pages-theme="">([^<]*)<\/style>/.exec(res.body)?.[1] ?? "";
  assert.equal((sheet.match(/@font-face/g) ?? []).length, 10, "Playfair latin+cyrillic, Inter latin+cyrillic+cyrillic-ext, × 400/700");
  assert.equal((sheet.match(/font-display:swap/g) ?? []).length, 10);
  assert.doesNotMatch(res.body, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  for (const href of ["/fonts/playfair-display/latin-700.woff2", "/fonts/inter/cyrillic-400.woff2", "/fonts/inter/cyrillic-ext-400.woff2"]) {
    const file = await get(stand.siteUrl, href, SITE_HOST);
    assert.equal(file.status, 200, href);
    assert.equal(file.headers["content-type"], "font/woff2", href);
    // A week's cache (not immutable: unversioned names) — next.config, not overwritten by the proxy.
    assert.equal(file.headers["cache-control"], "public, max-age=604800, stale-while-revalidate=86400", href);
  }
  // A face that is not shipped (Unbounded's cyrillic-ext has no Kazakh letter) is a 404.
  assert.equal((await get(stand.siteUrl, "/fonts/unbounded/cyrillic-ext-400.woff2", SITE_HOST)).status, 404);
  // pages-service's real default (fonts required, Geist/Geist): the site switches to Geist.
  const geist = await get(stand.siteUrl, FONTS_PAGES_DEFAULT_PATH, SITE_HOST);
  assert.equal(geist.status, 200);
  const geistHead = geist.body.slice(0, geist.body.indexOf("</head>"));
  assert.deepEqual([...geistHead.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*href="([^"]+)"|<link[^>]*rel="preload"[^>]*href="([^"]+)"[^>]*as="font"/g)].map((m) => m[1] ?? m[2]), ["/fonts/geist/latin-700.woff2", "/fonts/geist/latin-400.woff2"]);
  const geistSheet = /<style data-pages-theme="">([^<]*)<\/style>/.exec(geist.body)?.[1] ?? "";
  assert.equal((geistSheet.match(/@font-face\{font-family:"Geist"/g) ?? []).length, 6, "Geist: cyrillic-ext, cyrillic, latin × 400/700");
  assert.match(geistSheet, /--pages-font-body:"Geist", ui-sans-serif/);
  // A hand-made theme without fonts: no preload, no face.
  const old = await get(stand.siteUrl, THEME_PATHS.custom, SITE_HOST);
  assert.doesNotMatch(old.body, /rel="preload"[^>]*as="font"|@font-face/);
});

test("upstream sees the Host, the route path and X-Element-Catalog — and never the visitor's Cookie", async () => {
  stand.apiCalls.length = 0;
  await get(stand.siteUrl, "/", SITE_HOST, { cookie: "__Host-access_token=secret" });
  const call = stand.apiCalls.find((c) => c.host === SITE_HOST);
  assert.ok(call, "pages-service was not called");
  assert.equal(call.path, "/");
  assert.match(String(call.headers["x-element-catalog"] ?? ""), /^[0-9a-f]{64}$/, "catalog version header");
  assert.equal(call.headers.cookie, undefined, "a visitor cookie reached pages-service");
});

test("unknown host and an unpublished route answer the same 404", async () => {
  const unknown = await get(stand.siteUrl, "/", "nobody.sites.test");
  const draft = await get(stand.siteUrl, "/", UNPUBLISHED_HOST);
  const deep = await get(stand.siteUrl, "/no/such/page", SITE_HOST);
  for (const r of [unknown, draft, deep]) {
    assert.equal(r.status, 404);
    assert.equal(r.headers["set-cookie"], undefined);
    assert.ok(String(r.headers["content-security-policy"] ?? "").includes("default-src 'none'"));
  }
  // Per-request noise only: the CSP nonce (in attributes and in the RSC
  // payload) and the trace ids Sentry's server SDK writes into <meta>.
  const strip = (r: { body: string; headers: Record<string, unknown> }) => {
    const nonce = NONCE.exec(String(r.headers["content-security-policy"] ?? ""))?.[1] ?? "\u0000";
    return r.body
      .split(nonce)
      .join("")
      .replace(/<meta name="(sentry-trace|baggage)" content="[^"]*"\/>/g, "")
      .replace(/[0-9a-f]{32}/g, "");
  };
  assert.equal(strip(unknown), strip(draft), "unknown host and unpublished page must be indistinguishable");
  assert.match(unknown.body, /Page not found/);
});

test("a new snapshot is served on the very next request (no caching between them)", async () => {
  const first = await get(stand.siteUrl, "/", SITE_HOST);
  assert.match(first.body, /Hello from Acme|Snapshot/);
  stand.publish("Snapshot after update");
  const second = await get(stand.siteUrl, "/", SITE_HOST);
  assert.equal(second.status, 200);
  assert.match(second.body, /Snapshot after update/, "the second request still served the old snapshot");
  assert.doesNotMatch(second.body, /Hello from Acme/);
});

test("a broken page body: 500 page, and the error reaches Sentry (local fake ingest)", async () => {
  stand.sentryEnvelopes.length = 0;
  // The visitor's cookie must not reach the event either: the proxy cuts it
  // before any page code, so the SDK never sees it on the request.
  const res = await get(stand.siteUrl, "/", BROKEN_HOST, { cookie: "__Host-access_token=VISITOR-SECRET-COOKIE" });
  assert.equal(res.status, 500);
  // Next draws error.tsx in the browser (the server sends the error shell, the
  // e2e project checks the text); the cause must not leak into the HTML.
  assert.match(res.body, /__next_error__/);
  assert.doesNotMatch(res.body, /not a valid schema/, "the render error leaked into the page");
  const deadline = Date.now() + 10_000;
  while (!stand.sentryEnvelopes.some((e) => e.includes("not a valid schema")) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const event = stand.sentryEnvelopes.find((e) => e.includes("not a valid schema"));
  assert.ok(event, `no Sentry event with the render error; got ${stand.sentryEnvelopes.length} envelopes`);
  assert.match(event, /"environment":"local-stand"/);
  assert.match(event, /"app":"site"/);
  assert.doesNotMatch(event, /VISITOR-SECRET-COOKIE/, "the visitor's Cookie reached the Sentry event");
});

test("pages-service that does not answer: the 500 page after the timeout, not a hanging request", async () => {
  const started = Date.now();
  const res = await get(stand.siteUrl, "/", HANGING_HOST);
  assert.equal(res.status, 500);
  // Measured: ~10 s — the metadata pass and the page each wait out one 5 s
  // timeout (a rejected read is not reused between them). Bounded, not hung:
  // the fake would answer only after 30 s.
  assert.ok(Date.now() - started < 15_000, `took ${Date.now() - started} ms`);
});

// --- source guards: what must never appear in the site --------------------

const APP_SRC = path.resolve(__dirname, "../src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test("source guards: no cookie writes, no /api routes, no route handlers, no forms; no-store + force-dynamic stay", () => {
  const all = files(APP_SRC);
  assert.deepEqual(all.filter((f) => /[\\/]app[\\/]api[\\/]/.test(f) || /[\\/]route\.(t|j)sx?$/.test(f)), [], "the site has no route handlers");
  for (const f of all) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /cookies\(\)/, `${f} reads or writes cookies`);
    assert.doesNotMatch(src, /\.set\(\s*["'`]set-cookie|Set-Cookie/i, `${f} writes Set-Cookie`);
    assert.doesNotMatch(src, /<form\b|"use server"/, `${f} renders a form or a server action`);
  }
  const api = readFileSync(path.join(APP_SRC, "lib/site-api.ts"), "utf8");
  assert.match(api, /cache:\s*"no-store"/, "the snapshot fetch must be no-store");
  const page = readFileSync(path.join(APP_SRC, "app/[[...path]]/page.tsx"), "utf8");
  assert.match(page, /export const dynamic = "force-dynamic"/);
});
