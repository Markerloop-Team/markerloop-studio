// Test runner for @markerloop/engine (SDL-603). No framework — the repo has
// none for packages; node:assert + tsx, exit code is the verdict.
//
//   pnpm --filter @markerloop/engine test
//
// Everything is imported by PACKAGE NAME, i.e. through the exports map and the
// built dist — the same way the admin imports it. `pnpm install` (prepare) or
// `pnpm build` must have run first.
import * as React from "react";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { Writable } from "node:stream";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";

import * as root from "@markerloop/engine";
import * as client from "@markerloop/engine/react";
import * as server from "@markerloop/engine/react/server";
import { SaunaRenderer } from "@markerloop/engine/react/renderer";
import { createPagesServiceProvider } from "@markerloop/engine/providers/pages";
import { createHttpProvider } from "@markerloop/engine/providers/http";
import { createSaunaRouteHandlers } from "@markerloop/engine/next";

import { renderAll } from "./render";
import type { EngineUnderTest } from "./fixtures";

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
const test = (name: string, fn: Test["fn"]) => tests.push({ name, fn });

// --- 1. Render parity with the reference ---------------------------------

const engine: EngineUnderTest = {
  SaunaRenderer: SaunaRenderer as EngineUnderTest["SaunaRenderer"],
  SaunaServer: server.Sauna as unknown as EngineUnderTest["SaunaServer"],
  SaunaClient: client.Sauna as unknown as EngineUnderTest["SaunaClient"],
  SaunaProvider: client.SaunaProvider as unknown as EngineUnderTest["SaunaProvider"],
  validateSaunaSchema: root.validateSaunaSchema as EngineUnderTest["validateSaunaSchema"],
  migrateSaunaSchema: root.migrateSaunaSchema as EngineUnderTest["migrateSaunaSchema"],
  loadBlockRefs: root.loadBlockRefs as unknown as EngineUnderTest["loadBlockRefs"],
};

// `cases` is the reference output, rewritten by `snapshots:record`.
// `divergences` is ours, hand-written, and declares the RULE of each
// intentional difference rather than its result: `strip` is a regex removing
// exactly what we add, and what is left must equal the reference byte for
// byte. That asymmetry is the whole point — a stored "expected" blob is a
// lock file, and a lock file is cleared by re-recording it, so an unrelated
// regression can ride along inside the same string under a reason that no
// longer describes it. A rule has nothing to record: any drift outside what
// `strip` removes breaks the equality, and an entry that strips nothing is
// reported as stale rather than passing quietly.
type Divergence = { task?: string; reason?: string; strip?: string; cases?: string[] };
type ReferenceSnapshot = {
  commit: string;
  cases: Record<string, string>;
  divergences?: Record<string, Divergence>;
};

test("snapshot: every fixture renders as the reference does, minus declared divergences", async () => {
  const snapPath = path.join(import.meta.dirname, "__snapshots__/reference.json");
  const reference = JSON.parse(await readFile(snapPath, "utf8")) as ReferenceSnapshot;
  const declared = Object.entries(reference.divergences ?? {}).filter(([name]) => !name.startsWith("_"));
  const actual = await renderAll(engine);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(reference.cases).sort(), "fixture set drifted from the snapshot — re-record it");

  // caseName -> the regexes allowed to be stripped before comparing
  const rules = new Map<string, string[]>();
  for (const [name, d] of declared) {
    assert.ok(d.task && d.reason && d.strip, `divergence ${name} must carry a task, a reason and a strip rule`);
    assert.ok(d.cases?.length, `divergence ${name} must name the cases it applies to`);
    let stripped = 0;
    for (const c of d.cases!) {
      assert.ok(c in reference.cases, `divergence ${name} names a case that no longer exists: ${c}`);
      if (new RegExp(d.strip!).test(actual[c])) stripped++;
      rules.set(c, [...(rules.get(c) ?? []), d.strip!]);
    }
    // A divergence that no longer shows up anywhere is a dead exemption, and a
    // dead exemption is how a rule outlives the behaviour it was written for.
    assert.ok(stripped > 0, `divergence ${name} strips nothing in any of its cases — delete the entry`);
  }

  for (const [name, refHtml] of Object.entries(reference.cases)) {
    let ours = actual[name];
    for (const strip of rules.get(name) ?? []) ours = ours.replace(new RegExp(strip, "g"), "");
    assert.equal(ours, refHtml, `render differs from reference @ ${reference.commit} beyond the declared divergences: ${name}`);
  }
  console.log(`    ${Object.keys(actual).length} cases equal to reference @ ${reference.commit} once ${declared.length} declared divergence(s) are stripped`);
});

test("snapshot: the fixtures are not vacuous", async () => {
  const actual = await renderAll(engine);
  const joined = Object.values(actual).join("\n");
  for (const needle of ["Қазақша промо", "Промо по-русски", "Admin only", "Guest only", "/site/about", 'data-icon="star"',
    "Custom title", "Nested hero", 'data-sauna-ref-placeholder="missing"', 'data-sauna-ref-placeholder="cycle"',
    'data-sauna-ref-placeholder="no-block-id"', 'data-sauna-node-id="hero1"', "From v1"]) {
    assert.ok(joined.includes(needle), `no fixture output contains ${needle}`);
  }
  // SDL-608: an unregistered type used to render nothing at all. It now draws
  // a placeholder — which is NOT the node's own content, so the fixture's
  // `children` still must not reach the page.
  assert.ok(joined.includes('data-sauna-unknown-type="NotInRegistry"'), "an unregistered type must leave a visible hole, not nothing");
  assert.ok(!joined.includes("never drawn"), "the unregistered node's own props must not be rendered");
});

// --- 2. Server/client boundary -------------------------------------------

test("boundary: ./react is a client module, ./react/server and . are not", async () => {
  const dist = path.join(import.meta.dirname, "../dist");
  const head = async (rel: string) => (await readFile(path.join(dist, rel), "utf8")).split("\n", 1)[0];
  assert.equal(await head("react/index.js"), '"use client";');
  assert.equal(await head("react/sauna.client.js"), '"use client";');
  assert.notEqual(await head("react/server.js"), '"use client";');
  assert.notEqual(await head("index.js"), '"use client";');
  assert.equal(typeof server.Sauna, "function");
  assert.equal(typeof createHttpProvider, "function");
  assert.equal(typeof createSaunaRouteHandlers, "function");
});

// --- 3. pages-service provider contract -----------------------------------

const WS = "11111111-1111-4111-8111-111111111111";
const FOREIGN_WS = "22222222-2222-4222-8222-222222222222";
const PAGE_ID = "33333333-3333-4333-8333-333333333333";
const TREE = {
  version: 2,
  rootId: "r",
  nodes: { r: { type: "Box", children: ["t"] }, t: { type: "Text", props: { children: "hi" } } },
  parents: { r: null, t: "r" },
};

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/**
 * A fake gateway + pages-service with the real contract: the workspace in
 * `workspace_id` must be the one the caller is a member of (the gateway's
 * scope check; pages-service answers 403 workspace_scope_mismatch), a missing
 * token is 401, version mismatches are 409 with the current document.
 */
function fakeGateway(opts: { memberOf: string; token?: string; kind?: "pages" | "blocks" }) {
  const field = opts.kind === "blocks" ? "schema" : "body";
  const doc = { id: PAGE_ID, workspace_id: opts.memberOf, version: 3, [field]: TREE as unknown };
  const calls: Call[] = [];
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://admin.local");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = { url: url.pathname + url.search, method: init?.method ?? "GET", headers };
    if (init?.body) call.body = JSON.parse(String(init.body));
    calls.push(call);
    if (opts.token && headers.Authorization !== `Bearer ${opts.token}`) {
      return json(401, { success: false, error: "unauthorized", message: "no JWT" });
    }
    const ws = url.searchParams.get("workspace_id");
    if (ws !== opts.memberOf) {
      return json(403, { success: false, error: "workspace_scope_mismatch", message: "not a member" });
    }
    const expectedPath = `/api/v1/pages/${opts.kind ?? "pages"}/${PAGE_ID}`;
    if (url.pathname !== expectedPath) return json(404, { success: false, error: "not_found" });
    if (call.method === "GET") return json(200, { success: true, data: doc });
    if (call.method === "PATCH") {
      const b = call.body as { version: number } & Record<string, unknown>;
      if (b.version !== doc.version) return json(409, { success: false, error: "page_version_conflict", data: doc });
      doc.version += 1;
      doc[field] = b[field];
      return json(200, { success: true, data: doc });
    }
    return json(405, {});
  }) as typeof fetch;
  return { fetchImpl, calls, doc };
}

test("provider: GET goes through the gateway prefix with the workspace scope and returns the tree", async () => {
  const gw = fakeGateway({ memberOf: WS, token: "t0k" });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api/", workspaceId: WS, fetch: gw.fetchImpl, headers: async () => ({ Authorization: "Bearer t0k" }) });
  const snap = await p.get(PAGE_ID);
  assert.equal(gw.calls[0].url, `/api/v1/pages/pages/${PAGE_ID}?workspace_id=${WS}`);
  assert.equal(gw.calls[0].method, "GET");
  assert.deepEqual(snap.schema, TREE);
  assert.equal(snap.version, "3");
});

test("provider: foreign workspace → 403 surfaces as SaunaAccessDeniedError, no data", async () => {
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: FOREIGN_WS, fetch: gw.fetchImpl });
  const err = await p.get(PAGE_ID).then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaAccessDeniedError(err), `expected access denied, got ${String(err)}`);
  assert.equal((err as root.SaunaAccessDeniedError).status, 403);
  assert.equal((err as root.SaunaAccessDeniedError).code, "workspace_scope_mismatch");
  assert.equal(gw.calls[0].url, `/api/v1/pages/pages/${PAGE_ID}?workspace_id=${FOREIGN_WS}`);
  const putErr = await p.put(PAGE_ID, TREE as never, { ifMatch: "3" }).then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaAccessDeniedError(putErr), "PATCH into a foreign workspace must be refused too");
});

test("provider: a gateway-level 403 keeps a string code, not the nested error object", async () => {
  // Shape the live gateway returns when it refuses the scope itself (SDL-603, test contour 22 Sep 2026).
  const gw = (async () =>
    new Response(
      JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Доступ запрещён", details: "нет прав" } }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: FOREIGN_WS, fetch: gw });
  const err = await p.get(PAGE_ID).then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaAccessDeniedError(err), `expected access denied, got ${String(err)}`);
  assert.equal((err as root.SaunaAccessDeniedError).code, "FORBIDDEN");
  assert.equal((err as root.SaunaAccessDeniedError).message, "Доступ запрещён");
});

test("provider: a 200 claiming another workspace is refused, not returned", async () => {
  const leaky = (async () =>
    new Response(JSON.stringify({ success: true, data: { id: PAGE_ID, workspace_id: FOREIGN_WS, version: 1, body: TREE } }), { status: 200 })) as typeof fetch;
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: leaky });
  const err = await p.get(PAGE_ID).then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaAccessDeniedError(err));
});

test("provider: missing token → 401 → SaunaAccessDeniedError(401)", async () => {
  const gw = fakeGateway({ memberOf: WS, token: "t0k" });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  const err = await p.get(PAGE_ID).then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaAccessDeniedError(err));
  assert.equal((err as root.SaunaAccessDeniedError).status, 401);
});

test("provider: 404 → SaunaNotFoundError", async () => {
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  const err = await p.get("44444444-4444-4444-8444-444444444444").then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaNotFoundError(err));
});

test("provider: put with ifMatch PATCHes {body, version}; stale version → SaunaConflictError with latest", async () => {
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  const next = { ...TREE, nodes: { ...TREE.nodes, t: { type: "Text", props: { children: "edited" } } } };
  const res = await p.put(PAGE_ID, next as never, { ifMatch: "3" });
  assert.equal(res.version, "4");
  const patch = gw.calls.at(-1)!;
  assert.equal(patch.method, "PATCH");
  assert.equal(patch.url, `/api/v1/pages/pages/${PAGE_ID}?workspace_id=${WS}`);
  assert.deepEqual(patch.body, { body: next, version: 3 });
  const err = await p.put(PAGE_ID, next as never, { ifMatch: "3" }).then(() => null, (e: unknown) => e);
  assert.ok(root.isSaunaConflictError(err));
  assert.equal((err as root.SaunaConflictError).latestVersion, "4");
});

test("provider: put without ifMatch reads the current version first (unconditional write)", async () => {
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  const res = await p.put(PAGE_ID, TREE as never);
  assert.deepEqual(gw.calls.map((c) => c.method), ["GET", "PATCH"]);
  assert.equal(res.version, "4");
});

test("provider: kind=blocks targets /v1/pages/blocks and the `schema` field", async () => {
  const gw = fakeGateway({ memberOf: WS, kind: "blocks" });
  const p = createPagesServiceProvider({ apiBaseUrl: "https://staging.example.com/api", workspaceId: WS, kind: "blocks", fetch: gw.fetchImpl });
  const snap = await p.get(PAGE_ID);
  assert.deepEqual(snap.schema, TREE);
  await p.put(PAGE_ID, TREE as never, { ifMatch: snap.version });
  assert.deepEqual(Object.keys(gw.calls.at(-1)!.body as object).sort(), ["schema", "version"]);
});

test("provider: rejects a missing workspace and a non-numeric ifMatch before any request", async () => {
  assert.throws(() => createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: "", fetch: fetch }));
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  await assert.rejects(p.put(PAGE_ID, TREE as never, { ifMatch: 'W/"abc"' }));
  assert.equal(gw.calls.length, 0);
});

test("visibility: public and hybrid show, private shows to a member only, every other non-object hides", () => {
  const evaluate = root.evaluateVisibility as (
    rule: unknown,
    context: unknown
  ) => boolean;

  const guest = {};
  const member = { user: { id: "u1" } };

  // SDL-632 modes. Hybrid is visible to everyone — its guest/member split is
  // in the props, not in the gate.
  for (const ctx of [guest, member]) {
    assert.equal(evaluate("public", ctx), true, "public must show");
    assert.equal(evaluate("hybrid", ctx), true, "hybrid must show");
  }
  assert.equal(evaluate("private", guest), false, "private must NOT show to a guest");
  assert.equal(evaluate("private", member), true, "private must show to a member");
  // The audience is `user` by default and an explicit field wins over it.
  assert.equal(evaluate("private", { user: null }), false);
  assert.equal(evaluate("private", { user: { id: "u1" }, audience: "guest" }), false, "audience: guest must win over a user");
  assert.equal(evaluate("private", { audience: "member" }), true);
  assert.equal(root.saunaAudience(undefined), "guest");
  assert.equal(root.saunaAudience({ user: { id: "u" } }), "member");
  assert.equal(root.saunaAudience({ user: { id: "u" }, audience: "guest" }), "guest");

  // Everything else that is not a plain object keeps failing CLOSED: a string
  // that is not a mode (a typo), numbers, arrays.
  for (const malformed of ["", "secret", "Private", "privat", 0, 1, [], ["private"]]) {
    for (const ctx of [guest, member]) {
      assert.equal(
        evaluate(malformed, ctx),
        false,
        `a ${JSON.stringify(malformed)} rule must hide the node, not show it`
      );
    }
  }

  // Well-formed legacy rules keep their old meaning, including the two that
  // mean "no restriction".
  assert.equal(evaluate(undefined, {}), true);
  assert.equal(evaluate(null, {}), true);
  assert.equal(evaluate({}, {}), true);
  assert.equal(evaluate({ permission: "pages.read" }, { can: () => true }), true);
  assert.equal(evaluate({ permission: "pages.read" }, { can: () => false }), false);
  assert.equal(
    evaluate({ when: { op: "eq", path: "user.role", value: "admin" } }, { user: { role: "admin" } }),
    true
  );
  assert.equal(
    evaluate({ when: { op: "eq", path: "user.role", value: "admin" } }, { user: { role: "guest" } }),
    false
  );
});

test("validate: visibility takes the three modes or an object; anything else is rejected by name", () => {
  const v2 = (visibility: unknown) => ({
    version: 2,
    rootId: "root",
    nodes: { root: { type: "Page", children: [], visibility } },
    parents: {},
  });

  for (const malformed of ["secret", "", "Private", 7, ["private"], null]) {
    const result = engine.validateSaunaSchema(v2(malformed));
    assert.equal(result.ok, false, `${JSON.stringify(malformed)} must not validate`);
    const text = JSON.stringify(result.ok ? {} : result.error);
    assert.ok(
      text.includes("$.nodes.root.visibility"),
      `the issue must name the offending path, got: ${text}`
    );
  }

  for (const mode of ["public", "hybrid", "private"]) {
    assert.equal(engine.validateSaunaSchema(v2(mode)).ok, true, `${mode} must validate`);
  }
  assert.equal(engine.validateSaunaSchema(v2(undefined)).ok, true);
  assert.equal(
    engine.validateSaunaSchema(v2({ when: { op: "truthy", path: "user.id" } })).ok,
    true
  );
  // v1 documents take the same field.
  assert.equal(engine.validateSaunaSchema({ version: 1, root: { type: "Page", visibility: "hybrid" } }).ok, true);
  assert.equal(engine.validateSaunaSchema({ version: 1, root: { type: "Page", visibility: "nope" } }).ok, false);
});

test("validate: a stray member is NOT refused (the stored document stays fixable); member/screens shapes are", () => {
  const doc = (node: Record<string, unknown>) => ({
    version: 2,
    rootId: "root",
    nodes: { root: { type: "Page", children: [], ...node } },
    parents: { root: null },
  });
  // `member` on a node that is not hybrid — inert, and accepted.
  for (const visibility of [undefined, "public", "private", { when: { op: "truthy", path: "user.id" } }]) {
    assert.equal(
      engine.validateSaunaSchema(doc({ visibility, member: { props: { children: "x" } } })).ok,
      true,
      `a stray member under ${JSON.stringify(visibility)} must not lock the document`
    );
  }
  assert.equal(engine.validateSaunaSchema(doc({ screens: { tablet: { props: { a: 1 } }, mobile: {} } })).ok, true);

  const bad: [Record<string, unknown>, string][] = [
    [{ member: "vip" }, "$.nodes.root.member"],
    [{ member: { props: [] } }, "$.nodes.root.member.props"],
    [{ screens: [] }, "$.nodes.root.screens"],
    [{ screens: { desktop: { props: {} } } }, "$.nodes.root.screens.desktop"],
    [{ screens: { mobile: "sm" } }, "$.nodes.root.screens.mobile"],
    [{ screens: { mobile: { props: 3 } } }, "$.nodes.root.screens.mobile.props"],
  ];
  for (const [node, where] of bad) {
    const result = engine.validateSaunaSchema(doc(node));
    assert.equal(result.ok, false, `${JSON.stringify(node)} must not validate`);
    assert.ok(JSON.stringify(result.ok ? {} : result.error).includes(`"path":"${where}"`), `must name ${where}`);
  }
});

// --- SDL-632: public shell, shared with pages-service ------------------------

type ShellCase = {
  name: string;
  doc: root.SaunaAnySchema;
  expect_shell: root.SaunaAnySchema;
  /** Present only when `doc` has `nodes` (v2 or mixed). */
  expect_cacheability?: Record<string, root.SaunaNodeCacheability>;
  guest_render_differs?: boolean;
};
const nodesOf = (s: root.SaunaAnySchema): root.SaunaSchema["nodes"] | undefined => {
  const n = (s as { nodes?: unknown }).nodes;
  return typeof n === "object" && n !== null && !Array.isArray(n) ? (n as root.SaunaSchema["nodes"]) : undefined;
};
const loadShellCases = async (): Promise<ShellCase[]> => {
  const raw = await readFile(path.join(import.meta.dirname, "fixtures/visibility-shell.cases.json"), "utf8");
  return (JSON.parse(raw) as { cases: ShellCase[] }).cases;
};

test("public shell: saunaPublicShell and saunaNodeCacheability agree with the shared fixture, case by case", async () => {
  const cases = await loadShellCases();
  assert.ok(cases.length >= 20, "the fixture lost cases");
  // The fail-closed exemption must stay rare and named — not a way to park a
  // case whose shell simply came out wrong.
  assert.deepEqual(
    cases.filter((c) => c.guest_render_differs).map((c) => c.name).sort(),
    [
      "a node listed under both a public and a private parent is cut (fail closed)",
      "a private root is reduced to its type",
      "nodes as an array (or any non-object) is not cut by index: nodes and parents are dropped, fail closed",
      "parents as an array: nodes and parents are dropped, fail closed",
      "v1 tree: a private root is reduced to its type",
    ],
  );
  assert.ok(cases.some((c) => Array.isArray((c.doc as { nodes?: unknown }).nodes)), "no nodes-as-array case");
  assert.ok(cases.some((c) => "root" in c.doc && !("nodes" in c.doc)), "no v1 case");
  assert.ok(cases.some((c) => "root" in c.doc && "nodes" in c.doc), "no mixed root+nodes case");
  assert.ok(cases.some((c) => "nodes" in c.doc && !("parents" in c.doc)), "no nodes-without-parents case");
  for (const c of cases) {
    const before = JSON.stringify(c.doc);
    const shell = root.saunaPublicShell(c.doc);
    assert.deepEqual(shell, c.expect_shell, `shell: ${c.name}`);
    assert.equal(JSON.stringify(c.doc), before, `${c.name}: the input was mutated`);
    // Idempotent: the shell of a shell is itself.
    assert.deepEqual(root.saunaPublicShell(shell), shell, `${c.name}: not idempotent`);
    // Every node id of the document is covered, nothing extra (v2 / mixed only).
    const docNodes = nodesOf(c.doc);
    const malformed = "nodes" in c.doc && (docNodes === undefined || Array.isArray((c.doc as { parents?: unknown }).parents));
    assert.equal(docNodes !== undefined && !malformed, c.expect_cacheability !== undefined, `${c.name}: expect_cacheability iff plain nodes`);
    if (malformed) {
      assert.ok(!("nodes" in shell) && !("parents" in shell), `${c.name}: malformed nodes/parents must be dropped`);
      assert.ok(!root.validateSaunaSchema(c.doc).ok, `${c.name}: the validator must refuse it on write`);
      continue;
    }
    if (docNodes && c.expect_cacheability && !malformed) {
      const v2 = c.doc as root.SaunaSchema;
      const shellNodes = nodesOf(shell)!;
      assert.deepEqual(Object.keys(c.expect_cacheability).sort(), Object.keys(docNodes).sort(), `${c.name}: cacheability must cover every node`);
      for (const [id, expected] of Object.entries(c.expect_cacheability)) {
        assert.equal(root.saunaNodeCacheability(v2, id), expected, `${c.name}: cacheability of ${id}`);
        // A node the shell removed is exactly a node nothing of which is public.
        assert.equal(expected === "none", !(id in shellNodes) || (id === v2.rootId && Object.keys(shellNodes[id]!).length === 1), `${c.name}: ${id} none ⇔ cut`);
      }
    }
    // Nothing member-only, nothing private survives anywhere in the body.
    const body = JSON.stringify(shell);
    assert.ok(!body.includes('"member"'), `${c.name}: member survived`);
    assert.ok(!body.includes('"private"') || c.name.includes("unknown mode"), `${c.name}: a private node survived`);
  }
  assert.equal(root.saunaNodeCacheability(cases[0]!.doc as root.SaunaSchema, "no-such-node"), "none");
});

test("public shell: the rendered shell for a guest equals the rendered document for a guest", async () => {
  // The shell must not change what a guest sees — only what the body carries.
  const cases = await loadShellCases();
  const registry: client.SaunaRegistry = new Proxy({}, {
    get: (_t, type: string) => (p: Record<string, unknown>) =>
      React.createElement("div", { "data-t": type, "data-tone": p.tone as string | undefined }, p.children as React.ReactNode),
  });
  for (const c of cases) {
    if (c.guest_render_differs) continue; // fail-closed cases: the shell deliberately draws less than the document
    const guest = { audience: "guest" as const };
    // The renderer draws v2; a v1 document goes through the same migration the
    // client applies, so the parity holds for the tree a visitor really sees.
    const a = renderToStaticMarkup(<SaunaRenderer schema={root.migrateSaunaSchema(c.doc)} registry={registry} context={guest} />);
    const b = renderToStaticMarkup(<SaunaRenderer schema={root.migrateSaunaSchema(root.saunaPublicShell(c.doc))} registry={registry} context={guest} />);
    assert.equal(b, a, `${c.name}: the shell renders differently for a guest`);
  }
});

