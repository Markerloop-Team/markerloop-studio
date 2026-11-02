// One retry of an idempotent gateway read on a reset connection (SDL-732).
// Unit level, no build and no network: `fetch` is a mock. A gateway rollout
// closes kept-alive sockets after preStop; the next request on such a socket
// fails with `TypeError: fetch failed` (cause: undici SocketError
// UND_ERR_SOCKET "other side closed") and the site answered 500.
// Run: `pnpm --filter site test:unit`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import { connectionResetCode, fetchGateway, loadSitePage } from "../src/lib/site-api";
import { buildSiteCsp } from "../src/lib/csp";

const URL_ = new URL("http://gateway-service/api/v1/pages/public/site?host=acme.sites.test&path=%2F");

/** undici's own reset: `cause` is a SocketError with code UND_ERR_SOCKET. */
function socketReset(): TypeError {
  const cause = Object.assign(new Error("other side closed"), { name: "SocketError", code: "UND_ERR_SOCKET" });
  return new TypeError("fetch failed", { cause });
}

/** A reset from Node's net layer: a plain `Error` (name "Error") with an errno code — no SocketError name to lean on. */
function errnoReset(code: string): TypeError {
  const cause = Object.assign(new Error(`read ${code}`), { code });
  assert.equal(cause.name, "Error");
  return new TypeError("fetch failed", { cause });
}

/** A SocketError without a code: matched by `cause.name` alone. */
function namedOnlyReset(): TypeError {
  const cause = Object.assign(new Error("other side closed"), { name: "SocketError" });
  return new TypeError("fetch failed", { cause });
}

function ok(): Response {
  return new Response(JSON.stringify({ data: { path: "/", title: "Acme", body: { version: 2 } } }), {
    status: 200,
    headers: { "content-type": "application/json", etag: '"v1"' },
  });
}

type FetchMock = ReturnType<typeof mock.fn<typeof fetch>>;
let warn: ReturnType<typeof mock.method>;

function mockFetch(...steps: Array<() => Response>): FetchMock {
  let i = 0;
  const fn = mock.fn<typeof fetch>(async () => {
    const step = steps[Math.min(i++, steps.length - 1)];
    return step();
  });
  globalThis.fetch = fn;
  return fn;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  warn = mock.method(console, "warn", () => {});
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
});

test("GET: a reset on the first try, 200 on the second → 200, two calls, one warn line without the query", async () => {
  const fetchMock = mockFetch(() => {
    throw socketReset();
  }, ok);
  const res = await fetchGateway(URL_, { cache: "no-store" });
  assert.equal(res.status, 200);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(warn.mock.callCount(), 1);
  const line = String(warn.mock.calls[0].arguments[0]);
  assert.match(line, /UND_ERR_SOCKET/);
  assert.doesNotMatch(line, /acme|host=|path=/, `the warn line leaks the query: ${line}`);
});

