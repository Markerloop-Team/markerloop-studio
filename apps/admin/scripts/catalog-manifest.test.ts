// Unit test of the Element catalog manifest (SDL-668). The admin has no unit
// runner, so this is node:test under tsx, run by `smoke:pages`:
//
//   pnpm --filter admin catalog:manifest:test
//
// What it pins: catalogVersion moves with a props contract (propsVersion, a
// type added or removed) and does NOT move with how a component draws, its
// catalog meta, or the order of the blocks; the output is byte-stable; and the
// freshness check fails on a planted propsVersion bump with the type's name.
// SDL-670: a bump without its migration fails the BUILD, migrations land in
// the manifest as data and move catalogVersion.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { registerElementMigration, type BlockDefinition } from "@markerloop/engine";
import { createPagesElementSet } from "@markerloop/studio/catalog";
import { PAGES_BLOCKS } from "@/widgets/pages/catalog";
import { PAGES_CATALOG_VERSION } from "@/widgets/pages/catalog-version";

import {
  buildElementCatalog,
  canonicalJson,
  catalogVersionOf,
  checkElementCatalog,
  serializeElementCatalog,
} from "./element-catalog";

const FILE = path.resolve(__dirname, "../src/widgets/pages/element-catalog.json");
const base = buildElementCatalog(PAGES_BLOCKS);
const pick = (type: string) => {
  const found = PAGES_BLOCKS.find((b) => b.type === type);
  assert.ok(found, `${type} is in PAGES_BLOCKS`);
  return found;
};
const withBlock = (type: string, patch: Partial<BlockDefinition>) =>
  PAGES_BLOCKS.map((b) => (b.type === type ? { ...b, ...patch } : b));
/** A legal bump to v2: the version together with its (empty) migration. */
const V2: Partial<BlockDefinition> = { propsVersion: 2, migrations: [{ steps: [] }] };

test("the catalog is not empty and every Element is at an integer version", () => {
  const types = Object.keys(base.elements);
  assert.ok(types.length >= 50, `expected the full pages catalog, got ${types.length} elements`);
  for (const type of ["Page", "Section", "Text", "Image", "Box", "Link", "DataView"]) {
    assert.ok(type in base.elements, `${type} is in the manifest`);
  }
  for (const [type, entry] of Object.entries(base.elements)) {
    assert.ok(Number.isInteger(entry.propsVersion) && entry.propsVersion >= 1, `${type}.propsVersion`);
    assert.deepEqual(entry.migrations, [], `${type}.migrations`);
  }
  assert.match(base.catalogVersion, /^[0-9a-f]{64}$/);
});

test("catalogVersion is sha256 of the canonical form without catalogVersion", () => {
  const { catalogVersion, ...rest } = base;
  assert.equal(catalogVersionOf(rest.elements), catalogVersion);
  // canonical: sorted keys at every depth, no whitespace
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 0 }], c: "x" } }), '{"a":{"c":"x","d":[2,{"y":0,"z":1}]},"b":1}');
  const text = canonicalJson(rest);
  assert.ok(text.startsWith('{"elements":{'), text.slice(0, 40));
  assert.ok(!/\s/.test(text), "canonical form has no whitespace");
});

test("the output is byte-stable and independent of block order", () => {
  const once = serializeElementCatalog(buildElementCatalog(PAGES_BLOCKS));
  const twice = serializeElementCatalog(buildElementCatalog(PAGES_BLOCKS));
  assert.equal(once, twice);
  const reversed = serializeElementCatalog(buildElementCatalog([...PAGES_BLOCKS].reverse()));
  assert.equal(reversed, once);
});

test("catalogVersion changes when an Element's propsVersion changes", () => {
  for (const type of ["DataView", "Text", "Page"]) {
    const bumped = buildElementCatalog(withBlock(type, V2));
    assert.equal(bumped.elements[type].propsVersion, 2);
    assert.notEqual(bumped.catalogVersion, base.catalogVersion, `${type} 1 -> 2 must move catalogVersion`);
  }
  // explicit 1 is the same contract as an absent propsVersion
  const explicitOne = buildElementCatalog(withBlock("Text", { propsVersion: 1 }));
  assert.equal(explicitOne.catalogVersion, base.catalogVersion);
});

test("catalogVersion changes when an Element is added or removed", () => {
  const removed = buildElementCatalog(PAGES_BLOCKS.filter((b) => b.type !== "Link"));
  assert.notEqual(removed.catalogVersion, base.catalogVersion);
  const added = buildElementCatalog([...PAGES_BLOCKS, { type: "ProbeElement" }]);
  assert.notEqual(added.catalogVersion, base.catalogVersion);
});