test("public shell: a 50k-node parents chain is cut in linear time", async () => {
  // Hand-written documents can name a node only in `parents`. The sweep that
  // follows that map must be one pass: the earlier "rescan until nothing
  // grows" loop was quadratic and took ~60 s at 50k on an anonymous GET.
  // The work runs in a worker (test/shell-chain.worker.mjs) so a regression
  // is REPORTED after the wall-clock guard rather than hanging the suite.
  const N = 50_000;
  const worker = new Worker(new URL("./shell-chain.worker.mjs", import.meta.url), { workerData: { n: N } });
  const result = await new Promise<{ ms: number; kept: string[] } | "timeout">((resolve, reject) => {
    const guard = setTimeout(() => resolve("timeout"), 5_000);
    worker.once("message", (m: { ms: number; kept: string[] }) => { clearTimeout(guard); resolve(m); });
    worker.once("error", (e) => { clearTimeout(guard); reject(e); });
  });
  await worker.terminate();
  assert.notEqual(result, "timeout", `saunaPublicShell did not finish a ${N}-node chain within 5 s (limit 500 ms)`);
  const { ms, kept } = result as { ms: number; kept: string[] };
  assert.deepEqual(kept, ["root"], "the whole chain must be cut");
  assert.ok(ms < 500, `saunaPublicShell took ${ms.toFixed(0)} ms for a ${N}-node chain (limit 500 ms)`);
});

// --- SDL-632: props layers ------------------------------------------------

const LayerText = (p: { children?: React.ReactNode; tone?: string; size?: string }) => (
  <span data-tone={p.tone} data-size={p.size}>{p.children}</span>
);
const LayerBox = (p: { children?: React.ReactNode }) => <div>{p.children}</div>;
const LAYER_REGISTRY = { Text: LayerText, Box: LayerBox, Page: LayerBox };

const layerDoc = (nodes: root.SaunaSchema["nodes"], parents: root.SaunaSchema["parents"]): root.SaunaSchema => ({
  version: 2, rootId: "root", nodes, parents,
});
const drawLayers = (schema: root.SaunaSchema, context: Record<string, unknown>, blocks?: Record<string, root.SaunaSchema>) =>
  renderToStaticMarkup(<SaunaRenderer schema={schema} registry={LAYER_REGISTRY} context={context} blocks={blocks} />);

test("layers: guest sees props, member sees member.props on hybrid — on the node and on its descendants", () => {
  const doc = layerDoc({
    root: { type: "Page", children: ["card", "plain"] },
    card: { type: "Box", visibility: "hybrid", children: ["price", "own"] },
    price: { type: "Text", props: { children: "100", tone: "muted" }, member: { props: { children: "80" } } },
    own: { type: "Text", visibility: "public", props: { children: "same" }, member: { props: { children: "LEAK-public" } } },
    plain: { type: "Text", props: { children: "plain" }, member: { props: { children: "LEAK-no-mode" } } },
  }, { root: null, card: "root", price: "card", own: "card", plain: "root" });

  const guest = drawLayers(doc, {});
  assert.match(guest, /<span data-tone="muted">100<\/span>/, guest);
  const member = drawLayers(doc, { user: { id: "u" } });
  // Layered by KEY: the member's children win, the base tone stays.
  assert.match(member, /<span data-tone="muted">80<\/span>/, member);
  // member is inert where the mode in force is not hybrid.
  assert.ok(!member.includes("LEAK"), `member.props applied off a hybrid node: ${member}`);
  assert.ok(!guest.includes("80") && !guest.includes("LEAK"), guest);
  // An explicit guest audience wins over a user.
  assert.equal(drawLayers(doc, { user: { id: "u" }, audience: "guest" }), guest);
});

test("layers: private renders for a member only; hybrid for everyone", () => {
  const doc = layerDoc({
    root: { type: "Page", children: ["p", "h"] },
    p: { type: "Text", visibility: "private", props: { children: "members-only" } },
    h: { type: "Text", visibility: "hybrid", props: { children: "hybrid" } },
  }, { root: null, p: "root", h: "root" });
  const guest = drawLayers(doc, {});
  assert.ok(!guest.includes("members-only") && guest.includes("hybrid"), guest);
  const member = drawLayers(doc, { user: { id: "u" } });
  assert.ok(member.includes("members-only") && member.includes("hybrid"), member);
});

test("layers: order is props < member.props < screens[screen].props < matched variant", () => {
  const node: root.SaunaNodeConfig = {
    type: "Text",
    visibility: "hybrid",
    props: { children: "base", tone: "base", size: "base" },
    member: { props: { children: "member", tone: "member", size: "member" } },
    screens: { mobile: { props: { tone: "mobile", size: "mobile" } }, tablet: { props: { size: "tablet" } } },
    variants: [{ id: "v", when: { when: { op: "truthy", path: "flag" } }, props: { size: "variant" } }],
  };
  const body = (ctx: Record<string, unknown>) => root.resolveNodeBody(node, ctx).props;
  assert.deepEqual(body({}), { children: "base", tone: "base", size: "base" });
  assert.deepEqual(body({ user: { id: "u" } }), { children: "member", tone: "member", size: "member" });
  assert.deepEqual(body({ user: { id: "u" }, screen: "mobile" }), { children: "member", tone: "mobile", size: "mobile" });
  assert.deepEqual(body({ screen: "mobile" }), { children: "base", tone: "mobile", size: "mobile" });
  assert.deepEqual(body({ screen: "tablet" }), { children: "base", tone: "base", size: "tablet" });
  assert.deepEqual(body({ screen: "base" }), { children: "base", tone: "base", size: "base" });
  assert.deepEqual(body({ user: { id: "u" }, screen: "mobile", flag: true }), { children: "member", tone: "mobile", size: "variant" });
  // Identity-stable when no layer applies.
  const bare: root.SaunaNodeConfig = { type: "Text", props: { a: 1 } };
  assert.equal(root.resolveNodeBody(bare, { screen: "mobile" }).props, bare.props);
  // The same through the renderer.
  const doc = layerDoc({ root: { ...node, variants: undefined } }, { root: null });
  assert.equal(drawLayers(doc, { user: { id: "u" }, screen: "mobile" }), '<span data-tone="mobile" data-size="mobile">member</span>');
});

test("layers: a Ref's params merge BY NAME across member and screen overrides, never replaced whole", () => {
  const block: root.SaunaSchema = {
    version: 2, rootId: "b",
    nodes: {
      b: { type: "Box", children: ["t1", "t2", "t3"] },
      t1: { type: "Text", props: { children: "A-default" } },
      t2: { type: "Text", props: { children: "B-default" } },
      t3: { type: "Text", props: { children: "C-default" } },
    },
    parents: { b: null, t1: "b", t2: "b", t3: "b" },
    params: [
      { name: "a", nodeId: "t1", prop: "children" },
      { name: "b", nodeId: "t2", prop: "children" },
      { name: "c", nodeId: "t3", prop: "children" },
    ],
  };
  const doc = layerDoc({
    root: {
      type: "Ref",
      visibility: "hybrid",
      props: { blockId: "blk", params: { a: "A-page", b: "B-page" } },
      member: { props: { params: { b: "B-member" } } },
      screens: { mobile: { props: { params: { c: "C-mobile" } } } },
    },
  }, { root: null });
  const blocks = { blk: block };
  const guest = drawLayers(doc, {}, blocks);
  assert.ok(guest.includes("A-page") && guest.includes("B-page") && guest.includes("C-default"), guest);
  const member = drawLayers(doc, { user: { id: "u" } }, blocks);
  assert.ok(member.includes("A-page"), `member override dropped a sibling param: ${member}`);
  assert.ok(member.includes("B-member") && !member.includes("B-page"), member);
  const memberMobile = drawLayers(doc, { user: { id: "u" }, screen: "mobile" }, blocks);
  assert.ok(memberMobile.includes("A-page") && memberMobile.includes("B-member") && memberMobile.includes("C-mobile"), memberMobile);
  // A non-Ref node's `params` prop is an ordinary prop: replaced, not merged.
  assert.deepEqual(
    root.saunaLayerNodeProps({ type: "Text", props: { params: { x: 1 } }, screens: { mobile: { props: { params: { y: 2 } } } } }, { screen: "mobile" }),
    { params: { y: 2 } }
  );
});

test("layers: an override key \"__proto__\" (JSON.parse output) is written as data, never as the prototype", () => {
  const member = JSON.parse('{"props":{"__proto__":{"polluted":"yes"},"children":"m"}}') as root.SaunaMemberBranch;
  const node: root.SaunaNodeConfig = { type: "Text", visibility: "hybrid", props: { children: "g" }, member };
  const props = root.saunaLayerNodeProps(node, { member: true })!;
  assert.equal(Object.getPrototypeOf(props), Object.prototype, "the prototype of the props bag was replaced");
  assert.equal((props as { polluted?: unknown }).polluted, undefined, "an inherited key leaked in through __proto__");
  assert.ok(Object.hasOwn(props, "__proto__"), "__proto__ must stay as an own data key");
  assert.equal(props.children, "m");
  assert.equal(({} as { polluted?: unknown }).polluted, undefined, "Object.prototype was polluted");
  // Same through the screen layer and the by-name params merge of a Ref.
  const screens = JSON.parse('{"mobile":{"props":{"__proto__":{"x":1}}}}') as root.SaunaScreenOverrides;
  const viaScreen = root.saunaLayerNodeProps({ type: "Text", screens }, { screen: "mobile" })!;
  assert.equal(Object.getPrototypeOf(viaScreen), Object.prototype);
  const params = JSON.parse('{"props":{"params":{"__proto__":{"y":1},"a":"A"}}}') as root.SaunaMemberBranch;
  const ref = root.saunaLayerNodeProps({ type: "Ref", props: { params: { b: "B" } }, member: params }, { member: true })!;
  const merged = ref.params as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal(merged.a, "A");
  assert.equal(merged.b, "B");
});

test("layers: a Ref inside a hybrid section hands the mode down into the block", () => {
  const block: root.SaunaSchema = {
    version: 2, rootId: "b",
    nodes: { b: { type: "Text", props: { children: "guest" }, member: { props: { children: "member" } } } },
    parents: { b: null },
  };
  const doc = layerDoc({
    root: { type: "Box", visibility: "hybrid", children: ["r"] },
    r: { type: "Ref", props: { blockId: "blk" } },
  }, { root: null, r: "root" });
  assert.ok(drawLayers(doc, { user: { id: "u" } }, { blk: block }).includes(">member<"));
  assert.ok(drawLayers(doc, {}, { blk: block }).includes(">guest<"));
});

// --- 4. Registry vs catalog, adapter groups (SDL-629) ----------------------

const Comp = (() => null) as unknown as React.ComponentType<Record<string, unknown>>;
function Form() { return null; }
function Box() { return null; }
function Formatter() { return null; }

test("catalog: an entry with no registry pair is reported, a paired one is not", () => {
  const registry = { Page: Comp, Section: Comp };
  assert.deepEqual(client.findUnrenderableTypes([{ type: "Page" }, { type: "Section" }], registry), []);
  assert.deepEqual(
    client.findUnrenderableTypes([{ type: "Page" }, { type: "Hero" }, { type: "Hero" }], registry),
    ["Hero"]
  );
  const catalog = { groups: [], items: [{ type: "Page", groupId: "g" }, { type: "Ghost", groupId: "g" }] };
  assert.deepEqual(server.findUnrenderableTypes(catalog, registry), ["Ghost"]);
});

test("catalog: the kit walk yields a catalog whose every item the registry renders", () => {
  const { registry, catalog } = client.createSaunaCatalog({ Form, Box, Formatter });
  assert.equal(catalog.items.length, 3);
  assert.deepEqual(client.findUnrenderableTypes(catalog, registry), []);
});

test("catalog: the group comes from the adapter, never from the export name", () => {
  // Without adapter data every name lands in the ungrouped bucket: a name
  // that starts with "Form" or "Box" no longer earns a group by itself.
  const bare = client.createSaunaCatalog({ Form, Box, Formatter }).catalog;
  assert.deepEqual(
    bare.items.map((i) => i.groupId),
    [client.SAUNA_UNGROUPED_ID, client.SAUNA_UNGROUPED_ID, client.SAUNA_UNGROUPED_ID]
  );
  assert.ok(bare.groups.some((g) => g.id === client.SAUNA_UNGROUPED_ID), "ungrouped bucket is declared");

  const adapter = {
    groups: [
      { id: "layout", title: "Layout", order: 1 },
      { id: "text", title: "Text", order: 2 },
    ],
    groupOf: { Form: "layout", Box: "text" },
  };
  const adapted = client.createSaunaCatalog({ Form, Box, Formatter }, { adapter }).catalog;
  const byType = Object.fromEntries(adapted.items.map((i) => [i.type, i.groupId]));
  assert.deepEqual(byType, { Box: "text", Form: "layout", Formatter: client.SAUNA_UNGROUPED_ID });
  assert.deepEqual(adapted.groups.map((g) => g.id), ["layout", "text", client.SAUNA_UNGROUPED_ID]);

  // The adapter is authoritative over the kit's own hint.
  const withHint = client.createSaunaCatalog(
    { Form, saunaCatalogMeta: { Form: { groupId: "forms" } } },
    { adapter }
  ).catalog;
  assert.equal(withHint.items[0]?.groupId, "layout");
});

test("catalog: defineElementSet pairs blocks with the registry at the type level", () => {
  const registry = { Page: Comp, Section: Comp };
  const ok = client.defineElementSet({
    registry,
    blocks: [root.defineBlock({ type: "Page" }), root.defineBlock({ type: "Section" })],
  });
  assert.equal(ok.blocks.length, 2);
  client.defineElementSet({
    registry,
    // @ts-expect-error -- "Hero" has no registry pair: a catalog entry without one does not compile.
    blocks: [root.defineBlock({ type: "Hero" })],
  });
});

// --- 5. The four primitives (SDL-630) -----------------------------------

test("primitives: Text, Image, Box and Link are offered, each with a registry pair", () => {
  assert.deepEqual(root.PRIMITIVE_BLOCKS.map((b) => b.type), ["Text", "Image", "Box", "Link"]);
  assert.deepEqual(client.findUnrenderableTypes(root.PRIMITIVE_BLOCKS, client.PRIMITIVE_REGISTRY), []);
  // Editable: every prop a new node starts with is a field of the form.
  for (const b of root.PRIMITIVE_BLOCKS) {
    const parsed = b.staticProps?.safeParse(b.meta?.initialProps);
    assert.ok(parsed?.success, `${b.type}: initialProps do not parse against staticProps`);
    assert.deepEqual(parsed.data, b.meta?.initialProps, `${b.type}: a default outside the form`);
  }
});

test("primitives: defaults are self-contained — no initial prop points at an app route", () => {
  assert.deepEqual(root.findRouteBoundDefaults(root.PRIMITIVE_BLOCKS), []);
  assert.equal("src" in (root.ImageBlock.meta?.initialProps ?? { src: "missing" }), false, "Image must start with no src");
  // The guard itself: the reference's placeholder, a site root, a nested and a
  // preview-schema value are caught; a scheme URL, //host and #anchor are not.
  const bad = root.defineBlock({
    type: "Bad",
    meta: {
      initialProps: { src: "/sauna-assets/placeholder.png", links: [{ href: "/" }], ok: ["https://x.y/a", "//cdn/a", "#top", "text"] },
      previewSchema: { version: 2, rootId: "n", nodes: { n: { type: "Bad", props: { href: "/about" } } }, parents: { n: null } },
    },
  });
  assert.deepEqual(
    root.findRouteBoundDefaults([bad]).map((f) => `${f.path}=${f.value}`),
    ["initialProps.src=/sauna-assets/placeholder.png", "initialProps.links[0].href=/", "previewSchema.n(Bad).props.href=/about"]
  );
});

test("primitives: each inserted with its defaults renders and is selectable on the canvas", () => {
  for (const b of root.PRIMITIVE_BLOCKS) {
    const schema = {
      version: 2 as const,
      rootId: "root",
      nodes: { root: { type: b.type, props: b.meta?.initialProps } },
      parents: { root: null },
    };
    assert.ok(root.validateSaunaSchema(schema).ok, `${b.type}: the inserted node does not validate`);
    const html = renderToStaticMarkup(<SaunaRenderer editable schema={schema} registry={client.PRIMITIVE_REGISTRY} />);
    assert.match(html, /data-sauna-node-id="root"/, `${b.type} swallowed the node id: ${html}`);
    const visitor = renderToStaticMarkup(<SaunaRenderer schema={schema} registry={client.PRIMITIVE_REGISTRY} />);
    assert.ok(visitor.length > 0 && !visitor.includes("data-sauna-node-id"), `${b.type}: ${visitor}`);
  }
});

test("primitives: Image without src draws its own empty state and requests nothing", () => {
  const empty = renderToStaticMarkup(<client.Image data-sauna-node-id="n" />);
  assert.ok(!empty.includes("<img"), empty);
  assert.ok(!/\ssrc=/.test(empty), empty);
  assert.match(empty, /role="img"/);
  assert.match(empty, /data-sauna-node-id="n"/);
  const full = renderToStaticMarkup(<client.Image src="https://cdn.example/a.png" alt="A" />);
  assert.match(full, /<img[^>]*src="https:\/\/cdn\.example\/a\.png"[^>]*alt="A"/);
});

test("primitives: Image never outgrows its container, and `aspect` gives `fit` a frame (SDL-769)", () => {
  // Every picture shrinks with its row: three 1600px pictures in a row share
  // it instead of the first taking it all and the root clipping the rest
  // (SDL-769 review r2). The logo beside long text is the row's job (below).
  const plain = renderToStaticMarkup(<client.Image src="https://cdn.example/a.png" fit="contain" />);
  assert.match(plain, /max-width:100%;min-width:0/, plain);
  assert.match(plain, /height:auto/, plain);
  assert.match(plain, /object-fit:contain/, plain);
  // `auto` (and no prop at all) keeps the picture's own shape: no frame.
  assert.ok(!/aspect-ratio|[;"]width:100%/.test(plain), `no frame without aspect: ${plain}`);
  assert.equal(renderToStaticMarkup(<client.Image src="https://cdn.example/a.png" aspect="auto" />), renderToStaticMarkup(<client.Image src="https://cdn.example/a.png" />));
  // A frame: full width, the chosen proportions — the box object-fit works in.
  const framed = renderToStaticMarkup(<client.Image src="https://cdn.example/a.png" fit="contain" aspect="1 / 1" />);
  assert.match(framed, /width:100%;aspect-ratio:1 \/ 1;max-width:100%;min-width:0;height:auto;object-fit:contain/, framed);
  // The empty frame takes the chosen shape too (16 / 9 without one).
  assert.match(renderToStaticMarkup(<client.Image aspect="3 / 4" />), /aspect-ratio:3 \/ 4/);
  assert.match(renderToStaticMarkup(<client.Image />), /aspect-ratio:16 \/ 9/);
  // The catalog half: every aspect is a CSS aspect-ratio or `auto`, absent = auto.
  for (const a of root.IMAGE_ASPECTS) assert.ok(a === "auto" || /^\d+ \/ \d+$/.test(a), a);
  assert.equal(root.ImageBlock.staticProps?.parse({}).aspect, "auto");
  assert.equal(root.ImageBlock.staticProps?.safeParse({ aspect: "2:1" }).success, false);
});

test("primitives: a row Box makes its text yield to a picture, a column Box does not (SDL-769)", () => {
  // Without the rule a long paragraph starts at its one-line width and a
  // 200px logo beside it shrinks to ~20px (SDL-769 review r1).
  const row = renderToStaticMarkup(<client.Box direction="row"><p>t</p></client.Box>);
  assert.match(row, /^<div data-pages-primitive="box" data-pages-row=""/, row);
  const css = /<style>([^<]*)<\/style>/.exec(row)?.[1] ?? "";
  // Scoped to rows that hold a picture, only text and Box children, and only
  // shrink — nothing grows: a column of buttons beside a picture went from
  // 92 to 1064px with `flex: 1 1 0%` (review r3).
  assert.match(css, /^\[data-pages-row\]:has\(> img\) > :is\(p, h1, h2, h3, \[data-pages-primitive="box"\]\) \{ flex-shrink: 1000; \}$/, css);
  assert.ok(!/<style|data-pages-row/.test(renderToStaticMarkup(<client.Box direction="column"><p>t</p></client.Box>)), "a column needs no rule");
});

test("primitives: Text, Box and Link render what their props say", () => {
  assert.match(renderToStaticMarkup(<client.Text level="h2" text="Hi" />), /^<h2[^>]*>Hi<\/h2>$/);
  assert.match(renderToStaticMarkup(<client.Box direction="row" gap={2} />), /flex-direction:row;gap:calc\(0.5rem \* var\(--pages-density, 1\)\)/);
  const a = renderToStaticMarkup(<client.Link href="https://x.y" target="_blank" text="Go" />);
  assert.match(a, /<a href="https:\/\/x\.y" target="_blank" rel="noopener noreferrer"[^>]*>Go<\/a>/);
});

// --- 5b. No author JavaScript, no raw HTML (SDL-681) ---------------------

test("safe urls: http(s)/mailto/tel/relative pass, javascript:/data: are refused (data:image only in a src)", () => {
  for (const ok of ["https://x.y", "http://x.y/a?b#c", "mailto:a@b.c", "tel:+77001234567", "/about", "about", "#top", "?q=1", "//cdn.x/a", "", "mlfile:00000000-0000-4000-8000-000000000001"]) {
    assert.ok(root.isSafeUrl(ok, "href"), `refused ${ok}`);
  }
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "\u0001javascript:x", "vbscript:x", "data:text/html,<script>alert(1)</script>", "data:image/png;base64,AAAA"]) {
    assert.ok(!root.isSafeUrl(bad, "href"), `passed ${JSON.stringify(bad)} in href`);
  }
  assert.ok(root.isSafeUrl("data:image/png;base64,AAAA", "src"));
  assert.ok(root.isSafeUrl("data:image/png;base64,AAAA", "imageSrc"));
  assert.ok(!root.isSafeUrl("data:text/html,x", "src"));
});

test("safe urls: Link href=javascript: renders with no href, and nothing in the HTML says javascript:", () => {
  const schema: root.SaunaSchema = {
    version: 2,
    rootId: "r",
    parents: { r: null, a: "r", i: "r", d: "r" },
    nodes: {
      r: { type: "Box", children: ["a", "i", "d"], props: { dangerouslySetInnerHTML: { __html: "<script>alert(1)</script>" }, onClick: "alert(1)", srcDoc: "<script>alert(1)</script>" } },
      a: { type: "Link", props: { text: "Go", href: "javascript:alert(1)" } },
      i: { type: "Image", props: { src: "javascript:alert(1)", alt: "x" } },
      d: { type: "Image", props: { src: "data:image/png;base64,AAAA", alt: "ok" } },
    },
  };
  for (const editable of [false, true]) {
    const html = renderToStaticMarkup(<SaunaRenderer editable={editable} schema={schema} registry={client.PRIMITIVE_REGISTRY} />);
    assert.ok(!/javascript:/i.test(html), html);
    assert.ok(!/<script/i.test(html) && !/srcdoc/i.test(html) && !/onclick/i.test(html), html);
    assert.match(html, /<a(?![^>]*\shref=)[^>]*>Go<\/a>/, `the link kept an href: ${html}`);
    assert.match(html, /<img[^>]*src="data:image\/png;base64,AAAA"/, "data:image in a src is allowed");
  }
  // A host link mapper is checked too, and a direct use of Link is covered on its own.
  const mapped = renderToStaticMarkup(
    <SaunaRenderer schema={{ version: 2, rootId: "a", parents: { a: null }, nodes: { a: { type: "Link", props: { text: "Go", href: "/x" } } } }} registry={client.PRIMITIVE_REGISTRY} context={{ link: () => "javascript:alert(1)" }} />
  );
  assert.ok(!/javascript:/i.test(mapped), mapped);
  assert.ok(!/href=/.test(renderToStaticMarkup(<client.Link href="javascript:alert(1)" text="Go" />)));
  assert.match(renderToStaticMarkup(<client.Link href="mailto:a@b.c" text="Go" />), /href="mailto:a@b\.c"/);
});