test("GET: a reset twice → the error goes out, two calls", async () => {
  const fetchMock = mockFetch(() => {
    throw socketReset();
  });
  await assert.rejects(fetchGateway(URL_), (err: unknown) => err instanceof TypeError && connectionResetCode(err) === "UND_ERR_SOCKET");
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("ECONNRESET and EPIPE (plain Error + code, as Node throws them) are retried; HEAD is retried", async () => {
  for (const code of ["ECONNRESET", "EPIPE"]) {
    for (const method of ["GET", "HEAD"]) {
      const fetchMock = mockFetch(() => {
        throw errnoReset(code);
      }, ok);
      const res = await fetchGateway(URL_, { method });
      assert.equal(res.status, 200, `${method} ${code}`);
      assert.equal(fetchMock.mock.callCount(), 2, `${method} ${code}`);
    }
  }
});

test("a SocketError cause without a code is retried (matched by name)", async () => {
  const fetchMock = mockFetch(() => {
    throw namedOnlyReset();
  }, ok);
  const res = await fetchGateway(URL_);
  assert.equal(res.status, 200);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("the retry carries the caller's init unchanged — the same AbortSignal, so it cannot outlive the timeout", async () => {
  const fetchMock = mockFetch(() => {
    throw socketReset();
  }, ok);
  const signal = AbortSignal.timeout(5_000);
  await fetchGateway(URL_, { cache: "no-store", signal });
  assert.equal(fetchMock.mock.callCount(), 2);
  const [first, second] = fetchMock.mock.calls.map((c) => c.arguments[1]);
  assert.equal(first?.signal, signal);
  assert.equal(second?.signal, signal, "the retry must reuse the caller's signal");
  assert.equal(second, first, "the retry must reuse the caller's init object");
});

test("an error that is not a TypeError is not retried, even with a reset cause", async () => {
  const cause = Object.assign(new Error("other side closed"), { name: "SocketError", code: "UND_ERR_SOCKET" });
  const fetchMock = mockFetch(() => {
    throw new Error("x", { cause });
  }, ok);
  await assert.rejects(fetchGateway(URL_), (err: unknown) => err instanceof Error && err.message === "x");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("an HTTP 500 is an answer, not a reset: no retry", async () => {
  const fetchMock = mockFetch(() => new Response("boom", { status: 500 }));
  const res = await fetchGateway(URL_);
  assert.equal(res.status, 500);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(warn.mock.callCount(), 0);
});

test("non-GET methods are never retried", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const fetchMock = mockFetch(() => {
      throw socketReset();
    }, ok);
    await assert.rejects(fetchGateway(URL_, { method }), TypeError, method);
    assert.equal(fetchMock.mock.callCount(), 1, method);
  }
});

test("a timeout and a fetch failure of another cause are not retried", async () => {
  const timeout = mockFetch(() => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }, ok);
  await assert.rejects(fetchGateway(URL_), { name: "TimeoutError" });
  assert.equal(timeout.mock.callCount(), 1);

  const refused = mockFetch(() => {
    throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
  }, ok);
  await assert.rejects(fetchGateway(URL_), TypeError);
  assert.equal(refused.mock.callCount(), 1);

  // Text alone is not a signal: no cause → no retry.
  const bare = mockFetch(() => {
    throw new TypeError("fetch failed: other side closed");
  }, ok);
  await assert.rejects(fetchGateway(URL_), TypeError);
  assert.equal(bare.mock.callCount(), 1);
});

test("fetchGateway as `typeof fetch` (the DataView reads' option): a string URL GET is retried, a POST Request is not", async () => {
  const get = mockFetch(() => {
    throw socketReset();
  }, ok);
  const res = await fetchGateway(URL_.toString(), { method: "GET", cache: "no-store" });
  assert.equal(res.status, 200);
  assert.equal(get.mock.callCount(), 2);
  assert.doesNotMatch(String(warn.mock.calls.at(-1)?.arguments[0]), /acme|host=/);

  const post = mockFetch(() => {
    throw socketReset();
  }, ok);
  await assert.rejects(fetchGateway(new Request(URL_, { method: "POST", body: "{}" })), TypeError);
  assert.equal(post.mock.callCount(), 1, "a POST Request is never retried");

  const req = mockFetch(() => {
    throw socketReset();
  }, ok);
  assert.equal((await fetchGateway(new Request(URL_))).status, 200);
  assert.equal(req.mock.callCount(), 2, "a GET Request is retried");
});

test("loadPublishedPageData with fetch: fetchGateway — a reset on the DataView read still yields the list, not the stub", async () => {
  const { createPublicDataCache, loadPublishedPageData } = await import("@markerloop/studio/catalog/server");
  const ws = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const body = {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", props: {}, children: ["dv"] },
      dv: {
        type: "DataView",
        props: {
          source: { kind: "collection", workspace_id: ws, collection_id: "11111111-1111-4111-8111-111111111111", collection_key: "news" },
          fields: ["title"],
          sort: { field: "created_at", direction: "desc" },
          filter: [],
          presets: [],
          limit: 20,
        },
      },
    },
    parents: { root: null, dv: "root" },
  };
  const rows = [{ id: "r1", data: { title: "Opening hours changed" }, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }];
  const list = () => new Response(JSON.stringify({ success: true, data: rows, meta: { total: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  const run = async (fetchOption: typeof fetch | undefined) => {
    const fetchMock = mockFetch(() => {
      throw socketReset();
    }, list);
    const data = await loadPublishedPageData(body, { apiBase: "http://gateway-service/api/v1", fetch: fetchOption, cache: createPublicDataCache() });
    return { pages: Object.values(data.pages), calls: fetchMock.mock.callCount() };
  };
  const withRetry = await run(fetchGateway);
  assert.equal(withRetry.calls, 2);
  assert.equal(withRetry.pages.length, 1);
  assert.equal(withRetry.pages[0].status, "list");
  // Control: the same reset without the wrapper is the stub (cached 10 s by the shared cache in the site).
  const bare = await run(undefined);
  assert.equal(bare.calls, 1);
  assert.equal(bare.pages[0].status, "unavailable");
});

test("the site passes fetchGateway to loadPublishedPageData (source guard)", () => {
  const page = readFileSync(path.join(import.meta.dirname, "../src/app/[[...path]]/page.tsx"), "utf8");
  assert.match(page, /loadPublishedPageData\([^\n]*fetch:\s*fetchGateway/, "page.tsx must hand fetchGateway to loadPublishedPageData");
});

test("loadSitePage goes through the retry: a reset then the snapshot → the page", async () => {
  process.env.PAGES_PUBLIC_API_URL = "http://gateway-service/api/v1";
  const fetchMock = mockFetch(() => {
    throw socketReset();
  }, ok);
  const result = await loadSitePage("acme.sites.test", "/");
  assert.equal(result.kind, "page");
  assert.equal(fetchMock.mock.callCount(), 2);
  const [url, init] = fetchMock.mock.calls[1].arguments;
  assert.equal(String(url), URL_.toString());
  assert.equal(init?.cache, "no-store", "the retry keeps no-store");
});

// SDL-774: the theme's fonts come from the site's own /fonts — the policy gains
// exactly `font-src 'self'`, and no other directive widens.
test("CSP: exactly these directives, font-src 'self' and nothing else new", () => {
  assert.equal(
    buildSiteCsp("N0NCE", "sites.test"),
    "default-src 'none'; img-src https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'nonce-N0NCE'; connect-src 'self' https://api.sites.test; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  assert.match(buildSiteCsp("N", undefined), /; connect-src 'self';/);
  assert.doesNotMatch(buildSiteCsp("N", "sites.test"), /googleapis|gstatic|font-src[^;]*(https|\*|data:)/);
});