test("catalogVersion does NOT change when a component's markup changes", () => {
  // A different component drawing DataView: the admin's live one vs a plain stub.
  function OtherDataView() {
    return null;
  }
  const other = createPagesElementSet({ dataView: OtherDataView });
  assert.notEqual(other.registry.DataView, undefined);
  assert.equal(buildElementCatalog(other.blocks).catalogVersion, base.catalogVersion);
  // The studio's default set (engine's static DataView frame) — same catalog too.
  assert.equal(buildElementCatalog(createPagesElementSet({}).blocks).catalogVersion, base.catalogVersion);
  // Catalog meta and display name are presentation, not the props contract.
  const text = pick("Text");
  const restyled = withBlock("Text", {
    displayName: "Text (restyled)",
    meta: { ...text.meta, description: "Drawn differently now", icon: "other" },
  });
  assert.equal(buildElementCatalog(restyled).catalogVersion, base.catalogVersion);
});

test("the committed element-catalog.json is fresh and the runtime export matches it", () => {
  const committed = readFileSync(FILE, "utf8");
  const result = checkElementCatalog(committed, base, "element-catalog.json", "regen");
  assert.deepEqual(result, { ok: true });
  assert.equal(PAGES_CATALOG_VERSION, base.catalogVersion);
});

test("planted: propsVersion 2 on an Element without regenerating fails the check by type name", () => {
  const committed = readFileSync(FILE, "utf8");
  for (const type of ["DataView", "Section", "Button"]) {
    pick(type);
    const fresh = buildElementCatalog(withBlock(type, V2));
    const result = checkElementCatalog(committed, fresh, "element-catalog.json", "regen");
    assert.equal(result.ok, false, `${type} bumped without regeneration must fail`);
    if (!result.ok) {
      assert.match(result.message, new RegExp(`\\b${type}: propsVersion 1 -> 2\\b`));
      assert.match(result.message, /is stale/);
    }
  }
  // A hand-edited hash and pure reformatting are caught too.
  const edited = committed.replace(base.catalogVersion, "0".repeat(64));
  const hashResult = checkElementCatalog(edited, base, "element-catalog.json", "regen");
  assert.equal(hashResult.ok, false);
  if (!hashResult.ok) assert.match(hashResult.message, /catalogVersion: 0{64} -> /);
  const reformatted = `${JSON.stringify(JSON.parse(committed))}\n`;
  const formatResult = checkElementCatalog(reformatted, base, "element-catalog.json", "regen");
  assert.equal(formatResult.ok, false);
  if (!formatResult.ok) assert.match(formatResult.message, /formatting only/);
  const missing = checkElementCatalog(null, base, "element-catalog.json", "regen");
  assert.equal(missing.ok, false);
});

// --- SDL-670: declarative migrations in the manifest -------------------------

test("planted: propsVersion 2 without a migration fails the catalog build, naming the type", () => {
  for (const type of ["DataView", "Text", "Button"]) {
    pick(type);
    assert.throws(
      () => buildElementCatalog(withBlock(type, { propsVersion: 2 })),
      new RegExp(`${type}: propsVersion 2 needs exactly 1 migration.*\\(migration_count\\)`),
      `${type} at v2 without a migration must not build`
    );
  }
  assert.throws(() => buildElementCatalog(withBlock("Text", { propsVersion: 3, migrations: [{ steps: [] }] })), /migration_count/);
});

test("migrations land in the manifest as data and move catalogVersion", () => {
  const steps = [
    { op: "rename", from: "text", to: "content" },
    { op: "setDefault", key: "size", value: "md" },
  ] as const;
  const migrated = buildElementCatalog(withBlock("Text", { propsVersion: 2, migrations: [{ steps }] }));
  assert.deepEqual(migrated.elements.Text, { propsVersion: 2, migrations: [{ steps: [...steps] }] });
  const empty = buildElementCatalog(withBlock("Text", V2));
  assert.notEqual(migrated.catalogVersion, empty.catalogVersion, "a different migration is a different contract");
  // Every live Element is still v1 without migrations.
  for (const [type, entry] of Object.entries(base.elements)) {
    assert.deepEqual(entry, { propsVersion: 1, migrations: [] }, `${type} moved`);
  }
});

test("a custom step needs a registered TS implementation to reach the manifest", () => {
  const custom = withBlock("Text", { propsVersion: 2, migrations: [{ steps: [{ op: "custom", id: "catalog-test.unregistered" }] }] });
  assert.throws(() => buildElementCatalog(custom), /catalog-test\.unregistered.*\(unknown_custom\)/);
  registerElementMigration("catalog-test.registered", (node) => node);
  const ok = buildElementCatalog(withBlock("Text", { propsVersion: 2, migrations: [{ steps: [{ op: "custom", id: "catalog-test.registered" }] }] }));
  assert.deepEqual(ok.elements.Text.migrations, [{ steps: [{ op: "custom", id: "catalog-test.registered" }] }]);
});

test("a step field its op does not take, or a non-JSON value, never reaches the manifest", () => {
  const extra = withBlock("Text", { propsVersion: 2, migrations: [{ steps: [{ op: "remove", key: "a", note: "x" } as never] }] });
  assert.throws(() => buildElementCatalog(extra), /remove does not take note.*\(invalid_step\)/);
  const nan = withBlock("Text", { propsVersion: 2, migrations: [{ steps: [{ op: "setDefault", key: "a", value: Number.NaN }] }] });
  assert.throws(() => buildElementCatalog(nan), /\(invalid_step\)/);
});