test("safe urls: on READ an unsafe prop is a warning, not a refusal — the page still renders", () => {
  const doc = { version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type: "Link", props: { text: "Go", href: "javascript:alert(1)", HREF: "javascript:alert(2)" } } } };
  const read = root.validateSaunaSchema(doc);
  assert.ok(read.ok, "a read must not refuse the whole document");
  assert.ok(read.ok && read.warnings?.some((w) => w.path === "$.nodes.r.props.href"), JSON.stringify(read));
  assert.ok(read.ok && read.warnings?.some((w) => w.path === "$.nodes.r.props.HREF"), JSON.stringify(read));
  assert.equal(root.validateSaunaSchema({ ...doc, nodes: { r: { type: "Link", props: { href: "/ok" } } } }).ok && "warnings" in (root.validateSaunaSchema({ ...doc, nodes: { r: { type: "Link", props: { href: "/ok" } } } }) as object), false);
  assert.equal(root.validateSaunaSchema(doc, { mode: "write" }).ok, false);
  const html = renderToStaticMarkup(<SaunaRenderer schema={read.ok ? (read.value as root.SaunaSchema) : (doc as never)} registry={client.PRIMITIVE_REGISTRY} />);
  assert.ok(!/javascript:/i.test(html) && !/href=/i.test(html), html);
  assert.match(html, />Go<\/a>/);
});

test("safe urls: a host's file resolver is checked like context.link", () => {
  const doc: root.SaunaSchema = { version: 2, rootId: "i", parents: { i: null }, nodes: { i: { type: "Image", props: { src: "mlfile:00000000-0000-4000-8000-000000000001", alt: "a" } } } };
  const html = renderToStaticMarkup(<SaunaRenderer schema={doc} registry={client.PRIMITIVE_REGISTRY} context={{ file: () => ({ url: "javascript:alert(1)" }) }} />);
  assert.ok(!/javascript:/i.test(html) && !html.includes("<img"), html);
});

test("safe urls: case and depth — HREF, SRCDOC, onclick, formaction, xlink:href are dropped in render", () => {
  const props = { HREF: "https://x.y", SRCDOC: "<p>", onclick: "alert(1)", formaction: "javascript:x", "xlink:href": "javascript:x", href: "/ok", deep: [{ srcDoc: "<p>", label: "k" }] };
  assert.deepEqual(root.stripUnsafeProps(props), { href: "/ok", deep: [{ label: "k" }] });
  const schema: root.SaunaSchema = { version: 2, rootId: "b", parents: { b: null }, nodes: { b: { type: "Box", props: { HREF: "javascript:alert(1)", SRCDOC: "<script>alert(1)</script>", onclick: "alert(1)", formaction: "javascript:alert(1)" } } } };
  const html = renderToStaticMarkup(<SaunaRenderer schema={schema} registry={client.PRIMITIVE_REGISTRY} />);
  assert.ok(!/javascript:|srcdoc|onclick|<script/i.test(html), html);
});

test("provider: put refuses an unsafe URL before any PATCH, naming the path", async () => {
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  const bad = { ...TREE, nodes: { ...TREE.nodes, t: { type: "Link", props: { href: "javascript:alert(1)" } } } };
  const before = gw.calls.length;
  const err = await p.put(PAGE_ID, bad as never, { ifMatch: "3" }).then(() => null, (e: unknown) => e);
  assert.ok(err instanceof Error && /\$\.nodes\.t\.props\.href/.test(err.message), String(err));
  assert.equal(gw.calls.filter((c) => c.method === "PATCH").length, gw.calls.slice(0, before).filter((c) => c.method === "PATCH").length, "nothing was PATCHed");
});

test("safe urls: nested href in an array is dropped, safe siblings and identity are kept", () => {
  const props = { items: [{ href: "javascript:x", label: "a" }, { href: "/ok", label: "b" }], title: "t" };
  const out = root.stripUnsafeProps(props) as typeof props;
  assert.deepEqual(out, { items: [{ label: "a" }, { href: "/ok", label: "b" }], title: "t" });
  assert.equal(out.items[1], props.items[1], "an untouched branch keeps its identity");
  const clean = { href: "/a" };
  assert.equal(root.stripUnsafeProps(clean), clean);
});

test("safe urls: the validator refuses unsafe URLs and raw-HTML props in every props bag", () => {
  const base = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    version: 2,
    rootId: "r",
    parents: { r: null },
    nodes: { r: { type: "Link", props, ...extra } },
  });
  const refused = (doc: unknown, pathPart: string) => {
    const v = root.validateSaunaSchema(doc, { mode: "write" });
    assert.ok(!v.ok, `accepted: ${JSON.stringify(doc)}`);
    assert.ok(!v.ok && v.error.issues.some((i) => i.path.includes(pathPart)), !v.ok ? JSON.stringify(v.error.issues) : "");
  };
  refused(base({ href: "javascript:alert(1)" }), "$.nodes.r.props.href");
  refused(base({ src: "data:text/html,x" }), "props.src");
  refused(base({ links: [{ href: "javascript:x" }] }), "props.links[0].href");
  refused(base({ dangerouslySetInnerHTML: { __html: "<b>x</b>" } }), "props.dangerouslySetInnerHTML");
  refused(base({ srcDoc: "<p>" }), "props.srcDoc");
  refused(base({ onClick: "alert(1)" }), "props.onClick");
  refused(base({}, { member: { props: { href: "javascript:x" } } }), "member.props.href");
  refused(base({}, { screens: { mobile: { props: { href: "javascript:x" } } } }), "screens.mobile.props.href");
  refused(base({}, { variants: [{ id: "v", when: { exists: "user" }, props: { href: "javascript:x" } }] }), "variants[0].props.href");
  refused({ version: 1, root: { type: "Link", props: { href: "javascript:x" } } }, "$.root.props.href");
  // Case (review of !265): HTML attribute names are case-insensitive and React
  // writes an unknown `HREF` into the DOM as is.
  refused(base({ HREF: "javascript:alert(1)" }), "props.HREF");
  refused(base({ HREF: "https://fine.example" }), "props.HREF");
  refused(base({ SRCDOC: "<script>alert(1)</script>" }), "props.SRCDOC");
  refused(base({ formaction: "javascript:x" }), "props.formaction");
  refused(base({ "xlink:href": "javascript:x" }), "props.xlink:href");
  refused(base({ onclick: "alert(1)" }), "props.onclick");
  refused(base({ logoHREF: "javascript:x" }), "props.logoHREF");
  refused(base({ nested: { inner: { dangerouslySetInnerHTML: { __html: "x" } } } }), "props.nested.inner.dangerouslySetInnerHTML");
  for (const href of ["https://x.y", "/a", "#b", "mailto:a@b.c", "tel:+1"]) {
    assert.ok(root.validateSaunaSchema(base({ href })).ok, href);
  }
  assert.ok(root.validateSaunaSchema(base({ src: "data:image/png;base64,AAAA" })).ok);
  assert.ok(root.validateSaunaSchema(base({ src: "mlfile:00000000-0000-4000-8000-000000000001" })).ok);
});

// Non-string URL props (review of !265, round 3): React joins an array into
// one string past the scheme check, and `value.replace` on a number threw in
// the middle of a streamed render — a 500 for the whole published page.
const NON_STRING_URLS: Array<[string, unknown]> = [
  ["href", ["javascript:alert(1)"]],
  ["href", 1],
  ["href", {}],
  ["href", true],
  ["src", ["data:text/html,x"]],
  ["imageSrc", ["data:text/html,x"]],
];

function streamToString(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _enc, done) {
        html += String(chunk);
        done();
      },
    });
    sink.on("finish", () => resolve(html));
    const { pipe } = renderToPipeableStream(element, {
      onAllReady: () => pipe(sink),
      onShellError: reject,
    });
  });
}

test("safe urls: isSafeUrl refuses anything but a string instead of throwing", () => {
  for (const v of [["/ok"], 1, {}, true, null, undefined, Symbol("s")]) {
    assert.equal(root.isSafeUrl(v, "href"), false, String(typeof v));
  }
});

test("safe urls: a non-string URL prop is refused on write, dropped in render (static and streamed)", async () => {
  for (const [name, value] of NON_STRING_URLS) {
    const type = name === "href" ? "Link" : "Image";
    const doc = { version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type, props: { text: "Go", alt: "a", [name]: value } } } };
    const w = root.validateSaunaSchema(doc, { mode: "write" });
    assert.ok(!w.ok && w.error.issues.some((i) => i.path === `$.nodes.r.props.${name}`), `write accepted ${name}=${JSON.stringify(value)}`);
    const r = root.validateSaunaSchema(doc);
    assert.ok(r.ok && r.warnings?.some((i) => i.path === `$.nodes.r.props.${name}`), `read: ${JSON.stringify(r)}`);
    const nested = { ...doc, nodes: { r: { type: "Box", props: { items: [{ label: "k", [name]: value }] } } } };
    assert.ok(!root.validateSaunaSchema(nested, { mode: "write" }).ok, `nested ${name} accepted`);
    const el = <SaunaRenderer schema={doc as root.SaunaSchema} registry={client.PRIMITIVE_REGISTRY} />;
    for (const html of [renderToStaticMarkup(el), await streamToString(el)]) {
      assert.ok(!/javascript:|data:text|href=|src=/i.test(html), `${name}=${JSON.stringify(value)}: ${html}`);
    }
  }
  assert.deepEqual(root.stripUnsafeProps({ items: [{ href: ["javascript:x"], label: "k" }], href: null }), { items: [{ label: "k" }], href: null });
  // A direct Link with a non-string href does not throw and writes no href.
  assert.ok(!/href=/.test(renderToStaticMarkup(<client.Link href={["javascript:x"] as never} text="Go" />)));
});

test("primitives: a document's rel cannot drop noopener from a new-tab Link", () => {
  for (const rel of [{ rel: "opener" }, { REL: "opener" }, { Rel: "opener" }]) {
    const html = renderToStaticMarkup(<client.Link href="https://x.y" target="_blank" text="Go" {...(rel as object)} />);
    assert.match(html, /rel="noopener noreferrer"/, html);
    assert.ok(!/opener"/.test(html.replace('rel="noopener noreferrer"', "")), html);
  }
  assert.match(renderToStaticMarkup(<client.Link href="/a" text="Go" {...({ rel: "nofollow" } as object)} />), /rel="nofollow"/);
});

test("route handlers: PUT refuses an unsafe or non-string URL with 400, before the provider", async () => {
  let stored = 0;
  const provider = {
    get: async () => ({ schema: { version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type: "Box" } } }, version: "1" }),
    put: async () => {
      stored++;
      return { version: "2" };
    },
  } as unknown as root.SaunaProvider;
  const handlers = createSaunaRouteHandlers(provider);
  const put = (props: Record<string, unknown>) =>
    handlers.PUT(
      new Request("http://x/api/p/1", { method: "PUT", body: JSON.stringify({ version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type: "Link", props } } }) }) as never,
      { params: Promise.resolve({ id: "1" }) }
    );
  for (const props of [{ href: "javascript:alert(1)" }, { href: ["x"] }, { src: ["data:text/html,x"] }, { onClick: "x" }]) {
    const res = await put(props);
    assert.equal(res.status, 400, JSON.stringify(props));
  }
  assert.equal(stored, 0, "nothing reached the provider");
  assert.equal((await put({ href: "/ok" })).status, 200);
  assert.equal(stored, 1);
  // The 400 names every refused path, not just "Unsafe URL" (SDL-681, D2).
  const body = (await (await put({ href: "javascript:alert(1)", items: [{ src: ["x"] }] })).json()) as {
    error?: string;
    issues?: { path: string; message: string }[];
  };
  assert.equal(body.error, "Unsafe URL or raw-HTML prop");
  assert.deepEqual(
    (body.issues ?? []).map((i) => i.path).sort(),
    ["$.nodes.r.props.href", "$.nodes.r.props.items[0].src"],
    JSON.stringify(body)
  );
  assert.ok(body.issues!.every((i) => typeof i.message === "string" && i.message.length > 0), JSON.stringify(body));
});

test("primitives: a direct Link drops a URL prop in any case unless its value is safe (D3)", () => {
  for (const name of ["HREF", "Href", "hREF", "SRC", "Src", "logoHREF", "xlinkHref", "formAction"]) {
    const html = renderToStaticMarkup(<client.Link href="/ok" text="Go" {...({ [name]: "javascript:alert(1)" } as object)} />);
    assert.ok(!/javascript:/i.test(html), `${name}: ${html}`);
    assert.match(html, /href="\/ok"/, `${name}: ${html}`);
  }
  // A non-canonical href spelling never reaches the DOM — even a safe one would
  // shadow the checked `href` (the parser keeps the first).
  const shadow = renderToStaticMarkup(<client.Link href={"javascript:x"} text="Go" {...({ HREF: "/elsewhere" } as object)} />);
  assert.ok(!/href=/i.test(shadow), shadow);
  // A safe URL-like prop in any case is kept.
  assert.match(renderToStaticMarkup(<client.Link href="/ok" text="Go" {...({ SRC: "/pic.png" } as object)} />), /SRC="\/pic.png"/i);
});

// --- 6. Every registered component carries the node id (SDL-634) ---------

test("node marks: the primitives spread the rest props — the probe finds nothing", () => {
  const found = client.findUnmarkedTypes({
    registry: client.PRIMITIVE_REGISTRY,
    toMarkup: renderToStaticMarkup,
    initialProps: (type) => root.PRIMITIVE_BLOCKS.find((b) => b.type === type)?.meta?.initialProps,
  });
  assert.equal(found.length, 0, found.map((f) => `${f.type}: ${f.reason}`).join("; "));
});

test("node marks: a root that drops the rest props is named, a throwing one is reported, context is honoured", () => {
  const Spreads = ({ text, ...rest }: { text?: string }) => <section {...rest}>{text}</section>;
  const Swallows = ({ text }: { text?: string }) => <section>{text}</section>;
  const Throws = () => {
    throw new Error("boom");
  };
  const Ctx = React.createContext(false);
  const Root = ({ children, ...rest }: { children?: React.ReactNode }) => (
    <Ctx.Provider value={true}><div {...rest}>{children}</div></Ctx.Provider>
  );
  const Part = (props: Record<string, unknown>) => {
    if (!React.useContext(Ctx)) throw new Error("Part must be used within Root");
    return <span {...props} />;
  };
  const found = client.findUnmarkedTypes({
    registry: { Spreads, Swallows, Throws, Root, Part },
    toMarkup: renderToStaticMarkup,
    probes: { Part: { within: [{ type: "Root" }] } },
  });
  assert.deepEqual(found.map((f) => f.type), ["Swallows", "Throws"]);
  assert.match(found[0]!.reason, /spread the rest props/);
  assert.match(found[1]!.reason, /threw while probing: boom/);
  // Without its context the part is reported, never passed over.
  const bare = client.findUnmarkedTypes({ registry: { Part }, toMarkup: renderToStaticMarkup });
  assert.deepEqual(bare.map((f) => f.type), ["Part"]);
});

// --- 7. The nesting rule is checked when a node goes in (SDL-634) ----------

test("schema ops: addChildNode and replaceSubtreeWithNode refuse what canParent refuses — tree unchanged", () => {
  const doc = {
    version: 2 as const,
    rootId: "card",
    nodes: { card: { type: "Card", children: ["head"] }, head: { type: "CardHeader" } },
    parents: { card: null, head: "card" },
  };
  // Card takes only CardHeader.
  const canParent = ({ parentType, childType }: { parentType: string; childType: string }) =>
    parentType !== "Card" || childType === "CardHeader";

  const refused = root.addChildNode(doc, "card", { type: "Button" }, undefined, { canParent });
  assert.equal(refused.schema, doc, "addChildNode wrote a Button into a Card");
  const allowed = root.addChildNode(doc, "card", { type: "CardHeader" }, undefined, { canParent });
  assert.equal(allowed.schema.nodes.card!.children!.length, 2);

  const swapped = root.replaceSubtreeWithNode(doc, "head", { type: "Button" }, { canParent });
  assert.equal(swapped.schema, doc, "a refused replacement removed the node it was replacing");
  assert.equal(root.replaceSubtreeWithNode(doc, "head", { type: "CardHeader" }, { canParent }).schema.nodes.head, undefined);

  // No predicate — the ops stay as permissive as they were.
  assert.notEqual(root.addChildNode(doc, "card", { type: "Button" }).schema, doc);
});

// --- 8. mlfile: references to the file library (SDL-624) -----------------

type FileRefCase = {
  name: string;
  doc: root.SaunaSchema;
  expect_refs: string[];
  expect_violations: { node_id: string; pointer: string; value: string }[];
};
const loadFileRefCases = async (): Promise<FileRefCase[]> => {
  const raw = await readFile(path.join(import.meta.dirname, "fixtures/file-refs.cases.json"), "utf8");
  return (JSON.parse(raw) as { cases: FileRefCase[] }).cases;
};

const FILE_ID = "0a1b2c3d-1111-4111-8111-000000000001";
const FILE_URL = "https://api.staging.example.com/files/" + FILE_ID;

test("file refs: parseFileRef is strict — prefix plus a whole UUID, lowercase out, nothing else", () => {
  assert.equal(root.FILE_REF_PREFIX, "mlfile:");
  assert.equal(root.toFileRef(FILE_ID), "mlfile:" + FILE_ID);
  assert.equal(root.parseFileRef(root.toFileRef(FILE_ID)), FILE_ID);
  assert.equal(root.parseFileRef("mlfile:" + FILE_ID.toUpperCase()), FILE_ID);
  for (const bad of [FILE_ID, "mlfile:not-a-uuid", "mlfile:", "mlfile:" + FILE_ID + " ", " mlfile:" + FILE_ID,
    "see mlfile:" + FILE_ID, "MLFILE:" + FILE_ID, "mlfile:" + FILE_ID.slice(1),
    "mlfile:00000000-0000-0000-0000-000000000000", 42, null, undefined]) {
    assert.equal(root.parseFileRef(bad), null, `accepted ${String(bad)}`);
  }
});

test("file refs: isAllowedMediaSrc — absent, empty, mlfile and https pass; every path, data:, //host, http: and a broken ref fail", () => {
  for (const ok of [undefined, "", "mlfile:" + FILE_ID, "https://cdn.example/a.png"]) {
    assert.ok(root.isAllowedMediaSrc(ok), `refused ${String(ok)}`);
  }
  for (const bad of ["/x.png", "img/x.png", "data:image/png;base64,AAAA", "//host/x.png", "http://x.example/a.png",
    "mlfile:not-a-uuid", FILE_ID, "https:", "ftp://x/a.png", null, 42]) {
    assert.ok(!root.isAllowedMediaSrc(bad), `allowed ${String(bad)}`);
  }
  assert.deepEqual(root.MEDIA_PROP_KEYS, ["src"]);
});

test("file refs: collectFileRefs and findFilePathProps agree with the shared fixture, case by case", async () => {
  const cases = await loadFileRefCases();
  assert.ok(cases.length >= 15, "the fixture lost cases");
  for (const c of cases) {
    assert.deepEqual(root.collectFileRefs(c.doc), c.expect_refs, `refs: ${c.name}`);
    assert.deepEqual(
      root.findFilePathProps(c.doc),
      c.expect_violations.map((v) => ({ nodeId: v.node_id, pointer: v.pointer, value: v.value })),
      `violations: ${c.name}`,
    );
    // Every violation in the fixture is one isAllowedMediaSrc refuses, and
    // every pointer resolves to that exact value in the document.
    for (const v of c.expect_violations) {
      assert.ok(!root.isAllowedMediaSrc(v.value), `${c.name}: ${v.value} should be refused`);
      const at = v.pointer.split("/").slice(1).map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"))
        .reduce<unknown>((acc, t) => (acc as Record<string, unknown>)[t], c.doc);
      assert.equal(at, v.value, `${c.name}: pointer ${v.pointer} does not point at the value`);
    }
  }
  // Order of appearance, not sorted — the fixture's ids happen to be ascending
  // so the Go side can sort; this pins the engine's own contract.
  const later = "0a1b2c3d-0000-4000-8000-000000000000";
  const doc: root.SaunaSchema = {
    version: 2, rootId: "a",
    nodes: { a: { type: "Box", props: { src: "mlfile:" + FILE_ID }, children: ["b"] }, b: { type: "Box", props: { src: "mlfile:" + later } } },
    parents: { a: null, b: "a" },
  };
  assert.deepEqual(root.collectFileRefs(doc), [FILE_ID, later]);
  // A node id with a slash is escaped in the pointer per RFC 6901.
  const odd: root.SaunaSchema = { version: 2, rootId: "a/b", nodes: { "a/b": { type: "Image", props: { src: "/x.png" } } }, parents: { "a/b": null } };
  assert.deepEqual(root.findFilePathProps(odd), [{ nodeId: "a/b", pointer: "/nodes/a~1b/props/src", value: "/x.png" }]);
});

test("file refs: the primitives reference no file and carry no file path", () => {
  for (const b of root.PRIMITIVE_BLOCKS) {
    const inserted: root.SaunaSchema = {
      version: 2, rootId: "root",
      nodes: { root: { type: b.type, props: b.meta?.initialProps } },
      parents: { root: null },
    };
    assert.deepEqual(root.collectFileRefs(inserted), [], `${b.type}: references a file out of the box`);
    assert.deepEqual(root.findFilePathProps(inserted), [], `${b.type}: starts with a file path`);
    const preview = b.meta?.previewSchema;
    if (preview) {
      assert.deepEqual(root.collectFileRefs(preview), [], `${b.type}: preview references a file`);
      assert.deepEqual(root.findFilePathProps(preview), [], `${b.type}: preview carries a file path`);
    }
  }
});

const imageDoc = (src: string): root.SaunaSchema => ({
  version: 2, rootId: "img",
  nodes: { img: { type: "Image", props: { src, alt: "Pic" } } },
  parents: { img: null },
});
const fileResolver = (id: string) => (id === FILE_ID ? { url: FILE_URL } : undefined);

test("file refs: render — mlfile with a resolver becomes <img src=url>", () => {
  const html = renderToStaticMarkup(
    <SaunaRenderer schema={imageDoc("mlfile:" + FILE_ID)} registry={client.PRIMITIVE_REGISTRY} context={{ file: fileResolver }} />,
  );
  assert.match(html, new RegExp(`<img[^>]*src="${FILE_URL.replace(/[.\/]/g, "\\$&")}"[^>]*alt="Pic"`), html);
  assert.ok(!html.includes("mlfile:"), html);
  // Case-insensitive on the way in: the resolver sees a lowercase id.
  const upper = renderToStaticMarkup(
    <SaunaRenderer schema={imageDoc("mlfile:" + FILE_ID.toUpperCase())} registry={client.PRIMITIVE_REGISTRY} context={{ file: fileResolver }} />,
  );
  assert.ok(upper.includes(`src="${FILE_URL}"`), upper);
});

test("file refs: render — no resolver, or an unknown file, draws the empty frame and never <img src=\"mlfile:…\">", () => {
  const noResolver = renderToStaticMarkup(<SaunaRenderer schema={imageDoc("mlfile:" + FILE_ID)} registry={client.PRIMITIVE_REGISTRY} />);
  assert.match(noResolver, /data-pages-primitive="image-empty"/, noResolver);
  assert.ok(!noResolver.includes("mlfile:"), noResolver);
  assert.ok(!noResolver.includes("<img"), noResolver);
  const unknown = renderToStaticMarkup(
    <SaunaRenderer schema={imageDoc("mlfile:0a1b2c3d-dead-4dea-8dea-00000000dead")} registry={client.PRIMITIVE_REGISTRY} context={{ file: fileResolver }} />,
  );
  assert.match(unknown, /data-pages-primitive="image-empty"/, unknown);
  assert.ok(!unknown.includes("mlfile:"), unknown);
  // A resolver answering an empty url is "unknown" too.
  const emptyUrl = renderToStaticMarkup(
    <SaunaRenderer schema={imageDoc("mlfile:" + FILE_ID)} registry={client.PRIMITIVE_REGISTRY} context={{ file: () => ({ url: "" }) }} />,
  );
  assert.match(emptyUrl, /data-pages-primitive="image-empty"/, emptyUrl);
  assert.ok(!emptyUrl.includes("mlfile:"), emptyUrl);
});

test("file refs: render — an https src and every other prop pass through untouched", () => {
  const withResolver = renderToStaticMarkup(
    <SaunaRenderer schema={imageDoc("https://cdn.example/a.png")} registry={client.PRIMITIVE_REGISTRY} context={{ file: fileResolver }} />,
  );
  assert.match(withResolver, /<img[^>]*src="https:\/\/cdn\.example\/a\.png"/, withResolver);
  const without = renderToStaticMarkup(<SaunaRenderer schema={imageDoc("https://cdn.example/a.png")} registry={client.PRIMITIVE_REGISTRY} />);
  assert.match(without, /<img[^>]*src="https:\/\/cdn\.example\/a\.png"/, without);
  // A Text whose text merely mentions a reference is left alone — not a ref.
  const text: root.SaunaSchema = {
    version: 2, rootId: "t", nodes: { t: { type: "Text", props: { text: "see mlfile:" + FILE_ID } } }, parents: { t: null },
  };
  assert.ok(renderToStaticMarkup(<SaunaRenderer schema={text} registry={client.PRIMITIVE_REGISTRY} context={{ file: fileResolver }} />).includes("see mlfile:" + FILE_ID));
});

test("file refs: render — mlfile handed down as a block parameter resolves inside the Ref", () => {
  const picBlock: root.SaunaSchema = {
    version: 2, rootId: "i",
    nodes: { i: { type: "Image", props: { alt: "From block" } } },
    parents: { i: null },
    params: [{ name: "photo", nodeId: "i", prop: "src" }],
  };
  const page: root.SaunaSchema = {
    version: 2, rootId: "root",
    nodes: {
      root: { type: "Box", children: ["ref1"] },
      ref1: { type: "Ref", props: { blockId: "pic", params: { photo: "mlfile:" + FILE_ID } } },
    },
    parents: { root: null, ref1: "root" },
  };
  assert.deepEqual(root.collectFileRefs(page), [FILE_ID]);
  const html = renderToStaticMarkup(
    <SaunaRenderer schema={page} registry={client.PRIMITIVE_REGISTRY} blocks={{ pic: picBlock }} context={{ file: fileResolver }} />,
  );
  assert.ok(html.includes(`src="${FILE_URL}"`), html);
  assert.ok(html.includes('alt="From block"'), html);
  assert.ok(!html.includes("mlfile:"), html);
  // The same page without a resolver: the block's Image draws its frame.
  const bare = renderToStaticMarkup(<SaunaRenderer schema={page} registry={client.PRIMITIVE_REGISTRY} blocks={{ pic: picBlock }} />);
  assert.match(bare, /data-pages-primitive="image-empty"/, bare);
  assert.ok(!bare.includes("mlfile:"), bare);
});

// --- 9. DataView Element with versioned data-source props (SDL-639) ------

const DV_WS = "44444444-4444-4444-8444-444444444444";
const DV_COLLECTION = "55555555-5555-4555-8555-555555555555";

/** The Messages feed: unread/all tabs, newest first, the read flag. */
const messagesFeed = () => ({
  source: { kind: "collection", workspace_id: DV_WS, collection_id: DV_COLLECTION },
  fields: ["title", "created_at", "read"],
  sort: { field: "created_at", direction: "desc" },
  filter: [],
  presets: [
    { id: "unread", label: "Unread", filter: [{ field: "read", op: "eq", value: false }] },
    { id: "all", label: "All", filter: [] },
  ],
  limit: 20,
});

const issuesOf = (r: root.ElementPropsResult) => (r.ok ? [] : r.issues.map((i) => i.path));

test("DataView: offered as a widget Element at props schema v1, with a registry pair", () => {
  assert.deepEqual(root.WIDGET_BLOCKS.map((b) => b.type), ["DataView"]);
  assert.equal(root.DataViewBlock.propsVersion, 1);
  assert.equal(root.blockPropsVersion(root.DataViewBlock), 1);
  assert.equal(root.DATA_VIEW_PROPS_VERSION, 1);
  assert.deepEqual(client.findUnrenderableTypes(root.WIDGET_BLOCKS, client.WIDGET_REGISTRY), []);
  // The primitives never declared a version: they are at 1 by the default rule.
  for (const b of root.PRIMITIVE_BLOCKS) assert.equal(root.blockPropsVersion(b), 1, b.type);
  // It pairs at the type level like every other Element.
  client.defineElementSet({ registry: client.WIDGET_REGISTRY, blocks: root.WIDGET_BLOCKS });
  // Its defaults are self-contained and reference no file.
  assert.deepEqual(root.findRouteBoundDefaults(root.WIDGET_BLOCKS), []);
  // The operators are exactly the ones collections-service serves.
  assert.deepEqual([...root.DATA_VIEW_FILTER_OPS], ["eq", "ne", "gt", "gte", "lt", "lte", "in", "like", "null"]);
});

test("DataView: the Messages feed shape parses through the definition, at v1 with or without the field", () => {
  const withField = root.parseElementProps(root.DataViewBlock, { props: messagesFeed(), propsVersion: 1 });
  const without = root.parseElementProps(root.DataViewBlock, { props: messagesFeed() });
  assert.ok(withField.ok, JSON.stringify(withField));
  assert.ok(without.ok, JSON.stringify(without));
  assert.equal(without.version, 1);
  assert.deepEqual(without.props, withField.props);
  assert.equal(without.props.presets[0]?.label, "Unread");
  assert.equal(without.props.source.collection_id, DV_COLLECTION);
});

test("DataView: an unknown data source is REJECTED — kind, missing collection_id, project_id, foreign keys", () => {
  const reject = (mutate: (p: ReturnType<typeof messagesFeed>) => unknown, path: string, why: string) => {
    const props = mutate(messagesFeed()) as Record<string, unknown>;
    const r = root.parseElementProps(root.DataViewBlock, { props });
    assert.equal(r.ok, false, `${why}: accepted ${JSON.stringify(props)}`);
    assert.ok(issuesOf(r).some((p) => p.startsWith(path)), `${why}: expected an issue under ${path}, got ${JSON.stringify(issuesOf(r))}`);
  };
  // Source kinds other than a collection do not exist in v1.
  reject((p) => ({ ...p, source: { ...p.source, kind: "records" } }), "$.props.source.kind", "kind records");
  reject((p) => ({ ...p, source: { ...p.source, kind: "api" } }), "$.props.source.kind", "kind api");
  // Missing or malformed ids.
  reject((p) => { const { collection_id: _drop, ...source } = p.source; return { ...p, source }; }, "$.props.source.collection_id", "no collection_id");
  reject((p) => { const { workspace_id: _drop, ...source } = p.source; return { ...p, source }; }, "$.props.source.workspace_id", "no workspace_id");
  reject((p) => ({ ...p, source: { ...p.source, collection_id: "messages" } }), "$.props.source.collection_id", "collection_id not a uuid");
  reject((p) => { const { source: _drop, ...rest } = p; return rest; }, "$.props.source", "no source at all");
  // SDL-617 removed projects: a project_id is refused, never silently dropped.
  reject((p) => ({ ...p, source: { ...p.source, project_id: DV_WS } }), "$.props.source", "project_id in source");
  reject((p) => ({ ...p, project_id: DV_WS }), "$.props", "project_id at the top");
  // The page-level binding and the $bind marker do not live here either.
  reject((p) => ({ ...p, collection_binding: { collection_id: DV_COLLECTION } }), "$.props", "collection_binding on the element");
  reject((p) => ({ ...p, fields: [{ $bind: "record.title" }] }), "$.props.fields", "$bind marker as a field");
});

test("DataView: sort, filter, presets and limit are held to what GET /records can serve", () => {
  const reject = (mutate: (p: ReturnType<typeof messagesFeed>) => unknown, path: string, why: string) => {
    const r = root.parseElementProps(root.DataViewBlock, { props: mutate(messagesFeed()) as Record<string, unknown> });
    assert.equal(r.ok, false, `${why}: accepted`);
    assert.ok(issuesOf(r).some((p) => p.startsWith(path)), `${why}: expected ${path}, got ${JSON.stringify(issuesOf(r))}`);
  };
  reject((p) => ({ ...p, sort: { field: "created_at", direction: "sideways" } }), "$.props.sort.direction", "sort direction");
  reject((p) => ({ ...p, sort: { field: "Created-At", direction: "asc" } }), "$.props.sort.field", "sort field not a field key");
  reject((p) => ({ ...p, filter: [{ field: "read", op: "contains", value: "x" }] }), "$.props.filter[0].op", "operator the service lacks");
  reject((p) => ({ ...p, filter: [{ field: "read", op: "null", value: "yes" }] }), "$.props.filter[0].value", "null takes a boolean");
  reject((p) => ({ ...p, filter: [{ field: "read", op: "eq", value: { nested: true } }] }), "$.props.filter[0].value", "value must be a primitive");
  reject((p) => ({ ...p, filter: [{ field: "read", op: "eq", value: true }, { field: "read", op: "eq", value: false }] }), "$.props.filter[1]", "same field+op twice in the base filter");
  reject((p) => ({ ...p, filter: [{ field: "read", op: "eq", value: true }] }), "$.props.presets[0].filter[0]", "preset repeats a base clause's field+op");
  reject((p) => ({ ...p, presets: [...p.presets, { id: "all", label: "Again", filter: [] }] }), "$.props.presets[2].id", "duplicate preset id");
  reject((p) => ({ ...p, presets: [{ id: "", label: "Unread", filter: [] }] }), "$.props.presets[0].id", "empty preset id");
  reject((p) => ({ ...p, limit: 0 }), "$.props.limit", "limit below 1");
  reject((p) => ({ ...p, limit: 101 }), "$.props.limit", "limit above 100");
  reject((p) => ({ ...p, limit: 2.5 }), "$.props.limit", "limit not an integer");
  // Every operator the service serves is accepted with its wire form.
  const all = { ...messagesFeed(), presets: [], filter: [
    { field: "read", op: "eq", value: false }, { field: "read", op: "ne", value: true },
    { field: "created_at", op: "gt", value: "2026-01-01" }, { field: "created_at", op: "gte", value: "2026-01-01" },
    { field: "created_at", op: "lt", value: "2027-01-01" }, { field: "created_at", op: "lte", value: "2027-01-01" },
    { field: "kind", op: "in", value: "note,alert" }, { field: "title", op: "like", value: "hello" },
    { field: "read_at", op: "null", value: true },
  ] };
  assert.ok(root.parseElementProps(root.DataViewBlock, { props: all }).ok);
});

test("DataView: dataViewQuery yields exactly the GET /records query — filter[field][op], sort_by, sort_order, limit", () => {
  const parsed = root.parseElementProps(root.DataViewBlock, { props: messagesFeed() });
  assert.ok(parsed.ok);
  assert.deepEqual(root.dataViewQuery(parsed.props, "unread"), {
    collection_id: DV_COLLECTION,
    sort_by: "created_at",
    sort_order: "desc",
    limit: "20",
    "filter[read][eq]": "false",
  });
  assert.deepEqual(root.dataViewQuery(parsed.props, "all"), {
    collection_id: DV_COLLECTION, sort_by: "created_at", sort_order: "desc", limit: "20",
  });
  assert.deepEqual(root.dataViewQuery(parsed.props), root.dataViewQuery(parsed.props, "all"));
  // The scope is not a records-list param.
  assert.ok(!("workspace_id" in root.dataViewQuery(parsed.props)));
  // Base and preset filters both go, in the service's value forms.
  const combined = root.parseElementProps(root.DataViewBlock, {
    props: { ...messagesFeed(), filter: [{ field: "kind", op: "in", value: "note,alert" }, { field: "read_at", op: "null", value: true }] },
  });
  assert.ok(combined.ok);
  const q = root.dataViewQuery(combined.props, "unread");
  assert.equal(q["filter[kind][in]"], "note,alert");
  assert.equal(q["filter[read_at][null]"], "true");
  assert.equal(q["filter[read][eq]"], "false");
  // A tab that does not exist is an error, not an unfiltered list.
  assert.throws(() => root.dataViewQuery(parsed.props, "starred"), /no preset "starred"/);
});

test("DataView: a fresh node is UNBOUND — reported at $.props.source, not accepted and not thrown", () => {
  assert.equal("source" in (root.DataViewBlock.meta?.initialProps ?? { source: 1 }), false, "a new node must not carry a placeholder source");
  const r = root.parseElementProps(root.DataViewBlock, { props: root.DataViewBlock.meta?.initialProps });
  assert.equal(r.ok, false);
  assert.deepEqual(issuesOf(r), ["$.props.source"]);
  // Everything else a new node starts with is inside the contract.
  const bound = root.parseElementProps(root.DataViewBlock, {
    props: { ...root.DataViewBlock.meta?.initialProps, source: messagesFeed().source },
  });
  assert.ok(bound.ok, JSON.stringify(bound));
});

test("props version: a node without the field reads as v1; a foreign version is refused by number, before the shape", () => {
  assert.equal(root.SAUNA_DEFAULT_PROPS_VERSION, 1);
  assert.equal(root.saunaNodePropsVersion({}), 1);
  assert.equal(root.saunaNodePropsVersion({ propsVersion: 1 }), 1);
  assert.equal(root.saunaNodePropsVersion({ propsVersion: 3 }), 3);
  // A document written before the field existed validates as it did (no migration).
  const legacy: root.SaunaSchema = {
    version: 2, rootId: "r",
    nodes: { r: { type: "Box", children: ["d"] }, d: { type: "DataView", props: messagesFeed() } },
    parents: { r: null, d: "r" },
  };
  assert.ok(root.validateSaunaSchema(legacy).ok);
  assert.equal(root.migrateSaunaSchema(legacy), legacy, "a v2 document is not rewritten");
  assert.equal(root.saunaNodePropsVersion(legacy.nodes.d!), 1);
  assert.ok(root.parseElementProps(root.DataViewBlock, legacy.nodes.d!).ok);
  // v2 props of a definition at v1: refused by version, whatever the shape.
  const future = root.parseElementProps(root.DataViewBlock, { props: messagesFeed(), propsVersion: 2 });
  assert.equal(future.ok, false);
  assert.equal(future.version, 2);
  assert.deepEqual(issuesOf(future), ["$.propsVersion"]);
  assert.match(future.ok ? "" : future.issues[0]!.message, /v2.*knows v1.*no migration/);
  // A definition without staticProps still refuses a foreign version and accepts its own.
  const untyped = root.defineBlock({ type: "Kit" });
  assert.equal(root.parseElementProps(untyped, { props: { anything: 1 }, propsVersion: 2 }).ok, false);
  const own = root.parseElementProps(untyped, { props: { anything: 1 } });
  assert.ok(own.ok);
  assert.deepEqual(own.props, { anything: 1 });
});

// --- SDL-670: declarative props migrations ----------------------------------

type MigrationCase = {
  name: string;
  definition: { type: string; propsVersion: number; migrations: root.ElementMigration[] };
  node: root.SaunaNodeConfig;
  expect?: unknown;
  expect_error?: string;
};

const loadMigrationCases = async (): Promise<MigrationCase[]> =>
  (JSON.parse(await readFile(path.join(import.meta.dirname, "fixtures/element-migrations.cases.json"), "utf8")) as { cases: MigrationCase[] }).cases;

// The fixture's test-only custom step; pages-service registers its Go twin in its own test (SDL-671).
const joinName: root.ElementMigrationImpl = (node) => {
  const props = { ...(node.props ?? {}) };
  props.name = `${String(props.first)} ${String(props.last)}`;
  delete props.first;
  delete props.last;
  return { ...node, props };
};
root.registerElementMigration("fixture.join-name", joinName);

test("element migrations: the shared fixture replays through migrateElementProps", async () => {
  const cases = await loadMigrationCases();
  assert.ok(cases.length > 0);
  for (const c of cases) {
    const before = JSON.stringify(c.node);
    let out: unknown;
    let code: string | undefined;
    try {
      out = root.migrateElementProps(c.definition, c.node);
    } catch (e) {
      if (!root.isElementMigrationError(e)) throw e;
      code = e.code;
    }
    assert.equal(JSON.stringify(c.node), before, `${c.name}: the input node was modified`);
    if (c.expect_error !== undefined) {
      assert.equal(code, c.expect_error, `${c.name}: expected error ${c.expect_error}, got ${code ?? JSON.stringify(out)}`);
    } else {
      assert.equal(code, undefined, `${c.name}: unexpected error ${code}`);
      assert.deepEqual(out, c.expect, c.name);
    }
  }
});

test("element migrations: the fixture covers every step kind and a chain", async () => {
  const cases = await loadMigrationCases();
  const ops = new Set(cases.flatMap((c) => c.definition.migrations.flatMap((m) => (m.steps ?? []).map((s) => s.op as string))));
  for (const op of ["rename", "move", "remove", "setDefault", "mapValue", "custom"]) assert.ok(ops.has(op), `no fixture case for ${op}`);
  assert.ok(cases.some((c) => c.definition.propsVersion >= 3 && c.expect !== undefined), "no chain case");
  assert.ok(cases.every((c) => c.definition.type === "MigrationProbe"), "fixture definitions are test Elements only");
});

test("element migrations: same version is the node itself; the result is a copy", () => {
  const def = root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [root.migrationStep.rename("a", "b")] }] });
  const v2 = { type: "Probe", propsVersion: 2, props: { a: 1 } };
  assert.equal(root.migrateElementProps(def, v2), v2);
  const v1 = { type: "Probe", props: { a: 1 } };
  const out = root.migrateElementProps(def, v1);
  assert.notEqual(out, v1);
  assert.deepEqual(out, { type: "Probe", propsVersion: 2, props: { b: 1 } });
  assert.deepEqual(v1, { type: "Probe", props: { a: 1 } });
});

test("element migrations: defineBlock requires exactly propsVersion-1 migrations", () => {
  const codeOf = (fn: () => unknown) => {
    try { fn(); return "ok"; } catch (e) { return root.isElementMigrationError(e) ? e.code : `foreign: ${String(e)}`; }
  };
  assert.equal(codeOf(() => root.defineBlock({ type: "Probe", propsVersion: 2 })), "migration_count", "propsVersion 2 without a migration was accepted");
  assert.equal(codeOf(() => root.defineBlock({ type: "Probe", propsVersion: 3, migrations: [{ steps: [] }] })), "migration_count");
  assert.equal(codeOf(() => root.defineBlock({ type: "Probe", migrations: [{ steps: [] }] })), "migration_count", "a v1 Element with a migration");
  assert.equal(codeOf(() => root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [] }] })), "ok");
  assert.equal(codeOf(() => root.defineBlock({ type: "Probe" })), "ok");
  assert.equal(
    codeOf(() => root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [{ op: "rename", from: "a..b", to: "c" }] }] })),
    "invalid_step"
  );
  // An unregistered custom id is allowed at definition time (registration may come later) …
  assert.equal(codeOf(() => root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [root.migrationStep.custom("nobody")] }] })), "ok");
  // … and refused by the catalog-side check, which requires the implementation.
  assert.equal(
    codeOf(() => root.checkElementMigrations({ type: "Probe", propsVersion: 2, migrations: [{ steps: [root.migrationStep.custom("nobody")] }] }, { requireCustom: true })),
    "unknown_custom"
  );
  assert.equal(
    codeOf(() => root.checkElementMigrations({ type: "Probe", propsVersion: 2, migrations: [{ steps: [root.migrationStep.custom("fixture.join-name")] }] }, { requireCustom: true })),
    "ok"
  );
});

test("element migrations: step values must be JSON, re-registration replaces, a custom result is copied", () => {
  const codeOf = (fn: () => unknown) => {
    try { fn(); return "ok"; } catch (e) { return root.isElementMigrationError(e) ? e.code : `foreign: ${String(e)}`; }
  };
  const withStep = (step: unknown) => () =>
    root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [step as root.ElementMigrationStep] }] });
  assert.equal(codeOf(withStep({ op: "setDefault", key: "a", value: Number.NaN })), "invalid_step");
  assert.equal(codeOf(withStep({ op: "setDefault", key: "a", value: undefined })), "invalid_step");
  assert.equal(codeOf(withStep({ op: "setDefault", key: "a", value: new Date(0) })), "invalid_step");
  assert.equal(codeOf(withStep({ op: "setDefault", key: "a", value: { f: () => 1 } })), "invalid_step");
  assert.equal(codeOf(withStep({ op: "mapValue", key: "a", map: { x: Number.POSITIVE_INFINITY } })), "invalid_step");
  assert.equal(codeOf(withStep({ op: "setDefault", key: "a", value: { nested: [1, "two", null, true] } })), "ok");
  // Re-registering an id (hot reload, a module evaluated twice) replaces it — last one wins.
  root.registerElementMigration("test.reload", (n) => ({ ...n, props: { v: 1 } }));
  assert.equal(codeOf(() => root.registerElementMigration("test.reload", (n) => ({ ...n, props: { v: 2 } }))), "ok");
  const def = root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [root.migrationStep.custom("test.reload")] }] });
  assert.deepEqual(root.migrateElementProps(def, { type: "Probe", props: {} }).props, { v: 2 });
  // The custom result is a copy: an implementation that keeps a reference cannot change it afterwards.
  const held = { kept: { n: 1 } };
  root.registerElementMigration("test.holds", (n) => ({ ...n, props: held }));
  const holds = root.defineBlock({ type: "Probe", propsVersion: 2, migrations: [{ steps: [root.migrationStep.custom("test.holds")] }] });
  const out = root.migrateElementProps(holds, { type: "Probe", props: {} });
  held.kept.n = 99;
  assert.deepEqual(out.props, { kept: { n: 1 } });
});

test("element migrations: parseElementProps checks staticProps AFTER migrating", () => {
  const staticProps = z.strictObject({ heading: z.string(), size: z.enum(["sm", "md"]) });
  const good = root.defineBlock({
    type: "Probe",
    propsVersion: 2,
    staticProps,
    migrations: [{ steps: [root.migrationStep.rename("title", "heading"), root.migrationStep.setDefault("size", "md")] }],
  });
  const ok = root.parseElementProps(good, { props: { title: "Hi" } });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(ok.version, 2);
  assert.deepEqual(ok.props, { heading: "Hi", size: "md" });
  // A step that produces props outside staticProps is reported, not passed.
  const bad = root.defineBlock({
    type: "Probe",
    propsVersion: 2,
    staticProps,
    migrations: [{ steps: [root.migrationStep.rename("title", "headline"), root.migrationStep.setDefault("size", "xl")] }],
  });
  const r = root.parseElementProps(bad, { props: { title: "Hi" } });
  assert.equal(r.ok, false, "a migration producing props outside staticProps passed");
  assert.equal(r.version, 2);
  assert.ok(issuesOf(r).includes("$.props.size"), JSON.stringify(r));
  // A migration that cannot run is refused by number, with its code.
  const custom = root.defineBlock({ type: "Probe", propsVersion: 2, staticProps, migrations: [{ steps: [root.migrationStep.custom("nobody")] }] });
  const c = root.parseElementProps(custom, { props: { heading: "Hi", size: "sm" } });
  assert.equal(c.ok, false);
  assert.deepEqual(issuesOf(c), ["$.propsVersion"]);
  assert.match(c.ok ? "" : c.issues[0]!.message, /unknown_custom/);
});

test("element migrations: live definitions are still at propsVersion 1 with no migrations", () => {
  for (const def of [root.DataViewBlock, ...Object.values(root).filter((v): v is root.BlockDefinition => !!v && typeof v === "object" && "type" in v && ("staticProps" in v || "meta" in v))]) {
    assert.equal(root.blockPropsVersion(def), 1, `${def.type} was bumped`);
    assert.equal((def.migrations ?? []).length, 0, `${def.type} carries migrations`);
  }
});

test("props version: the document refuses a propsVersion that is not an integer >= 1, by path", () => {
  const doc = (propsVersion: unknown) => ({
    version: 2, rootId: "d", nodes: { d: { type: "DataView", propsVersion, props: messagesFeed() } }, parents: { d: null },
  });
  for (const bad of ["1", 0, -1, 1.5, null, {}, []]) {
    const r = root.validateSaunaSchema(doc(bad));
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must not validate`);
    assert.ok(JSON.stringify(r.ok ? {} : r.error).includes("$.nodes.d.propsVersion"), JSON.stringify(r));
  }
  for (const ok of [undefined, 1, 2, 7]) assert.ok(root.validateSaunaSchema(doc(ok)).ok, String(ok));
});

// SDL-725: pages-service migrates the props of a v1 tree in place and stamps
// `propsVersion` on its nodes (pages-service/internal/document/migrate.go).
// The v1 → v2 translation on load must carry that stamp, at every depth;
// otherwise the node reads as v1 again, draws a plate, and the next save
// writes v2 without the field, so the next run migrates its props twice.
test("props version (SDL-725): v1 → v2 migration carries propsVersion of every node, nested too", () => {
  const v1: root.SaunaSchemaV1 = {
    version: 1,
    root: {
      type: "Section",
      propsVersion: 3,
      props: { title: "root" },
      children: [
        { type: "Text", props: { children: "no version" } },
        {
          type: "Box",
          propsVersion: 2,
          children: [{ type: "DataView", propsVersion: 4, props: messagesFeed() }],
        },
      ],
    },
  };
  const before = JSON.stringify(v1);
  const v2 = root.migrateSaunaSchema(v1);
  assert.equal(v2.version, 2);
  const byType = Object.fromEntries(Object.values(v2.nodes).map((n) => [n.type, n]));
  assert.equal(byType.Section?.propsVersion, 3, "root node lost its propsVersion");
  assert.equal(byType.Box?.propsVersion, 2, "nested node lost its propsVersion");
  assert.equal(byType.DataView?.propsVersion, 4, "deeply nested node lost its propsVersion");
  assert.equal(root.saunaNodePropsVersion(byType.DataView!), 4);
  // Absent stays absent: nothing invents `propsVersion: 1` (or `undefined` as a key).
  assert.ok(byType.Text && !("propsVersion" in byType.Text), JSON.stringify(byType.Text));
  assert.equal(root.saunaNodePropsVersion(byType.Text!), 1);
  // The rest of the translation is unchanged.
  assert.deepEqual(byType.Section?.props, { title: "root" });
  assert.equal(v2.nodes[v2.rootId]?.type, "Section");
  assert.ok(root.validateSaunaSchema(v2).ok, "the migrated document does not validate");
  assert.equal(JSON.stringify(v1), before, "the v1 input was mutated");
});

test("props version (SDL-725): a v1 document refuses a propsVersion that is not an integer >= 1, by path", () => {
  const doc = (propsVersion: unknown) => ({
    version: 1, root: { type: "Section", children: [{ type: "Text", propsVersion, props: { children: "x" } }] },
  });
  for (const bad of ["1", 0, -1, 1.5, null, {}, []]) {
    const r = root.validateSaunaSchema(doc(bad));
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must not validate`);
    assert.ok(JSON.stringify(r.ok ? {} : r.error).includes("$.root.children[0].propsVersion"), JSON.stringify(r));
  }
  for (const ok of [undefined, 1, 2, 7]) assert.ok(root.validateSaunaSchema(doc(ok)).ok, String(ok));
});

// --- SDL-667: the node carries its Element's version from insertion on ------

const versionDoc = (): root.SaunaSchema => ({
  version: 2, rootId: "r",
  nodes: { r: { type: "Section", children: ["a"] }, a: { type: "Text", props: { children: "a" } } },
  parents: { r: null, a: "r" },
});

test("props version (SDL-667): insertion writes the Element's version only when it is not 1", () => {
  const doc = versionDoc();
  const v2 = root.addChildNode(doc, "r", { type: "Card", props: {}, propsVersion: 2 });
  assert.equal(v2.schema.nodes[v2.nodeId]!.propsVersion, 2, "an Element at v2 inserted a node without its version");
  // "absent = 1" stays the rule: a v1 Element writes nothing, old documents and fresh ones look alike.
  const v1 = root.addChildNode(doc, "r", { type: "Card", props: {}, propsVersion: 1 });
  assert.ok(!("propsVersion" in v1.schema.nodes[v1.nodeId]!), JSON.stringify(v1.schema.nodes[v1.nodeId]));
  const bare = root.addChildNode(doc, "r", { type: "Card", props: {} });
  assert.ok(!("propsVersion" in bare.schema.nodes[bare.nodeId]!), JSON.stringify(bare.schema.nodes[bare.nodeId]));
  assert.deepEqual(root.createInitialNodeConfig("Card", 3), { type: "Card", propsVersion: 3 });
  assert.deepEqual(root.createInitialNodeConfig("Card", 1), { type: "Card" });

  const replaced = root.replaceSubtreeWithNode(doc, "a", { type: "Card", props: {}, propsVersion: 2 });
  assert.equal(replaced.schema.nodes[replaced.nodeId]!.propsVersion, 2, "replace dropped the version");

  // A copy is the SAME props at the same contract: it keeps the source's
  // version, whatever the definition is at now — stamping the definition's
  // would claim v2 for props written against v1.
  const stamped = v2.schema;
  const dup = root.duplicateSubtree(stamped, v2.nodeId);
  assert.equal(dup.schema.nodes[dup.nodeId]!.propsVersion, 2);
  const legacyDup = root.duplicateSubtree(doc, "a");
  assert.ok(!("propsVersion" in legacyDup.schema.nodes[legacyDup.nodeId]!));
});

test("props version (SDL-667): a compound item's content child is stamped with its Element's version", () => {
  const tabs: root.SaunaSchema = {
    version: 2, rootId: "n",
    nodes: { n: { type: "TabsView", props: { items: [{ label: "A", text: "" }], orientation: "horizontal" } } },
    parents: { n: null },
  };
  const of = root.propsVersionsFromBlocks([{ type: "Box", propsVersion: 2 }, { type: "Text" }]);
  assert.equal(of("Box"), 2);
  assert.equal(of("Text"), 1);
  assert.equal(of("Nope"), undefined, "an unknown type has no version to write");
  const added = root.addCompoundItem(tabs, "n", { label: "B", text: "" }, { propsVersionOf: of });
  const fresh = added.nodes.n!.children!.map((id) => added.nodes[id]!);
  assert.equal(fresh.length, 2);
  for (const child of fresh) assert.equal(child.propsVersion, 2, JSON.stringify(child));
  const plain = root.addCompoundItem(tabs, "n", { label: "B", text: "" });
  for (const id of plain.nodes.n!.children!) assert.ok(!("propsVersion" in plain.nodes[id]!));
});

test("props version (SDL-667): the renderer draws a plate for a node its Element definition cannot read", () => {
  const Card = (p: Record<string, unknown>) => <section {...p} />;
  const Text = (p: { children?: React.ReactNode }) => <p>{p.children}</p>;
  const registry = { Section: (p: Record<string, unknown>) => <main {...p} />, Card, Text };
  const doc = (propsVersion?: number): root.SaunaSchema => ({
    version: 2, rootId: "r",
    nodes: {
      r: { type: "Section", children: ["c"] },
      c: { type: "Card", ...(propsVersion === undefined ? {} : { propsVersion }), props: { title: "kept" }, children: ["t1", "t2"] },
      t1: { type: "Text", props: { children: "one" } },
      t2: { type: "Text", props: { children: "two" } },
    },
    parents: { r: null, c: "r", t1: "c", t2: "c" },
  });
  const v1Elements = [{ type: "Section" }, { type: "Card", propsVersion: 1 }, { type: "Text" }];
  // A v2 node drawn by an engine whose Card is at v1: a plate, not the props misread.
  const html = renderToStaticMarkup(<SaunaRenderer editable schema={doc(2)} registry={registry} elements={v1Elements} />);
  assert.match(html, /data-sauna-unknown-props-version="Card@v2"/, html);
  assert.match(html, /data-sauna-unknown-props-version="Card@v2"[^>]*data-sauna-unknown-children="2"|data-sauna-unknown-children="2"[^>]*data-sauna-unknown-props-version="Card@v2"/, html);
  assert.match(html, /<div[^>]*data-sauna-node-id="c"/, "the plate must stay selectable on the canvas");
  assert.ok(!html.includes("<p>one</p>") && !html.includes("<section"), html);
  // A node without the field is v1 — a v2 definition cannot read it either.
  const old = renderToStaticMarkup(<SaunaRenderer schema={doc()} registry={registry} elements={[{ type: "Card", propsVersion: 2 }]} />);
  assert.match(old, /data-sauna-unknown-props-version="Card@v1"/, old);
  assert.ok(!old.includes("data-sauna-node-id"), "a visitor's page carries no editor ids");
  // Matching versions, an absent field at v1, and a host that passes no elements: drawn as before.
  for (const [schema, elements] of [[doc(2), [{ type: "Card", propsVersion: 2 }]], [doc(), v1Elements], [doc(2), undefined]] as const) {
    const ok = renderToStaticMarkup(<SaunaRenderer schema={schema} registry={registry} elements={elements} />);
    assert.ok(ok.includes("<section") && ok.includes("<p>one</p>") && !ok.includes("data-sauna-unknown-props-version"), ok);
  }
  // One rule: the renderer and parseElementProps disagree on nothing.
  assert.deepEqual(root.elementPropsVersionMismatch({}, { propsVersion: 2 }), { nodeVersion: 2, knownVersion: 1 });
  assert.equal(root.elementPropsVersionMismatch({ propsVersion: 2 }, { propsVersion: 2 }), null);
});

test("DataView: renders its frame with the preset tabs, is selectable on the canvas, draws unbound without throwing", () => {
  const bound: root.SaunaSchema = {
    version: 2, rootId: "d", nodes: { d: { type: "DataView", propsVersion: 1, props: messagesFeed() } }, parents: { d: null },
  };
  const html = renderToStaticMarkup(<SaunaRenderer editable schema={bound} registry={client.WIDGET_REGISTRY} />);
  assert.match(html, /data-sauna-node-id="d"/, html);
  assert.match(html, /data-pages-data-view="bound"/, html);
  assert.match(html, /role="tab"[^>]*data-pages-data-view-tab="unread"[^>]*>Unread</, html);
  assert.match(html, /data-pages-data-view-tab="all"[^>]*>All</, html);
  assert.ok(!html.includes(DV_COLLECTION) && !html.includes(DV_WS), "ids do not reach the markup");
  const visitor = renderToStaticMarkup(<SaunaRenderer schema={bound} registry={client.WIDGET_REGISTRY} />);
  assert.ok(visitor.length > 0 && !visitor.includes("data-sauna-node-id"), visitor);
  // Fresh from the catalog: unbound, still a frame the author can click.
  const fresh: root.SaunaSchema = {
    version: 2, rootId: "d", nodes: { d: { type: "DataView", props: root.DataViewBlock.meta?.initialProps } }, parents: { d: null },
  };
  const unbound = renderToStaticMarkup(<SaunaRenderer editable schema={fresh} registry={client.WIDGET_REGISTRY} />);
  assert.match(unbound, /data-pages-data-view="unbound"/, unbound);
  assert.match(unbound, /data-sauna-node-id="d"/, unbound);
  assert.ok(!unbound.includes('role="tab"'), unbound);
  // Garbage props do not throw either.
  assert.doesNotThrow(() => renderToStaticMarkup(<client.DataView source="nope" presets={42} />));
  assert.deepEqual(
    client.findUnmarkedTypes({ registry: client.WIDGET_REGISTRY, toMarkup: renderToStaticMarkup, initialProps: () => root.DataViewBlock.meta?.initialProps }),
    []
  );
});

// --- SDL-633: compound Elements, the part guard, the block reference -------

// A parts registry that behaves like Radix: a part outside its root THROWS.
const TabsCtx = React.createContext(false);
const needs = (name: string, root: string) =>
  function Part(p: { children?: React.ReactNode }) {
    if (!React.useContext(TabsCtx)) throw new Error(`${name} must be used within ${root}`);
    return <span data-part={name}>{p.children}</span>;
  };
const FAKE_PARTS: client.SaunaRegistry = {
  Tabs: (p: { children?: React.ReactNode }) => <TabsCtx.Provider value><div data-part="Tabs" {...p} /></TabsCtx.Provider>,
  TabsList: needs("TabsList", "Tabs"),
  TabsTrigger: needs("TabsTrigger", "Tabs"),
  TabsContent: needs("TabsContent", "Tabs"),
  ...Object.fromEntries(
    ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter", "Table", "TableCaption", "TableHeader", "TableBody", "TableRow", "TableHead", "TableCell"].map(
      (t) => [t, (p: { children?: React.ReactNode }) => <div data-part={t} {...p} />]
    )
  ),
  // Records which props reached the root, so a leaked `collapsible` is visible.
  Accordion: ({ children, ...p }: { children?: React.ReactNode }) => (
    <div data-part="Accordion" data-props={Object.keys(p).filter((k) => !k.startsWith("data-")).sort().join(",")}>
      {children}
    </div>
  ),
  ...Object.fromEntries(
    ["AccordionItem", "AccordionTrigger", "AccordionContent"].map((t) => [t, (p: { children?: React.ReactNode }) => <div data-part={t} {...p} />])
  ),
  Box: (p: { children?: React.ReactNode }) => <div data-part="Box" {...p} />,
};
const COMPOUND_REGISTRY = { ...FAKE_PARTS, ...client.createCompoundRegistry(root.COMPOUND_ELEMENTS, FAKE_PARTS) };
const one = (type: string, props: unknown, children?: Record<string, root.SaunaNodeConfig>): root.SaunaSchema => ({
  version: 2,
  rootId: "n",
  nodes: { n: { type, props: props as Record<string, unknown>, ...(children ? { children: Object.keys(children) } : {}) }, ...(children ?? {}) },
  parents: { n: null, ...Object.fromEntries(Object.keys(children ?? {}).map((k) => [k, "n"])) },
});

test("compounds: each Element's initial props parse, expand emits only its root, parts and slots", () => {
  assert.deepEqual(root.COMPOUND_ELEMENTS.map((e) => e.block.type), ["TabsView", "CardView", "TableView", "AccordionView"]);
  for (const e of root.COMPOUND_ELEMENTS) {
    const parsed = e.schema.safeParse(e.block.meta?.initialProps);
    assert.ok(parsed.success, `${e.block.type}: ${parsed.success ? "" : parsed.error.message}`);
    const t = e.expand(parsed.data as never);
    assert.equal(t.nodes[t.rootId]?.type, e.root, e.block.type);
    const allowed = new Set([e.root, ...e.parts, root.SAUNA_COMPOUND_SLOT, root.SAUNA_COMPOUND_TEXT]);
    for (const n of Object.values(t.nodes)) assert.ok(allowed.has(n.type), `${e.block.type} emitted ${n.type}`);
    assert.equal(root.validateSaunaSchema(t).ok ?? true, true);
  }
  const tabs = root.TabsViewElement.expand({ items: [{ label: "A", text: "a" }, { label: "B", text: "b" }], orientation: "horizontal" });
  const count = (t: string) => Object.values(tabs.nodes).filter((n) => n.type === t).length;
  assert.deepEqual([count("TabsList"), count("TabsTrigger"), count("TabsContent")], [1, 2, 2]);
  // TabsTrigger sits under TabsList, never directly under Tabs.
  for (const [id, n] of Object.entries(tabs.nodes)) if (n.type === "TabsTrigger") assert.equal(tabs.nodes[tabs.parents[id]!]?.type, "TabsList");
  assert.deepEqual(root.findMissingCompoundParts(root.COMPOUND_ELEMENTS, FAKE_PARTS), []);
  assert.deepEqual(root.findMissingCompoundParts(root.COMPOUND_ELEMENTS, { Tabs: FAKE_PARTS.Tabs! }).slice(0, 2), ["Accordion", "AccordionContent"]);
});

test("compounds: AccordionView — n-th child in n-th item, `collapsible` never reaches the root when multiple", () => {
  const items = [{ label: "Q1", text: "" }, { label: "Q2", text: "a2" }];
  const kid = { type: "Box", props: { "data-k": "rich" } };
  const multi = renderToStaticMarkup(
    <SaunaRenderer registry={COMPOUND_REGISTRY} schema={one("AccordionView", { items, type: "multiple", collapsible: true }, { k0: kid, k1: { type: "Box", props: { "data-k": "second" } } })} />
  );
  assert.match(multi, /data-part="Accordion" data-props="type"/, multi);
  assert.doesNotMatch(multi, /collapsible/, multi);
  assert.match(multi, /data-part="AccordionContent"[^>]*>.*data-k="rich"/, multi);
  const perItem = multi.split('data-part="AccordionItem"').slice(1);
  assert.equal(perItem.length, 2);
  assert.match(perItem[0]!, /data-k="rich"/);
  assert.match(perItem[1]!, /data-k="second"/, "the second child fills the second item");
  const single = renderToStaticMarkup(
    <SaunaRenderer registry={COMPOUND_REGISTRY} schema={one("AccordionView", { items, type: "single", collapsible: false })} />
  );
  assert.match(single, /data-part="Accordion" data-props="collapsible,type"/, single);
});

test("compounds: a hidden child keeps its slot — the next child never moves up into its tab (review of a57dc14)", () => {
  const items = [{ label: "A", text: "" }, { label: "B", text: "" }];
  const kids = {
    k0: { type: "Box", props: { "data-k": "members-only" }, visibility: "private" },
    k1: { type: "Box", props: { "data-k": "public" } },
  } as Record<string, root.SaunaNodeConfig>;
  const guest = renderToStaticMarkup(
    <SaunaRenderer registry={COMPOUND_REGISTRY} schema={one("TabsView", { items, orientation: "horizontal" }, kids)} />
  );
  const perTab = guest.split('data-part="TabsContent"').slice(1);
  assert.equal(perTab.length, 2);
  assert.doesNotMatch(perTab[0]!, /data-k=/, "tab 0 belongs to the hidden child: empty for a guest");
  assert.match(perTab[1]!, /data-k="public"/, "the public child stays in tab 1");
  assert.doesNotMatch(guest, /data-pages-compound-lost/, "a hidden child is not a lost one");
  // A hidden child beyond the slots is not announced to a guest either.
  const over = renderToStaticMarkup(
    <SaunaRenderer
      registry={COMPOUND_REGISTRY}
      schema={one("TabsView", { items: [{ label: "A", text: "" }], orientation: "horizontal" }, { k0: kids.k1!, k1: kids.k0! })}
    />
  );
  assert.doesNotMatch(over, /data-pages-compound-lost/, over);
});

test("compounds: removing or moving an item carries its child — every title keeps its content (review of a57dc14)", () => {
  const items = [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }];
  const kids = {
    k0: { type: "Box", props: { "data-k": "a" }, children: ["g0"] },
    k1: { type: "Box", props: { "data-k": "b" } },
    k2: { type: "Box", props: { "data-k": "c" } },
  } as Record<string, root.SaunaNodeConfig>;
  const base = one("TabsView", { items, orientation: "horizontal" }, kids);
  base.nodes.g0 = { type: "Box", props: { "data-k": "grandchild" } };
  base.parents.g0 = "k0";
  const labelsAndKids = (s: root.SaunaSchema) => {
    const html = renderToStaticMarkup(<SaunaRenderer registry={COMPOUND_REGISTRY} schema={s} />);
    const labels = [...html.matchAll(/data-part="TabsTrigger"[^>]*>([^<]*)</g)].map((m) => m[1]);
    const contents = html.split('data-part="TabsContent"').slice(1).map((c) => c.match(/data-k="([a-z]+)"/)?.[1] ?? "-");
    return labels.map((l, i) => `${l}:${contents[i]}`).join(" ");
  };
  assert.equal(labelsAndKids(base), "A:a B:b C:c");
  const removed = root.removeCompoundItem(base, "n", 0);
  assert.equal(labelsAndKids(removed), "B:b C:c");
  assert.equal(removed.nodes.k0, undefined, "the removed item's child leaves the document");
  assert.equal(removed.nodes.g0, undefined, "with its subtree");
  assert.equal(removed.parents.g0, undefined);
  assert.equal(root.validateSaunaSchema(removed).ok ?? true, true);
  assert.equal(labelsAndKids(root.moveCompoundItem(base, "n", 0, 2)), "B:b C:c A:a");
  assert.equal(labelsAndKids(root.moveCompoundItem(base, "n", 2, 0)), "C:c A:a B:b");
  assert.deepEqual(base.nodes.n?.children, ["k0", "k1", "k2"], "the input document is not mutated");
  // An empty trailing item cannot move in front of a filled one (it would open a hole).
  const partial = one("TabsView", { items, orientation: "horizontal" }, { k0: kids.k1! });
  assert.equal(labelsAndKids(root.moveCompoundItem(partial, "n", 2, 0)), "A:b B:- C:-");
  assert.equal((root.removeCompoundItem(one("TabsView", { items: [items[0]], orientation: "horizontal" }), "n", 0).nodes.n?.props?.items as unknown[]).length, 1, "the last item stays");
});

test("compounds: adding an item gives it a content child of its own — a leftover block never jumps under the new title (SDL-633)", () => {
  const items = [{ label: "A", text: "" }, { label: "B", text: "" }];
  const slotOf = (s: root.SaunaSchema) => {
    const n = s.nodes.n!;
    return (n.props!.items as { label: string }[]).map((it, i) => `${it.label}:${s.nodes[n.children?.[i] ?? ""]?.props?.["data-k"] ?? (n.children?.[i] ? "new" : "-")}`).join(" ");
  };
  // Two items, three children: "x" is a leftover past the end of the list.
  const over = one("TabsView", { items, orientation: "horizontal" }, {
    k0: { type: "Box", props: { "data-k": "a" } },
    k1: { type: "Box", props: { "data-k": "b" } },
    k2: { type: "Box", props: { "data-k": "x" } },
  });
  const added = root.addCompoundItem(over, "n", { label: "C", text: "" });
  assert.equal(slotOf(added), "A:a B:b C:new", "the new item took the leftover child");
  const fresh = added.nodes.n!.children![2]!;
  assert.equal(added.nodes[fresh]?.type, "Box");
  assert.equal(added.parents[fresh], "n");
  assert.equal(added.nodes.n!.children![3], "k2", "the leftover stays past the end");
  assert.equal(root.validateSaunaSchema(added).ok ?? true, true);
  assert.deepEqual(over.nodes.n?.children, ["k0", "k1", "k2"], "the input document is not mutated");
  // Items with no child yet get one too, so every later move is allowed.
  const bare = root.addCompoundItem(one("TabsView", { items, orientation: "horizontal" }), "n", { label: "C", text: "" });
  assert.equal(bare.nodes.n!.children!.length, 3);
  assert.equal(slotOf(root.moveCompoundItem(bare, "n", 2, 0)).split(" ").map((x) => x.split(":")[0]).join(""), "CAB");
  // At the cap the document comes back as it was; a non-slotted type is not touched.
  const full = one("TabsView", { items: Array.from({ length: 12 }, (_, i) => ({ label: `T${i}`, text: "" })), orientation: "horizontal" });
  assert.equal(root.addCompoundItem(full, "n", { label: "X", text: "" }), full);
  const card = one("CardView", { title: "t" });
  assert.equal(root.addCompoundItem(card, "n", { label: "X", text: "" }), card);
});

test("compounds: every item edit drops the width and member overrides of items — a phone override never keeps a deleted heading (SDL-633 review)", () => {
  const items = [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }];
  const withOverrides = (): root.SaunaSchema => {
    const s = one("TabsView", { items, orientation: "horizontal" }, {
      ka: { type: "Box", props: { "data-k": "a" } },
      kb: { type: "Box", props: { "data-k": "b" } },
      kc: { type: "Box", props: { "data-k": "c" } },
    });
    s.nodes.n = {
      ...s.nodes.n!,
      visibility: "hybrid",
      screens: { mobile: { props: { items } }, tablet: { props: { items, orientation: "vertical" } } },
      member: { props: { items } },
    };
    return s;
  };
  const clean = (s: root.SaunaSchema, what: string) => {
    const n = s.nodes.n!;
    assert.equal(n.screens?.mobile, undefined, `${what}: the emptied phone override stays`);
    assert.deepEqual(n.screens?.tablet, { props: { orientation: "vertical" } }, `${what}: the tablet override lost more than items`);
    assert.equal(n.member, undefined, `${what}: the emptied member branch stays`);
  };
  const removed = root.removeCompoundItem(withOverrides(), "n", 1);
  clean(removed, "remove");
  // What the phone renders: the base items, over the children that are left.
  const phone = renderToStaticMarkup(<SaunaRenderer registry={COMPOUND_REGISTRY} schema={removed} context={{ screen: "mobile" }} />);
  const labels = [...phone.matchAll(/data-part="TabsTrigger"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(labels, ["A", "C"], "the phone still shows the deleted heading");
  clean(root.moveCompoundItem(withOverrides(), "n", 0, 2), "move");
  clean(root.addCompoundItem(withOverrides(), "n", { label: "D", text: "" }), "add");
  clean(root.setCompoundItems(withOverrides(), "n", items.map((i) => ({ ...i, label: i.label.toLowerCase() }))), "set");
  // A node with no overrides keeps its shape; a refused move changes nothing at all.
  const plain = one("TabsView", { items, orientation: "horizontal" });
  assert.equal("screens" in root.removeCompoundItem(plain, "n", 0).nodes.n!, false);
  const refused = withOverrides();
  assert.equal(root.moveCompoundItem(refused, "n", 5, 0), refused);
  // Refused for a hole (an empty trailing item in front of a filled one): the same document, overrides kept.
  const holed = withOverrides();
  holed.nodes.n = { ...holed.nodes.n!, children: ["ka"] };
  delete holed.nodes.kb;
  delete holed.nodes.kc;
  delete holed.parents.kb;
  delete holed.parents.kc;
  assert.equal(root.moveCompoundItem(holed, "n", 2, 0), holed, "a move refused for a hole still wrote the node (and dropped its overrides)");
  // One cap for the schema and the list editor.
  assert.equal(root.COMPOUND_ITEM_LIMITS.TabsView, root.TABS_MAX_ITEMS);
  assert.equal(root.TabsViewProps.safeParse({ items: Array.from({ length: root.TABS_MAX_ITEMS + 1 }, () => ({ label: "x", text: "" })), orientation: "horizontal" }).success, false);
  assert.equal(root.AccordionViewProps.safeParse({ items: Array.from({ length: root.ACCORDION_MAX_ITEMS }, () => ({ label: "x", text: "" })), type: "single", collapsible: true }).success, true);
});

test("compounds: ONE stored node renders the whole tree — parts inside their root, one mark on the root", () => {
  const schema = one("TabsView", root.TabsViewElement.block.meta?.initialProps);
  assert.equal(Object.keys(schema.nodes).length, 1);
  const html = renderToStaticMarkup(<SaunaRenderer editable schema={schema} registry={COMPOUND_REGISTRY} />);
  assert.match(html, /Overview/);
  assert.match(html, /Details/);
  assert.equal((html.match(/data-sauna-node-id=/g) ?? []).length, 1, html);
  assert.match(html, /^<div data-part="Tabs"[^>]*data-sauna-node-id="n"/, html);
  // The part registry alone, outside its root, throws — which is what the compound avoids.
  assert.throws(() => renderToStaticMarkup(<SaunaRenderer schema={one("TabsList", {})} registry={FAKE_PARTS} />), /TabsList must be used within Tabs/);
});

test("compounds: children go to their slot, the extra ones to a visible plate; bad settings draw a frame, never throw", () => {
  const tabs = renderToStaticMarkup(
    <SaunaRenderer
      editable
      registry={COMPOUND_REGISTRY}
      schema={one("TabsView", { items: [{ label: "A", text: "" }], orientation: "horizontal" }, {
        k1: { type: "Box", props: { "data-k": "first" } },
        k2: { type: "Box", props: { "data-k": "second" } },
      })}
    />
  );
  assert.match(tabs, /data-part="TabsContent"[^>]*>.*data-k="first"/, tabs);
  assert.match(tabs, /data-pages-compound-lost="1"/, tabs);
  const card = renderToStaticMarkup(
    <SaunaRenderer registry={COMPOUND_REGISTRY} schema={one("CardView", { title: "T" }, { k1: { type: "Box", props: { "data-k": "body" } } })} />
  );
  assert.match(card, /data-part="CardContent"><div data-part="Box" data-k="body"/, card);
  const bad = renderToStaticMarkup(<SaunaRenderer editable registry={COMPOUND_REGISTRY} schema={one("TabsView", { items: "nope" })} />);
  assert.match(bad, /data-pages-compound-invalid="TabsView"/, bad);
  assert.match(bad, /data-sauna-node-id="n"/, bad);
  const table = renderToStaticMarkup(
    <SaunaRenderer registry={COMPOUND_REGISTRY} schema={one("TableView", { header: true, rows: [["H1", "H2"], ["x"]] })} />
  );
  assert.equal((table.match(/data-part="TableHead"/g) ?? []).length, 2);
  assert.equal((table.match(/data-part="TableCell"/g) ?? []).length, 2, "short rows are padded to the widest");
});

// The kit shape of Dialog: a namespace object whose Portal is also a flat export.
const DialogPortal = () => null;
const AlertDialogPortal = () => null;
const CardRoot = () => null;
const CardHeader = () => null;
const TableRoot = () => null;
const Button = () => null;
const GUARD_KIT: Record<string, unknown> = {
  Dialog: { Root: () => null, Portal: DialogPortal, Content: () => null, Alert: { Portal: AlertDialogPortal } },
  DialogPortal,
  AlertDialogPortal,
  Card: Object.assign(CardRoot, { Header: CardHeader }),
  CardHeader,
  Table: Object.assign(TableRoot, { Root: TableRoot }),
  TableKit: TableRoot,
  Button,
};
const GUARD_ADAPTER: client.SaunaElementAdapter = {
  groups: [{ id: "w", title: "W" }],
  groupOf: { DialogPortal: "w", AlertDialogPortal: "w", Card: "w", CardHeader: "w", Table: "w", TableKit: "w", Button: "w" },
  within: { DialogPortal: ["Dialog"], AlertDialogPortal: ["Dialog"], CardHeader: ["Card"] },
};

test("part guard: Dialog.Portal is a part — found by shape, never offered at a page root or in a preview", () => {
  assert.deepEqual(client.saunaCompoundParts(GUARD_KIT), { AlertDialogPortal: "Dialog", CardHeader: "Card", DialogPortal: "Dialog" });
  assert.deepEqual(client.findUndeclaredParts(GUARD_KIT, GUARD_ADAPTER), []);
  const { within: _drop, ...noWithin } = GUARD_ADAPTER;
  assert.deepEqual(client.findUndeclaredParts(GUARD_KIT, noWithin), ["AlertDialogPortal", "CardHeader", "DialogPortal"]);
  const kit = client.createSaunaCatalog(GUARD_KIT, { adapter: GUARD_ADAPTER });
  const portal = kit.catalog.items.find((i) => i.type === "DialogPortal");
  assert.equal(portal?.partOf, "Dialog");
  assert.deepEqual(portal?.allowedParents, ["Dialog"]);
  for (const parent of ["Page", "Section", "Box"]) {
    for (const t of ["DialogPortal", "AlertDialogPortal", "CardHeader"]) {
      assert.equal(client.isCatalogItemAllowed(kit.catalog, { parentType: parent, childType: t }), false, `${t} under ${parent}`);
    }
    assert.equal(client.isCatalogItemAllowed(kit.catalog, { parentType: parent, childType: "Button" }), true);
  }
  assert.equal(client.isCatalogItemAllowed(kit.catalog, { parentType: "Card", childType: "CardHeader" }), true);
  // Its preview is drawn inside its root, not alone.
  const prev = portal?.previewSchema;
  assert.equal(prev?.nodes[prev.rootId]?.type, "Dialog");
  // A part whose parent rule got lost is refused rather than offered everywhere.
  assert.equal(client.isCatalogItemAllowed({ groups: [], items: [{ type: "X", groupId: "w", partOf: "Y" }] }, { parentType: "Page", childType: "X" }), false);
  assert.equal(client.isCatalogItemAllowed({ groups: [], items: [{ type: "X", groupId: "w", insertable: false }] }, { parentType: "Page", childType: "X" }), false);
});

test("block reference: an edit of the block reaches every page, params stay by name, nothing stored is rewritten", async () => {
  const blockV1: root.SaunaSchema = {
    version: 2, rootId: "b", parents: { b: null, t: "b" },
    nodes: { b: { type: "Box", children: ["t"] }, t: { type: "Text", props: { text: "v1 title" } } },
    params: [{ name: "title", nodeId: "t", prop: "text" }],
  };
  const blockV2: root.SaunaSchema = {
    ...blockV1, parents: { b: null, t: "b", x: "b" },
    nodes: { b: { type: "Box", children: ["t", "x"] }, t: { type: "Text", props: { text: "v2 title" } }, x: { type: "Text", props: { text: "v2 extra" } } },
  };
  const store = new Map<string, root.SaunaSchema>([["blk", blockV1]]);
  const load = async (id: string) => structuredClone(store.get(id) ?? null);
  const pageA: root.SaunaSchema = { version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type: "Ref", props: { blockId: "blk" } } } };
  const pageB: root.SaunaSchema = { version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type: "Ref", props: { blockId: "blk", params: { title: "B's own" } } } } };
  const before = JSON.stringify([pageA, pageB]);
  const reg = client.PRIMITIVE_REGISTRY;
  const draw = async (page: root.SaunaSchema) => renderToStaticMarkup(<SaunaRenderer schema={page} registry={reg} blocks={await root.loadBlockRefs(page, load)} />);

  const blockSnapshot = JSON.stringify(blockV1);
  assert.match(JSON.stringify(root.applyBlockParams(blockV1, { title: "B's own" })), /B's own/);
  assert.match(await draw(pageA), /v1 title/);
  assert.match(await draw(pageB), /B&#x27;s own|B's own/);
  assert.equal(JSON.stringify(blockV1), blockSnapshot, "rendering with params must not write into the stored block");

  store.set("blk", blockV2); // the block is edited once, in one place
  const a = await draw(pageA);
  const b = await draw(pageB);
  assert.match(a, /v2 title/); assert.match(a, /v2 extra/);
  assert.match(b, /v2 extra/); assert.match(b, /B&#x27;s own|B's own/); assert.ok(!b.includes("v2 title"), b);
  assert.equal(JSON.stringify([pageA, pageB]), before, "the pages were not rewritten");
  for (const p of [pageA, pageB]) assert.deepEqual(Object.keys(p.nodes), ["r"], "a page holds one Ref node, no copy of the block");
});

// --- SDL-690: page behaviour slots travel with the document -----------------
//
// `queries`/`state` at the root and `bind`/`on` on nodes are stored by
// pages-service by value and interpreted by nobody yet. The engine's half of
// the contract: every reader and writer the editor goes through carries them
// unchanged, and nothing invents them on a document that has none.

const BEHAVIOR_DOC = {
  version: 2 as const,
  rootId: "r",
  queries: { posts: { collection: "posts", sort: [{ field: "created_at", dir: "desc" }], limit: 10 } },
  state: { tab: "all", draft: { text: "" } },
  nodes: {
    r: { type: "Box", children: ["t", "s"], on: { mount: [{ do: "query.refresh", query: "posts" }] } },
    t: { type: "Text", props: { children: "hi" }, bind: { children: "queries.posts.total" }, on: { click: [{ do: "state.set", path: "tab", value: "mine" }] } },
    s: { type: "Box", visibility: "hybrid" as const, children: ["d"], bind: { hidden: "state.draft.empty" } },
    d: { type: "Text", props: { children: "deep" }, bind: { children: "viewer.name" }, on: { "submit:after": null } },
  },
  parents: { r: null, t: "r", s: "r", d: "s" },
} satisfies root.SaunaSchema;

const behaviorOf = (schema: root.SaunaSchema) => ({
  queries: schema.queries,
  state: schema.state,
  nodes: Object.fromEntries(
    Object.entries(schema.nodes)
      .filter(([, n]) => n.bind !== undefined || n.on !== undefined)
      .map(([id, n]) => [id, { bind: n.bind, on: n.on }])
  ),
});
const EXPECTED_BEHAVIOR = behaviorOf(structuredClone(BEHAVIOR_DOC));
const noBehaviorKeys = (schema: root.SaunaSchema) =>
  !("queries" in schema) && !("state" in schema) && Object.values(schema.nodes).every((n) => !("bind" in n) && !("on" in n));

test("SDL-690: behaviour keys are named once, in the engine", () => {
  assert.deepEqual([...root.SAUNA_DOCUMENT_BEHAVIOR_KEYS], ["queries", "state"]);
  assert.deepEqual([...root.SAUNA_NODE_BEHAVIOR_KEYS], ["bind", "on"]);
});

test("SDL-690: validator (read and write) and migration keep queries/state/bind/on by value", () => {
  for (const mode of ["read", "write"] as const) {
    const res = root.validateSaunaSchema(structuredClone(BEHAVIOR_DOC), { mode });
    assert.ok(res.ok, `${mode}: ${res.ok ? "" : JSON.stringify(res.error.issues)}`);
    if (!res.ok) return;
    assert.equal(res.warnings, undefined, `${mode}: a node-level \`on\` is not an on… prop and draws no warning`);
    const migrated = root.migrateSaunaSchema(res.value);
    assert.deepEqual(migrated, BEHAVIOR_DOC, `${mode}: the document came back changed`);
    assert.deepEqual(behaviorOf(migrated), EXPECTED_BEHAVIOR);
  }
});

test("SDL-690: provider round-trip (PATCH then GET through the gateway) keeps the slots, root and nested", async () => {
  const gw = fakeGateway({ memberOf: WS });
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, fetch: gw.fetchImpl });
  await p.put(PAGE_ID, structuredClone(BEHAVIOR_DOC), { ifMatch: "3" });
  const patch = gw.calls.find((c) => c.method === "PATCH");
  assert.deepEqual((patch?.body as { body: unknown }).body, BEHAVIOR_DOC, "the PATCH body is the whole document");
  const back = await p.get(PAGE_ID);
  assert.deepEqual(back.schema, BEHAVIOR_DOC);
  assert.deepEqual(behaviorOf(back.schema), EXPECTED_BEHAVIOR);
});

test("SDL-690: editor ops on a document keep its slots and never invent them", () => {
  const ops: Array<[string, (s: root.SaunaSchema) => root.SaunaSchema]> = [
    ["updateNodePropsPartial", (s) => root.updateNodePropsPartial(s, "t", { children: "edited" })],
    ["updateNodePropsPartial (nested)", (s) => root.updateNodePropsPartial(s, "d", { children: "edited" })],
    ["renameNode", (s) => root.renameNode(s, "d", "Deep text")],
    ["setVisibility", (s) => root.setVisibility(s, "t", { when: { op: "exists", path: "user.id" } })],
    ["reparentNode", (s) => root.reparentNode(s, "d", "r", 0)],
    ["addChildNode", (s) => root.addChildNode(s, "s", { type: "Text", props: { children: "new" } }).schema],
    ["removeSubtree", (s) => {
      const added = root.addChildNode(s, "r", { type: "Text" });
      return root.removeSubtree(added.schema, added.nodeId).schema;
    }],
    ["setBlockParams", (s) => root.setBlockParams(s, [{ name: "title", nodeId: "t", prop: "children" }])],
    ["setBlockParams(null)", (s) => root.setBlockParams(s, null)],
  ];
  for (const [name, op] of ops) {
    const before = structuredClone(BEHAVIOR_DOC) as root.SaunaSchema;
    const after = op(before);
    assert.notEqual(after, before, `${name}: the op did nothing, so it proves nothing`);
    const got = behaviorOf(after);
    assert.deepEqual(got.queries, EXPECTED_BEHAVIOR.queries, `${name}: queries`);
    assert.deepEqual(got.state, EXPECTED_BEHAVIOR.state, `${name}: state`);
    for (const [id, slots] of Object.entries(EXPECTED_BEHAVIOR.nodes)) {
      assert.deepEqual(got.nodes[id], slots, `${name}: bind/on of node ${id}`);
    }
    const plain = op(structuredClone(TREE_WITH_SAME_IDS) as root.SaunaSchema);
    assert.ok(noBehaviorKeys(plain), `${name}: invented a behaviour slot on a document without one`);
  }

  // A duplicate is a copy: its nodes carry the source's slots under new ids.
  const dup = root.duplicateSubtree(structuredClone(BEHAVIOR_DOC) as root.SaunaSchema, "s");
  assert.notEqual(dup.nodeId, "s");
  assert.deepEqual(dup.schema.nodes[dup.nodeId]!.bind, BEHAVIOR_DOC.nodes.s.bind);
  const dupChild = dup.schema.nodes[dup.nodeId]!.children![0]!;
  assert.deepEqual(dup.schema.nodes[dupChild]!.on, BEHAVIOR_DOC.nodes.d.on);
  assert.deepEqual(dup.schema.queries, BEHAVIOR_DOC.queries);
});

// Same ids as BEHAVIOR_DOC, no slots — every op above must address real nodes.
const TREE_WITH_SAME_IDS = {
  version: 2 as const,
  rootId: "r",
  nodes: {
    r: { type: "Box", children: ["t", "s"] },
    t: { type: "Text", props: { children: "hi" } },
    s: { type: "Box", visibility: "hybrid" as const, children: ["d"] },
    d: { type: "Text", props: { children: "deep" } },
  },
  parents: { r: null, t: "r", s: "r", d: "s" },
} satisfies root.SaunaSchema;

test("SDL-690: the public shell passes the slots through (pages-service shell.Strip does too)", () => {
  const shell = root.saunaPublicShell(structuredClone(BEHAVIOR_DOC) as root.SaunaSchema);
  assert.deepEqual(behaviorOf(shell), EXPECTED_BEHAVIOR);
  assert.ok(noBehaviorKeys(root.saunaPublicShell(structuredClone(TREE_WITH_SAME_IDS) as root.SaunaSchema)), "the shell invented a slot");
});

test("SDL-690: the renderer never hands bind/on to a component — same markup with and without them", () => {
  const draw = (schema: root.SaunaSchema) =>
    renderToStaticMarkup(<SaunaRenderer schema={schema} registry={client.PRIMITIVE_REGISTRY} />);
  const withSlots = draw(structuredClone(BEHAVIOR_DOC) as root.SaunaSchema);
  assert.equal(withSlots, draw(structuredClone(TREE_WITH_SAME_IDS) as root.SaunaSchema));
  assert.ok(!/\bon=|\bbind=|mount|state\.set/.test(withSlots), withSlots);
});

// --- SDL-718: typed block parameters, Ref in the Element catalog ----------

const PARAM_BLOCK_BASE = {
  version: 2,
  rootId: "r",
  parents: { r: null, t: "r", c: "r" },
  nodes: {
    r: { type: "Box", props: {}, children: ["t", "c"] },
    t: { type: "Text", props: { text: "Block's own" } },
    c: { type: "Text", props: { text: "Count" } },
  },
} as const;

const withParams = (params: unknown): unknown => ({ ...structuredClone(PARAM_BLOCK_BASE), params });

/** `[write ok?, read ok?, read warnings, write issue paths]` for one params array. */
function judgeParams(params: unknown) {
  const write = root.validateSaunaSchema(withParams(params), { mode: "write" });
  const read = root.validateSaunaSchema(withParams(params));
  return {
    write: write.ok,
    read: read.ok,
    warnings: read.ok ? (read.warnings ?? []).map((w) => w.path) : [],
    issues: write.ok ? [] : write.error.issues.map((i) => i.path),
    messages: write.ok ? [] : write.error.issues.map((i) => i.message),
  };
}

const okSpec = { name: "title", nodeId: "t", prop: "text" };

test("SDL-718: a document written before typed params (no type, no default) is valid on write and read, unchanged", () => {
  const doc = withParams([okSpec, { name: "count", nodeId: "c", prop: "text", label: "Count" }]);
  const before = JSON.stringify(doc);
  const write = root.validateSaunaSchema(doc, { mode: "write" });
  const read = root.validateSaunaSchema(doc);
  assert.ok(write.ok && read.ok);
  assert.equal(read.ok && read.warnings, undefined, "an old document must not even warn");
  assert.equal(JSON.stringify(doc), before, "reading must not rewrite the document");
  assert.equal(root.saunaParamType(okSpec), "string", "absent type reads as string");
  assert.equal(root.SAUNA_DEFAULT_PARAM_TYPE, "string");
});

test("SDL-718: every type of the contract is accepted with a default of its own JS type", () => {
  assert.deepEqual([...root.SAUNA_PARAM_TYPES], ["string", "text", "number", "boolean", "url", "file", "select"]);
  const good: unknown[] = [
    { ...okSpec, name: "a", type: "string", default: "x" },
    { ...okSpec, name: "b", type: "text", default: "long\ntext" },
    { ...okSpec, name: "c", type: "number", default: 0 },
    { ...okSpec, name: "d", type: "number", default: -1.5 },
    { ...okSpec, name: "e", type: "boolean", default: false },
    { ...okSpec, name: "f", type: "url", default: "https://example.com" },
    { ...okSpec, name: "g", type: "file", default: "" },
    { ...okSpec, name: "h", type: "select", options: ["sm", "lg"], default: "lg" },
    { ...okSpec, name: "i", type: "select", options: ["only"] },
    { ...okSpec, name: "j", type: "number" },
  ];
  const v = judgeParams(good);
  assert.deepEqual(v, { write: true, read: true, warnings: [], issues: [], messages: [] });
});

test("SDL-718: extra keys on a spec are not an error; an orphan nodeId is not either (SDL-501 reports it)", () => {
  const v = judgeParams([{ ...okSpec, hint: "free", type: "string" }, { name: "ghost", nodeId: "missing", prop: "text", type: "boolean", default: true }]);
  assert.equal(v.write, true, JSON.stringify(v));
});

test("SDL-718: an unknown type is refused on write, warned on read", () => {
  const v = judgeParams([{ ...okSpec, type: "color" }]);
  assert.equal(v.write, false);
  assert.deepEqual(v.issues, ["$.params[0].type"]);
  assert.equal(v.read, true, "read stays lenient");
  assert.deepEqual(v.warnings, ["$.params[0].type"]);
  const nonString = judgeParams([{ ...okSpec, type: 3 }]);
  assert.deepEqual(nonString.issues, ["$.params[0].type"]);
});

test("SDL-718: name — empty is refused (structural, both modes), longer than 120 is refused on write, 120 passes", () => {
  const empty = root.validateSaunaSchema(withParams([{ ...okSpec, name: "  " }]));
  assert.equal(empty.ok, false, "an empty name is refused even on read, as before SDL-718");
  assert.equal(judgeParams([{ ...okSpec, name: "n".repeat(120) }]).write, true);
  const long = judgeParams([{ ...okSpec, name: "n".repeat(121) }]);
  assert.equal(long.write, false);
  assert.deepEqual(long.issues, ["$.params[0].name"]);
  assert.equal(root.SAUNA_PARAM_NAME_MAX, 120);
});

test("SDL-718: name must be unique (both modes)", () => {
  const dup = root.validateSaunaSchema(withParams([okSpec, { ...okSpec, nodeId: "c" }]));
  assert.equal(dup.ok, false);
  assert.match(JSON.stringify(dup), /duplicate param name/);
});

test("SDL-718: default must match the type — positive and negative for each", () => {
  const cases: Array<[string, unknown, boolean]> = [
    ["string", "s", true], ["string", 1, false],
    ["text", "t", true], ["text", true, false],
    ["url", "https://x.y", true], ["url", 5, false],
    ["file", "mlfile:abc", true], ["file", null, false],
    ["number", 42, true], ["number", "42", false], ["number", Number.NaN, false], ["number", Number.POSITIVE_INFINITY, false],
    ["boolean", true, true], ["boolean", "true", false], ["boolean", 0, false],
  ];
  for (const [type, def, ok] of cases) {
    const v = judgeParams([{ ...okSpec, type, default: def }]);
    assert.equal(v.write, ok, `${type} with default ${String(def)}: ${JSON.stringify(v)}`);
    if (!ok) assert.deepEqual(v.issues, ["$.params[0].default"], `${type}/${String(def)}`);
  }
  // An absent type is "string" for the default too.
  assert.equal(judgeParams([{ ...okSpec, default: 7 }]).write, false);
  assert.equal(judgeParams([{ ...okSpec, default: "seven" }]).write, true);
});

test("SDL-718: select — options required and non-empty, unique non-empty strings, default one of them", () => {
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select" }]).issues, ["$.params[0].options"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: [] }]).issues, ["$.params[0].options"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: "a,b" }]).issues, ["$.params[0].options"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: ["a", ""] }]).issues, ["$.params[0].options[1]"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: ["a", 2] }]).issues, ["$.params[0].options[1]"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: ["a", "a"] }]).issues, ["$.params[0].options[1]"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: ["a", "b"], default: "c" }]).issues, ["$.params[0].default"]);
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: ["a", "b"], default: 1 }]).issues, ["$.params[0].default"]);
  assert.equal(judgeParams([{ ...okSpec, type: "select", options: ["a", "b"], default: "b" }]).write, true);
});

test("SDL-718: options on any type but select are refused (absent type included)", () => {
  for (const type of ["string", "text", "number", "boolean", "url", "file", undefined]) {
    const v = judgeParams([{ ...okSpec, ...(type ? { type } : {}), options: ["a"] }]);
    assert.deepEqual(v.issues, ["$.params[0].options"], `type ${String(type)}`);
  }
});

test("SDL-718: options: null on a non-select type is refused like any other options value", () => {
  for (const type of ["string", "number", undefined]) {
    const v = judgeParams([{ ...okSpec, ...(type ? { type } : {}), options: null }]);
    assert.deepEqual(v.issues, ["$.params[0].options"], `type ${String(type)}`);
  }
  assert.deepEqual(judgeParams([{ ...okSpec, type: "select", options: null }]).issues, ["$.params[0].options"]);
});

test("SDL-718: the typed check runs on v2 documents only — a v1 document carries no params manifest", () => {
  const v1 = {
    version: 1,
    root: { id: "r", type: "Box", props: {}, children: [] },
    params: [{ ...okSpec, type: "color", default: 1, options: [] }],
  };
  const write = root.validateSaunaSchema(v1, { mode: "write" });
  assert.ok(write.ok, JSON.stringify(write));
  assert.equal(write.ok && write.warnings, undefined);
  // The same params on v2 are refused — the skip is the version, not the content.
  assert.equal(judgeParams(v1.params).write, false);
});

test("SDL-718: the pages-service provider refuses to PUT a block whose params break the contract", async () => {
  let called = 0;
  const provider = createPagesServiceProvider({
    apiBaseUrl: "/api",
    workspaceId: "ws-1",
    kind: "blocks",
    fetch: (async () => {
      called++;
      return new Response("{}", { status: 500 });
    }) as typeof fetch,
  });
  await assert.rejects(
    provider.put("b1", withParams([{ ...okSpec, type: "number", default: "1" }]) as root.SaunaSchema, { ifMatch: "1" }),
    /Invalid block parameters/,
  );
  assert.equal(called, 0, "nothing may reach the service");
});

test("SDL-718: applyBlockParams — a missing value takes the default, a present value (even empty) wins, no default keeps the block's own", () => {
  const block = withParams([
    { name: "title", nodeId: "t", prop: "text", type: "string", default: "Default title" },
    { name: "count", nodeId: "c", prop: "text" },
  ]) as root.SaunaSchema;
  const snapshot = JSON.stringify(block);

  const noValues = root.applyBlockParams(block, null);
  assert.equal(noValues.nodes.t.props?.text, "Default title", "no params prop at all → default");
  assert.equal(noValues.nodes.c.props?.text, "Count", "no default → the block's own value");

  const other = root.applyBlockParams(block, { count: "3" });
  assert.equal(other.nodes.t.props?.text, "Default title", "a value for another param does not cancel the default");
  assert.equal(other.nodes.c.props?.text, "3");

  const empty = root.applyBlockParams(block, { title: "" });
  assert.equal(empty.nodes.t.props?.text, "", "an empty string the author typed beats the default");

  const set = root.applyBlockParams(block, { title: "Page's" });
  assert.equal(set.nodes.t.props?.text, "Page's");
  assert.equal(JSON.stringify(block), snapshot, "the stored block is never written into");
});

test("SDL-718: applyBlockParams — typed defaults land with their JS type; a broken default is ignored; identity kept when nothing applies", () => {
  const block = withParams([
    { name: "n", nodeId: "t", prop: "size", type: "number", default: 3 },
    { name: "b", nodeId: "t", prop: "wrap", type: "boolean", default: false },
    { name: "s", nodeId: "c", prop: "variant", type: "select", options: ["a", "b"], default: "b" },
    { name: "bad", nodeId: "c", prop: "text", type: "boolean", default: "yes" },
  ]) as root.SaunaSchema;
  const out = root.applyBlockParams(block, undefined);
  assert.equal(out.nodes.t.props?.size, 3);
  assert.equal(out.nodes.t.props?.wrap, false);
  assert.equal(out.nodes.c.props?.variant, "b");
  assert.equal(out.nodes.c.props?.text, "Count", "a default that breaks its type is not rendered");

  const plain = withParams([okSpec]) as root.SaunaSchema;
  assert.equal(root.applyBlockParams(plain, null), plain, "no values and no defaults → the same object");
  assert.equal(root.applyBlockParams(plain, {}), plain);
});

test("SDL-718: the renderer draws a Ref's default and the page's value over it", () => {
  const block = withParams([{ name: "title", nodeId: "t", prop: "text", type: "text", default: "From default" }]) as root.SaunaSchema;
  const page = (params?: Record<string, unknown>): root.SaunaSchema => ({
    version: 2, rootId: "p", parents: { p: null },
    nodes: { p: { type: "Ref", props: { blockId: "blk", ...(params ? { params } : {}) } } },
  });
  const draw = (schema: root.SaunaSchema) =>
    renderToStaticMarkup(<SaunaRenderer schema={schema} registry={client.PRIMITIVE_REGISTRY} blocks={{ blk: block }} />);
  assert.match(draw(page()), /From default/);
  const filled = draw(page({ title: "From page" }));
  assert.match(filled, /From page/);
  assert.doesNotMatch(filled, /From default/);
});

test("SDL-718: Ref is an Element of the catalog — not insertable, props {blockId: uuid, params: object}", () => {
  const ref = root.RefBlock;
  assert.equal(ref.type, "Ref");
  assert.equal(ref.type, root.SAUNA_REF_TYPE);
  assert.equal(ref.meta?.insertable, false);
  const props = ref.staticProps!;
  const id = "0b9f6a0e-3c1d-4f7e-9a2b-5d6c7e8f9a0b";
  assert.ok(props.safeParse({ blockId: id }).success, "params may be absent");
  assert.ok(props.safeParse({ blockId: id, params: { title: "x", n: 2 } }).success);
  assert.equal(props.safeParse({ blockId: "hero-section" }).success, false, "a key is not an id — blockId is the service's uuid");
  assert.equal(props.safeParse({}).success, false, "blockId is required");
  assert.equal(props.safeParse({ blockId: id, params: ["x"] }).success, false, "params is an object, not an array");
  // Not offered for insertion anywhere, and not reported as unrenderable:
  // the renderer draws a Ref itself, before the registry.
  const catalog = { groups: [], items: [{ type: "Ref", groupId: "g", insertable: false }] };
  assert.equal(client.isCatalogItemAllowed(catalog, { parentType: "Page", childType: "Ref" }), false);
  assert.deepEqual(client.findUnrenderableTypes([ref], {}), []);
  assert.deepEqual(client.findUnrenderableTypes([{ type: "Nope" }], {}), ["Nope"], "the skip is for Ref only");
});

// --- SDL-723: Element migrations reach Component params; Component depth ----

type ParamsMigrationFixture = {
  definitions: root.BlockDefinition[];
  cases: {
    name: string;
    block_id: string;
    component: root.SaunaSchema;
    expect_component: root.SaunaSchema;
    expect_removed_params: string[];
    page: root.SaunaSchema;
    expect_page: root.SaunaSchema;
  }[];
};

test("component params migration: the shared fixture replays (params[].prop; pages untouched, removed values become orphans)", async () => {
  const fx = JSON.parse(
    await readFile(path.join(import.meta.dirname, "fixtures/component-params-migration.cases.json"), "utf8"),
  ) as ParamsMigrationFixture;
  const defs = new Map(fx.definitions.map((d) => [d.type, d]));
  const lookup = (type: string) => defs.get(type);
  assert.ok(fx.cases.length >= 2);
  for (const c of fx.cases) {
    const compBefore = JSON.stringify(c.component);
    const pageBefore = JSON.stringify(c.page);
    const { schema, removedParams } = root.saunaMigrateComponent(c.component, lookup);
    assert.deepEqual(JSON.parse(JSON.stringify(schema)), c.expect_component, `${c.name}: component`);
    assert.deepEqual(removedParams, c.expect_removed_params, `${c.name}: removed params`);
    // The page is not rewritten (SDL-501): a removed param's value stays and is reported as an orphan.
    assert.deepEqual(c.expect_page, c.page, `${c.name}: the fixture expects the page untouched`);
    const orphans = root
      .refParamOrphans(c.page, { [c.block_id]: schema })
      .filter((w) => w.code === "orphan-value" && w.blockId === c.block_id)
      .map((w) => w.name);
    for (const name of removedParams) assert.ok(orphans.includes(name), `${c.name}: removed "${name}" is not reported as an orphan`);
    assert.equal(JSON.stringify(c.component), compBefore, `${c.name}: the component input was modified`);
    assert.equal(JSON.stringify(c.page), pageBefore, `${c.name}: the page input was modified`);
  }
});

test("component params migration: a renamed param keeps its page value and still renders", async () => {
  const fx = JSON.parse(
    await readFile(path.join(import.meta.dirname, "fixtures/component-params-migration.cases.json"), "utf8"),
  ) as ParamsMigrationFixture;
  const defs = new Map(fx.definitions.map((d) => [d.type, d]));
  const c = fx.cases[0]!;
  const { schema } = root.saunaMigrateComponent(c.component, (t) => defs.get(t));
  const applied = root.applyBlockParams(schema, { title: "From page" });
  assert.equal(applied.nodes.n1!.props!.headline, "From page");
  assert.equal("title" in applied.nodes.n1!.props!, false, "the old key must not be written back");
});

test("component params migration: one-segment move renames, Elements without a definition are left alone", () => {
  const def = {
    type: "P",
    propsVersion: 2,
    migrations: [{ steps: [root.migrationStep.move("a", "b"), root.migrationStep.rename("x.y", "z")] }],
  };
  assert.equal(root.saunaMigratedParamProp(def, 1, "a"), "b");
  assert.equal(root.saunaMigratedParamProp(def, 1, "x"), "x");
  assert.equal(root.saunaMigratedParamProp(def, 2, "a"), "a");
  const s: root.SaunaSchema = {
    version: 2,
    rootId: "n",
    nodes: { n: { type: "Unknown", props: { a: 1 } } },
    parents: { n: null },
    params: [{ name: "p", nodeId: "n", prop: "a" }],
  };
  const out = root.saunaMigrateComponent(s, () => undefined);
  assert.equal(out.schema, s);
  assert.deepEqual(out.removedParams, []);
});

const depthUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const refDoc = (...blockIds: string[]): root.SaunaSchema => {
  const nodes: root.SaunaSchema["nodes"] = { root: { type: "Stack", children: blockIds.map((_, i) => `r${i}`) } };
  const parents: root.SaunaSchema["parents"] = { root: null };
  blockIds.forEach((id, i) => {
    nodes[`r${i}`] = { type: "Ref", props: { blockId: id } };
    parents[`r${i}`] = "root";
  });
  return { version: 2, rootId: "root", nodes, parents };
};
/** A chain c1 → c2 → … → cN (c1 holds a Ref to c2, …, cN holds nothing). */
const chain = (n: number): Record<string, root.SaunaSchema> => {
  const blocks: Record<string, root.SaunaSchema> = {};
  for (let i = 1; i <= n; i++) blocks[depthUuid(i)] = i < n ? refDoc(depthUuid(i + 1)) : refDoc();
  return blocks;
};

test("component depth: the limit comes from limits.json, not a literal", async () => {
  const limits = JSON.parse(
    await readFile(path.join(import.meta.dirname, "../../policy/limits.json"), "utf8"),
  ) as Record<string, { value: number }>;
  assert.equal(root.SAUNA_COMPONENT_MAX_DEPTH, limits[root.SAUNA_COMPONENT_MAX_DEPTH_KEY]!.value);
});

test("component depth: page does not count itself, a Component opened alone does, missing Components add nothing", () => {
  const blocks = chain(4);
  assert.equal(root.saunaComponentDepth(refDoc(depthUuid(1)), blocks, null), 4, "page → 1 → 2 → 3 → 4 = 4");
  assert.equal(root.saunaComponentDepth(blocks[depthUuid(3)]!, blocks, depthUuid(3)), 2, "3 → 4 opened alone = 2");
  assert.equal(root.saunaComponentChainDepth(depthUuid(1), blocks), 4);
  assert.equal(root.saunaComponentDepth(refDoc(depthUuid(99)), blocks, null), 0, "a Ref to nothing adds nothing");
  assert.equal(root.saunaComponentDepth(refDoc(), blocks, null), 0);
});

test("component depth: limit 5 passes, 6 is refused, an older 7 is kept unless it deepens", () => {
  const limit = 5;
  const blocks = chain(7);
  const page5 = refDoc(depthUuid(3)); // 3..7 = 5
  const page6 = refDoc(depthUuid(2)); // 2..7 = 6
  const page7 = refDoc(depthUuid(1)); // 1..7 = 7
  const empty = refDoc();
  assert.equal(root.saunaCheckComponentDepth({ before: empty, after: page5, hostBlockId: null, blocks, limit }).ok, true);
  const six = root.saunaCheckComponentDepth({ before: empty, after: page6, hostBlockId: null, blocks, limit });
  assert.deepEqual(six, { ok: false, depth: 6, previous: 0, limit: 5 });
  assert.throws(
    () => root.saunaAssertComponentDepth({ before: null, after: page6, hostBlockId: null, blocks, limit }),
    (e: unknown) => root.isComponentDepthError(e) && e.depth === 6 && e.limit === 5 && e.code === "component_depth_exceeded",
  );
  // An old 7-deep page: an edit that keeps it at 7 (or makes it shallower) is fine.
  const page7plus = refDoc(depthUuid(1), depthUuid(4));
  assert.equal(root.saunaCheckComponentDepth({ before: page7, after: page7plus, hostBlockId: null, blocks, limit }).ok, true);
  assert.equal(root.saunaCheckComponentDepth({ before: page7, after: page6, hostBlockId: null, blocks, limit }).ok, true);
  // …but it may not get deeper: a stored 7 (2..8) edited into an 8 (1..8).
  const blocks8 = chain(8);
  const stored7 = refDoc(depthUuid(2));
  assert.equal(root.saunaComponentDepth(stored7, blocks8, null), 7);
  const deeper = root.saunaCheckComponentDepth({ before: stored7, after: refDoc(depthUuid(1)), hostBlockId: null, blocks: blocks8, limit });
  assert.deepEqual(deeper, { ok: false, depth: 8, previous: 7, limit: 5 }, "an old page over the limit may not deepen");
  // A Component host counts itself: inserting a 5-deep chain into a Component makes 6.
  const host = depthUuid(50);
  const hostAfter = refDoc(depthUuid(3));
  assert.equal(root.saunaCheckComponentDepth({ before: refDoc(), after: hostAfter, hostBlockId: host, blocks, limit }).ok, false);
  assert.equal(root.saunaCheckComponentDepth({ before: refDoc(), after: refDoc(depthUuid(4)), hostBlockId: host, blocks, limit }).ok, true);
});

test("component depth: a Component host counts the Components above it (Up + Down)", () => {
  // p1 → p2 → host; host → c1 → c2. Library = all of them.
  const host = depthUuid(10);
  const lib: Record<string, root.SaunaSchema> = {
    [depthUuid(11)]: refDoc(depthUuid(12)),
    [depthUuid(12)]: refDoc(host),
    [host]: refDoc(),
    [depthUuid(1)]: refDoc(depthUuid(2)),
    [depthUuid(2)]: refDoc(),
  };
  assert.equal(root.saunaComponentDepthAbove(host, lib), 2);
  assert.equal(root.saunaComponentDepthAbove(depthUuid(11), lib), 0);
  // 2 above + host + 2 below = 5: fine at 5, refused at 4.
  const after = refDoc(depthUuid(1));
  const above = root.saunaComponentDepthAbove(host, lib);
  assert.equal(root.saunaCheckComponentDepth({ before: refDoc(), after, hostBlockId: host, blocks: lib, above, limit: 5 }).ok, true);
  assert.deepEqual(
    root.saunaCheckComponentDepth({ before: refDoc(), after, hostBlockId: host, blocks: lib, above, limit: 4 }),
    { ok: false, depth: 5, previous: 3, limit: 4 },
  );
  // A cycle above ends.
  assert.equal(root.saunaComponentDepthAbove(depthUuid(1), { [depthUuid(1)]: refDoc(depthUuid(2)), [depthUuid(2)]: refDoc(depthUuid(1)) }), 1);
});

test("provider: 422 component_depth_exceeded → ComponentDepthError with a readable message", async () => {
  const refuse = (async () =>
    new Response(JSON.stringify({ success: false, error: "component_depth_exceeded", message: "depth 6 > 5" }), { status: 422 })) as typeof fetch;
  const p = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, kind: "blocks", fetch: refuse });
  const err = await p.put(PAGE_ID, TREE as never, { ifMatch: "1" }).then(() => null, (e: unknown) => e);
  assert.ok(root.isComponentDepthError(err), `expected ComponentDepthError, got ${String(err)}`);
  assert.equal((err as root.ComponentDepthError).code, "component_depth_exceeded");
  assert.equal((err as root.ComponentDepthError).limit, root.SAUNA_COMPONENT_MAX_DEPTH, "no data → the local limit");
  assert.equal((err as root.ComponentDepthError).depth, null);
  assert.ok((err as Error).message.includes(`at most ${root.SAUNA_COMPONENT_MAX_DEPTH} deep`));

  // The server's numbers win over the local constant.
  const told = (async () =>
    new Response(JSON.stringify({ success: false, error: "component_depth_exceeded", data: { depth: 9, limit: 8, previous: 2 } }), { status: 422 })) as typeof fetch;
  const p2 = createPagesServiceProvider({ apiBaseUrl: "/api", workspaceId: WS, kind: "blocks", fetch: told });
  const err2 = (await p2.put(PAGE_ID, TREE as never, { ifMatch: "1" }).then(() => null, (e: unknown) => e)) as root.ComponentDepthError;
  assert.ok(root.isComponentDepthError(err2));
  assert.deepEqual([err2.depth, err2.limit, err2.previous], [9, 8, 2]);
  assert.ok(err2.message.includes("at most 8 deep"));
});

test("component depth: the default limit is component_max_depth", () => {
  const n = root.SAUNA_COMPONENT_MAX_DEPTH;
  const blocks = chain(n + 1);
  assert.equal(root.saunaCheckComponentDepth({ before: null, after: refDoc(depthUuid(2)), hostBlockId: null, blocks }).ok, true);
  assert.equal(root.saunaCheckComponentDepth({ before: null, after: refDoc(depthUuid(1)), hostBlockId: null, blocks }).ok, false);
});

test("component depth: Refs in every variant branch count", () => {
  const blocks = chain(3);
  const page: root.SaunaSchema = {
    version: 2,
    rootId: "r",
    nodes: {
      r: {
        type: "Ref",
        props: { blockId: depthUuid(3) },
        variants: [{ id: "v", when: { permission: "pages:read" }, props: { blockId: depthUuid(1) } }],
      },
    },
    parents: { r: null },
  };
  assert.equal(root.saunaComponentDepth(page, blocks, null), 3);
});

test("component depth: a cycle in stored data ends the walk", () => {
  const a = depthUuid(1);
  const b = depthUuid(2);
  const blocks = { [a]: refDoc(b), [b]: refDoc(a) };
  assert.equal(root.saunaComponentDepth(refDoc(a), blocks, null), 2);
  assert.equal(root.saunaComponentDepth(blocks[a]!, blocks, a), 2);
  const self = { [a]: refDoc(a) };
  assert.equal(root.saunaComponentChainDepth(a, self), 1);
});

// --- SDL-775: style props of the first-wave Elements ------------------------

const md = (el: React.ReactElement) => renderToStaticMarkup(el);

test("SDL-775: the catalog takes exactly the shaping's enumerations, all optional (a node without them is valid)", () => {
  assert.deepEqual([...root.TEXT_LEVELS], ["display", "h1", "h2", "h3", "lead", "body", "caption"]);
  assert.deepEqual([...root.TEXT_COLORS], ["default", "muted", "primary", "inverse"]);
  assert.deepEqual([...root.TEXT_ALIGNS], ["left", "center", "right"]);
  assert.deepEqual([...root.TEXT_WEIGHTS], ["normal", "medium", "bold"]);
  assert.deepEqual([...root.BOX_BACKGROUNDS], ["none", "surface", "muted"]);
  assert.deepEqual([...root.BOX_RADII], ["theme", "none"]);
  assert.deepEqual([...root.IMAGE_RADII], ["theme", "none", "full"]);
  assert.deepEqual([...root.IMAGE_OFFERED_ASPECTS], ["auto", "1 / 1", "4 / 3", "16 / 9"]);
  for (const a of root.IMAGE_OFFERED_ASPECTS) assert.ok((root.IMAGE_ASPECTS as readonly string[]).includes(a), a);
  const ok = (b: root.BlockDefinition, props: unknown) => b.staticProps?.safeParse(props).success === true;
  // Old nodes parse unchanged; nothing new is written by a parse.
  assert.deepEqual(root.TextBlock.staticProps?.parse({ level: "h1", text: "x" }), { level: "h1", text: "x" });
  assert.deepEqual(root.BoxBlock.staticProps?.parse({}), { direction: "column", gap: 4, padding: 4, align: "stretch" });
  assert.deepEqual(root.ImageBlock.staticProps?.parse({}), { alt: "", fit: "cover", aspect: "auto" });
  // Every value of the shaping is accepted, anything else is refused.
  for (const v of root.TEXT_COLORS) assert.ok(ok(root.TextBlock, { color: v }), v);
  for (const v of root.TEXT_ALIGNS) assert.ok(ok(root.TextBlock, { align: v }), v);
  for (const v of root.TEXT_WEIGHTS) assert.ok(ok(root.TextBlock, { weight: v }), v);
  assert.ok(ok(root.TextBlock, { level: "display" }));
  for (const bad of [{ color: "#f00" }, { align: "justify" }, { weight: 900 }, { level: "h4" }]) assert.ok(!ok(root.TextBlock, bad), JSON.stringify(bad));
  for (const n of [1, 2, 3, 4]) assert.ok(ok(root.BoxBlock, { columns: n }), String(n));
  for (const bad of [{ columns: 0 }, { columns: 5 }, { columns: 2.5 }, { columns: "3" }, { background: "#f00" }, { background: "Red" }, { border: "1px" }, { radius: "lg" }])
    assert.ok(!ok(root.BoxBlock, bad), JSON.stringify(bad));
  for (const v of root.IMAGE_RADII) assert.ok(ok(root.ImageBlock, { radius: v }), v);
  assert.ok(!ok(root.ImageBlock, { radius: "12px" }));
  // The engine keeps all seven aspects valid (stored pages), only four are offered.
  for (const a of root.IMAGE_ASPECTS) assert.ok(ok(root.ImageBlock, { aspect: a }), a);
  const table = root.TableViewElement.schema;
  assert.ok(table.safeParse({ header: true, rows: [["a"]], bordered: true, striped: true, compact: true }).success);
  assert.ok(!table.safeParse({ header: true, rows: [["a"]], bordered: "yes" }).success);
});

test("SDL-775: Text — display is the step above h1, color/align/weight are theme roles and fixed values", () => {
  const display = md(<client.Text level="display" text="Big" />);
  assert.match(display, /^<h1 style="font-size:min\(var\(--pages-text-display, 3\.5rem\), 13cqi\);overflow-wrap:anywhere;font-weight:700/, display);
  assert.equal(md(<client.Text level="body" text="t" color="default" />), md(<client.Text level="body" text="t" />), "default adds nothing");
  assert.match(md(<client.Text text="t" color="muted" />), /color:var\(--muted-foreground\)/);
  assert.match(md(<client.Text text="t" color="primary" />), /color:var\(--primary\)/);
  assert.match(md(<client.Text text="t" color="inverse" />), /color:var\(--background\)/);
  assert.match(md(<client.Text text="t" align="center" />), /text-align:center/);
  assert.match(md(<client.Text text="t" align="right" />), /text-align:right/);
  const h1Normal = md(<client.Text level="h1" text="t" weight="normal" />);
  assert.equal((h1Normal.match(/font-weight:(\d+)/g) ?? []).pop(), "font-weight:400", h1Normal);
  assert.match(md(<client.Text text="t" weight="medium" />), /font-weight:500/);
  assert.match(md(<client.Text text="t" weight="bold" />), /font-weight:700/);
  // A value outside the enumeration draws nothing of its own (never CSS from the page).
  const junk = md(<client.Text text="t" {...({ color: "red;x:y", align: "justify", weight: "900" } as object)} />);
  assert.ok(!/red|justify|900/.test(junk), junk);
});

test("SDL-775 verify: display/h1/h2 shrink with the width (canvas caps 13/10/8 cqi) and wrap a long word; smaller levels as before", () => {
  // The theme's size stays the ceiling: `min(token, cap)`, never a size of our own.
  const caps: Record<string, number | undefined> = { display: 13, h1: 10, h2: 8 };
  for (const level of root.TEXT_LEVELS) {
    const html = md(<client.Text level={level} text="Бронирование" />);
    const token = `var\\(--pages-text-${level}, [0-9.]+rem\\)`;
    if (caps[level]) {
      assert.match(html, new RegExp(`font-size:min\\(${token}, ${caps[level]}cqi\\);overflow-wrap:anywhere;`), `${level}: ${html}`);
    } else {
      assert.match(html, new RegExp(`font-size:${token};`), `${level}: ${html}`);
      assert.ok(!/cqi|overflow-wrap/.test(html), `${level}: ${html}`);
    }
  }
});

test("SDL-775: Box — columns are an equal grid that stacks below 640px; background, border, radius from tokens", () => {
  const three = md(<client.Box columns={3}><p>a</p><p>b</p><p>c</p></client.Box>);
  assert.match(three, /data-pages-columns="3"/, three);
  assert.match(three, /display:grid/, three);
  assert.ok(!/flex-direction/.test(three), three);
  assert.ok(three.includes(client.BOX_COLUMNS_RULE.replace(/>/g, "&gt;")) || three.includes(client.BOX_COLUMNS_RULE), three);
  assert.match(client.BOX_COLUMNS_RULE, /\[data-pages-columns\]\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(client.BOX_COLUMNS_RULE, /@media \(min-width:640px\)\{.*\[data-pages-columns="3"\]\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(client.BOX_COLUMNS_RULE, /@media \(min-width:1024px\)\{\[data-pages-columns="4"\]\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\}/);
  // A row with columns is a grid, not a flex row: no row rule.
  assert.ok(!md(<client.Box direction="row" columns={2} />).includes("data-pages-row"));
  // Out of range = no grid, the box as before.
  assert.equal(md(<client.Box {...({ columns: 7 } as object)} />), md(<client.Box />));
  assert.match(md(<client.Box background="surface" />), /background:var\(--card\).*box-shadow:var\(--surface-shadow, none\)/);
  assert.match(md(<client.Box background="muted" />), /background:var\(--muted\)/);
  assert.equal(md(<client.Box background="none" />), md(<client.Box />));
  const framed = md(<client.Box border />);
  assert.match(framed, /border:1px solid var\(--border\)/, framed);
  assert.match(framed, /border-radius:var\(--radius-large, var\(--radius\)\)/, "a framed box takes the theme corner");
  assert.match(md(<client.Box border radius="none" />), /border-radius:0px/);
  assert.ok(!/border-radius/.test(md(<client.Box />)), "an unframed box without radius has no corner");
});

test("SDL-775: Image — radius theme/none/full on the picture and on the empty frame; absent = as before", () => {
  const src = "https://cdn.example/a.png";
  assert.match(md(<client.Image src={src} radius="theme" />), /border-radius:var\(--radius-large, var\(--radius\)\)/);
  assert.match(md(<client.Image src={src} radius="none" />), /border-radius:0px/);
  assert.match(md(<client.Image src={src} radius="full" />), /border-radius:9999px/);
  assert.ok(!/border-radius/.test(md(<client.Image src={src} />)));
  assert.match(md(<client.Image radius="full" />), /border-radius:9999px/);
  assert.match(md(<client.Image />), /border-radius:var\(--radius\)/);
  assert.match(md(<client.Image src={src} aspect="16 / 9" radius="full" />), /aspect-ratio:16 \/ 9.*border-radius:9999px/);
});

test("SDL-775: prototype keys (constructor, __proto__, toString) as values give no CSS", () => {
  const src = "https://cdn.example/a.png";
  for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    const text = md(<client.Text text="t" {...({ color: k, weight: k } as object)} />);
    // SDL-950: a key of the custom-colour rule (`constructor`, `toString`) is a
    // theme colour key — it may only ever become `var(--pages-color-<key>)`.
    const custom = root.isThemeColorKey(k);
    if (custom) assert.equal(text, md(<client.Text text="t" color={k} />), `Text ${k}: ${text}`);
    else assert.equal(text, md(<client.Text text="t" />), `Text ${k}: ${text}`);
    assert.equal(md(<client.Image src={src} {...({ radius: k } as object)} />), md(<client.Image src={src} />), `Image ${k}`);
    assert.equal(md(<client.Image {...({ radius: k } as object)} />), md(<client.Image />), `empty Image ${k}`);
    const box = md(<client.Box {...({ background: k } as object)} />);
    if (custom) assert.match(box, new RegExp(`background:var\\(--pages-color-${k}\\)`), `Box ${k}`);
    else assert.equal(box, md(<client.Box />), `Box ${k}`);
    for (const html of [text, md(<client.Image src={src} {...({ radius: k } as object)} />), md(<client.Box {...({ background: k } as object)} />)]) {
      assert.ok(!/function|\[object|native code/.test(html), html);
    }
  }
});

test("SDL-775: TableView — bordered, striped and compact style the kit's parts; none set = the table as before", () => {
  const rows = [["H1", "H2"], ["a", "b"], ["c", "d"], ["e", "f"]];
  const draw = (extra: Record<string, unknown>) =>
    md(<SaunaRenderer registry={COMPOUND_REGISTRY} schema={one("TableView", { header: true, rows, ...extra })} />);
  const plain = draw({});
  assert.ok(!/style=/.test(plain), plain);
  assert.equal(draw({ bordered: false, striped: false, compact: false }), plain);
  const bordered = draw({ bordered: true });
  assert.match(bordered, /data-part="Table"[^>]*style="border-collapse:collapse"/, bordered);
  assert.equal((bordered.match(/border:1px solid var\(--border\)/g) ?? []).length, 8, "every head and body cell");
  const striped = draw({ striped: true });
  const stripes = striped.match(/data-part="TableRow" style="background:var\(--muted\)"/g) ?? [];
  assert.equal(stripes.length, 1, `every second BODY row (3 body rows → 1): ${striped}`);
  const compact = draw({ compact: true });
  assert.equal((compact.match(/padding:0\.25rem 0\.5rem/g) ?? []).length, 8, compact);
  assert.match(compact, /data-part="TableHead" style="padding:0\.25rem 0\.5rem;height:auto"/, compact);
});

// --- SDL-950: custom theme colour keys on colour props ---------------------

test("SDL-950: Text.color / Box.background take a custom theme colour key; reserved words and colour values are refused", () => {
  const ok = (b: root.BlockDefinition, props: unknown) => b.staticProps?.safeParse(props).success === true;
  for (const key of ["brandBlue", "accent-2", "x", "sea_foam", "a".repeat(32)]) {
    assert.ok(root.isThemeColorKey(key), key);
    assert.ok(ok(root.TextBlock, { color: key }), `Text ${key}`);
    assert.ok(ok(root.BoxBlock, { background: key }), `Box ${key}`);
  }
  // Built-ins still parse, to themselves.
  for (const v of root.TEXT_COLORS) assert.equal(root.TextBlock.staticProps?.parse({ color: v }).color, v);
  for (const v of root.BOX_BACKGROUNDS) assert.equal(root.BoxBlock.staticProps?.parse({ background: v }).background, v);
  // pages-service ThemeReservedColorKeys (case-insensitive) and malformed keys.
  for (const bad of [...root.THEME_RESERVED_COLOR_KEYS, "TextMuted", "Transparent", "#f00", "Red", "1a", "a b", "a".repeat(33), "", "brand.blue"]) {
    assert.ok(!root.isThemeColorKey(bad), bad);
    if ((root.TEXT_COLORS as readonly string[]).includes(bad) || (root.BOX_BACKGROUNDS as readonly string[]).includes(bad)) continue;
    assert.ok(!ok(root.BoxBlock, { background: bad }), `Box ${bad}`);
  }
  assert.ok(!ok(root.TextBlock, { color: "textMuted" }), "a role that is not a Text value stays refused (as on pages-service)");
  assert.ok(!ok(root.TextBlock, { color: "surface" }));
});

test("SDL-950: a custom key renders var(--pages-color-<key>) with the prop's default as the fallback; old nodes unchanged", () => {
  assert.match(md(<client.Text text="x" color="brandBlue" />), /color:var\(--pages-color-brandBlue\)/);
  assert.match(md(<client.Text level="caption" text="x" color="brandBlue" />), /color:var\(--pages-color-brandBlue, var\(--muted-foreground\)\)/);
  assert.match(md(<client.Box background="brandBlue" />), /background:var\(--pages-color-brandBlue\)/);
  // Built-ins and absent: byte for byte as before.
  assert.equal(md(<client.Text text="x" color="default" />), md(<client.Text text="x" />));
  assert.match(md(<client.Text text="x" color="primary" />), /color:var\(--primary\)/);
  assert.equal(md(<client.Box background="none" />), md(<client.Box />));
  // Garbage that slipped past a schema (a stored page read leniently) adds nothing.
  for (const bad of ["#f00", "red;x:y", "inherit", "__proto__", "Red"]) {
    assert.equal(md(<client.Text text="x" {...({ color: bad } as object)} />), md(<client.Text text="x" />), bad);
    assert.equal(md(<client.Box {...({ background: bad } as object)} />), md(<client.Box />), bad);
  }
  // A page that uses a key the theme no longer has still validates and renders (no error, no throw).
  const page = {
    version: 2 as const,
    rootId: "r",
    nodes: { r: { type: "Box", props: { background: "gone" }, children: ["t"] }, t: { type: "Text", props: { text: "Hi", color: "gone" } } },
    parents: { r: null, t: "r" },
  };
  assert.ok(root.validateSaunaSchema(page).ok, "unknown-to-the-theme key validates");
  const html = md(<SaunaRenderer schema={root.migrateSaunaSchema(page)} registry={client.PRIMITIVE_REGISTRY} />);
  assert.ok(html.includes("var(--pages-color-gone)") && html.includes("Hi"), html);
});

// --- SDL-951: Image focus point, width, border, shadow -----------------------

const IMG = "https://cdn.example/a.png";

test("SDL-951: Image takes focus/width/fixedWidth/border/borderColor/shadow, all optional; an old node parses unchanged", () => {
  const schema = root.ImageBlock.staticProps!;
  const ok = (props: unknown) => schema.safeParse(props).success;
  // An old stored node: nothing new is written by a parse.
  const old = { src: IMG, alt: "Cup", fit: "cover", aspect: "16 / 9", radius: "theme" };
  assert.deepEqual(schema.parse(old), old);
  assert.deepEqual(schema.parse({}), { alt: "", fit: "cover", aspect: "auto" });
  assert.deepEqual([...root.IMAGE_WIDTHS], ["fill", "hug", "fixed"]);
  assert.deepEqual([...root.IMAGE_BORDER_COLORS], ["background", "surface", "muted", "text", "textMuted", "primary", "primaryForeground", "border"]);
  const full = { src: IMG, focus: { x: 50, y: 62 }, width: "fixed", fixedWidth: 480, border: true, borderColor: "primary", shadow: true };
  assert.deepEqual(schema.parse(full), { alt: "", fit: "cover", aspect: "auto", ...full });
  for (const w of root.IMAGE_WIDTHS) assert.ok(ok({ width: w }), w);
  for (const c of root.IMAGE_BORDER_COLORS) assert.ok(ok({ border: true, borderColor: c }), c);
  for (const good of [{ focus: { x: 0, y: 100 } }, { focus: { x: 33.5, y: 0 } }, { fixedWidth: 40 }, { fixedWidth: 4000 }, { border: false }, { shadow: false }])
    assert.ok(ok(good), JSON.stringify(good));
  for (const bad of [
    { focus: { x: -1, y: 50 } },
    { focus: { x: 50, y: 101 } },
    { focus: { x: 50 } },
    { focus: "50,50" },
    { width: "auto" },
    { fixedWidth: 39 },
    { fixedWidth: 4001 },
    { fixedWidth: 120.5 },
    { border: "1px" },
    { borderColor: "#f00" },
    { borderColor: "red" },
    { shadow: "0 1px 2px black" },
  ])
    assert.ok(!ok(bad), JSON.stringify(bad));
});

test("SDL-951: an old page JSON renders byte for byte as before (absent and off = no new CSS)", () => {
  // Pinned output of the pre-SDL-951 Image (f12ed9b) for an old node, picture and empty frame.
  const page = {
    version: 2 as const,
    rootId: "r",
    nodes: {
      r: { type: "Box", props: {}, children: ["a", "b", "c"] },
      a: { type: "Image", props: { src: IMG, alt: "A", fit: "contain", aspect: "4 / 3", radius: "full" } },
      b: { type: "Image", props: { src: IMG, alt: "B" } },
      c: { type: "Image", props: { alt: "C" } },
    },
    parents: { r: null, a: "r", b: "r", c: "r" },
  };
  assert.ok(root.validateSaunaSchema(page).ok, "the old page validates");
  const html = md(<SaunaRenderer schema={root.migrateSaunaSchema(page)} registry={client.PRIMITIVE_REGISTRY} />);
  assert.ok(html.includes(
    '<img src="https://cdn.example/a.png" alt="A" loading="lazy" style="display:block;width:100%;aspect-ratio:4 / 3;max-width:100%;min-width:0;height:auto;object-fit:contain;border-radius:9999px"/>'
  ), html);
  assert.ok(html.includes(
    '<img src="https://cdn.example/a.png" alt="B" loading="lazy" style="display:block;max-width:100%;min-width:0;height:auto;object-fit:cover"/>'
  ), html);
  assert.ok(html.includes(
    'role="img" aria-label="C" data-pages-primitive="image-empty" style="display:flex;align-items:center;justify-content:center;width:100%;max-width:100%;min-width:0;aspect-ratio:16 / 9;border:1px dashed var(--border);border-radius:var(--radius);background:var(--muted);color:var(--muted-foreground)"'
  ), html);
  // Explicit off values draw the same as absent.
  assert.equal(md(<client.Image src={IMG} border={false} shadow={false} />), md(<client.Image src={IMG} />));
  assert.equal(md(<client.Image border={false} shadow={false} />), md(<client.Image />));
});

test("SDL-951: focus → object-position x% y% in SSR markup; out of range or malformed = none", () => {
  const page = {
    version: 2 as const,
    rootId: "i",
    nodes: { i: { type: "Image", props: { src: IMG, aspect: "16 / 9", fit: "cover", focus: { x: 50, y: 62 } } } },
    parents: { i: null },
  };
  assert.ok(root.validateSaunaSchema(page).ok);
  const html = md(<SaunaRenderer schema={page} registry={client.PRIMITIVE_REGISTRY} />);
  assert.match(html, /object-fit:cover;object-position:50% 62%/, html);
  assert.match(md(<client.Image src={IMG} focus={{ x: 0, y: 100 }} />), /object-position:0% 100%/);
  assert.match(md(<client.Image src={IMG} focus={{ x: 12.5, y: 7 }} />), /object-position:12\.5% 7%/);
  for (const bad of [{ x: 150, y: 50 }, { x: 50 }, { x: "50", y: "50" }, "50,50", { x: Number.NaN, y: 1 }])
    assert.equal(md(<client.Image src={IMG} {...({ focus: bad } as object)} />), md(<client.Image src={IMG} />), JSON.stringify(bad));
  // The empty frame has nothing to position.
  assert.equal(md(<client.Image focus={{ x: 10, y: 10 }} />), md(<client.Image />));
});

test("SDL-951: width fill / hug / fixed → 100% / auto / Npx, never past the container", () => {
  const fill = md(<client.Image src={IMG} width="fill" />);
  assert.match(fill, /style="display:block;max-width:100%;min-width:0;height:auto;object-fit:cover;width:100%"/, fill);
  // hug overrides the framed 100% with the picture's own width.
  const hug = md(<client.Image src={IMG} aspect="1 / 1" width="hug" />);
  assert.match(hug, /display:block;width:auto;aspect-ratio:1 \/ 1;max-width:100%/, hug);
  assert.ok(!/width:100%/.test(hug.replace("max-width:100%", "")), hug);
  const fixed = md(<client.Image src={IMG} width="fixed" fixedWidth={320} />);
  assert.match(fixed, /max-width:100%.*width:320px/, fixed);
  assert.match(md(<client.Image src={IMG} width="fixed" />), /width:480px/, "fixed without fixedWidth = the prototype's 480");
  assert.match(md(<client.Image src={IMG} width="fixed" {...({ fixedWidth: 10 } as object)} />), /width:480px/, "out of range falls back");
  // fixedWidth without width=fixed draws nothing.
  assert.equal(md(<client.Image src={IMG} fixedWidth={320} />), md(<client.Image src={IMG} />));
  // A value outside the enumeration adds no CSS (it stays a plain attribute, as on base — see the review test).
  const junk = md(<client.Image src={IMG} {...({ width: "constructor" } as object)} />);
  assert.equal(junk.replace(' width="constructor"', ""), md(<client.Image src={IMG} />), junk);
  // The empty frame: fixed is Npx, fill and hug keep its full width.
  assert.match(md(<client.Image width="fixed" fixedWidth={200} />), /width:200px;max-width:100%/);
  assert.equal(md(<client.Image width="hug" />), md(<client.Image />));
});

test("SDL-951: border and shadow take the theme's CSS variables, never a value of their own", () => {
  const b = md(<client.Image src={IMG} border />);
  assert.match(b, /border:1px solid var\(--border\)/, b);
  assert.match(md(<client.Image src={IMG} border borderColor="primary" />), /border:1px solid var\(--primary\)/);
  assert.match(md(<client.Image src={IMG} border borderColor="textMuted" />), /border:1px solid var\(--muted-foreground\)/);
  assert.match(md(<client.Image src={IMG} border borderColor="surface" />), /border:1px solid var\(--card\)/);
  for (const k of ["constructor", "__proto__", "#f00"])
    assert.match(md(<client.Image src={IMG} border {...({ borderColor: k } as object)} />), /border:1px solid var\(--border\)"/, k);
  // borderColor without border draws nothing.
  assert.equal(md(<client.Image src={IMG} borderColor="primary" />), md(<client.Image src={IMG} />));
  const s = md(<client.Image src={IMG} shadow />);
  assert.match(s, /box-shadow:var\(--elevated-shadow, none\)/, s);
  // On the empty frame the border replaces the dashed placeholder line.
  const empty = md(<client.Image border borderColor="primary" shadow />);
  assert.match(empty, /border:1px solid var\(--primary\)/, empty);
  assert.ok(!/dashed/.test(empty), empty);
  assert.match(empty, /box-shadow:var\(--elevated-shadow, none\)/, empty);
  // Corners stay as they were next to the new props.
  assert.match(md(<client.Image src={IMG} radius="full" border shadow />), /border-radius:9999px;border:1px solid var\(--border\);box-shadow:/);
});

test("SDL-951 review: a raw width / border outside the schema still reaches the element as an attribute, as on base", () => {
  // Pinned base (f12ed9b) output: the props were plain rest props, i.e. HTML attributes.
  assert.equal(
    md(<client.Image src={IMG} {...({ width: 300 } as object)} />),
    '<img src="https://cdn.example/a.png" alt="" loading="lazy" style="display:block;max-width:100%;min-width:0;height:auto;object-fit:cover" width="300"/>'
  );
  assert.equal(
    md(<client.Image src={IMG} {...({ border: 1 } as object)} />),
    '<img src="https://cdn.example/a.png" alt="" loading="lazy" style="display:block;max-width:100%;min-width:0;height:auto;object-fit:cover" border="1"/>'
  );
  assert.match(md(<client.Image {...({ width: "300", border: "2" } as object)} />), /color:var\(--muted-foreground\)" width="300" border="2">/);
  // Schema values are consumed, never written as attributes.
  assert.ok(!/ width="| border="/.test(md(<client.Image src={IMG} width="fill" border />)));
});

test("SDL-951: the props JSON Schema the MCP catalog serves describes the new Image props", () => {
  const js = z.toJSONSchema(root.ImageBlock.staticProps!, { io: "input" }) as {
    properties: Record<string, { type?: string; enum?: string[]; description?: string; minimum?: number; maximum?: number; properties?: Record<string, { minimum?: number; maximum?: number }> }>;
  };
  const p = js.properties;
  for (const k of ["focus", "width", "fixedWidth", "border", "borderColor", "shadow"]) {
    assert.ok(p[k], k);
    assert.ok((p[k]!.description ?? "").length > 10, `${k} has a description`);
  }
  assert.deepEqual(p.width!.enum, ["fill", "hug", "fixed"]);
  assert.deepEqual(p.borderColor!.enum, [...root.IMAGE_BORDER_COLORS]);
  assert.equal(p.border!.type, "boolean");
  assert.equal(p.shadow!.type, "boolean");
  assert.equal(p.fixedWidth!.minimum, 40);
  assert.equal(p.fixedWidth!.maximum, 4000);
  assert.deepEqual(p.focus!.properties!.x, { ...p.focus!.properties!.x, minimum: 0, maximum: 100 });
  assert.deepEqual(p.focus!.properties!.y, { ...p.focus!.properties!.y, minimum: 0, maximum: 100 });
  // Old props keep their schema: no description added, defaults as before.
  assert.equal(p.radius!.description, undefined);
  assert.deepEqual(p.radius!.enum, ["theme", "none", "full"]);
});

// --- run ------------------------------------------------------------------

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ok   ${t.name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${t.name}\n       ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
