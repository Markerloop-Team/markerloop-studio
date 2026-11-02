// Test of the Element catalog document and GET /api/element-catalog (SDL-696).
// node:test under tsx (the admin has no unit runner), run by `smoke:pages`:
//
//   pnpm --filter admin catalog:api:test
//
// What it pins: the served document lists exactly the Elements of PAGES_BLOCKS
// and of element-catalog.json, at the same propsVersion and catalogVersion;
// every props schema is a valid draft 2020-12 schema (Ajv's 2020 meta-schema,
// strict) and agrees with zod on the examples; an Element without a schema is
// refused (planted); the route answers 200 with the committed bytes and an
// ETag, and 304 on a matching If-None-Match.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020";
import type { BlockDefinition } from "@markerloop/engine";
import { PAGES_BLOCKS as STUDIO_BLOCKS, PAGES_PROPS_MANIFEST } from "@markerloop/studio/catalog";
import { PAGES_BLOCKS } from "@/widgets/pages/catalog";
import { PAGES_CATALOG_VERSION } from "@/widgets/pages/catalog-version";
import elementCatalog from "@/widgets/pages/element-catalog.json";
import {
  ELEMENT_CATALOG_SCHEMA_DIALECT,
  buildElementCatalogDocument,
  checkElementCatalogDocument,
  elementCatalogDocumentProblems,
  refinedPaths,
  serializeElementCatalogDocument,
  type ElementCatalogApiDocument,
} from "@/widgets/pages/element-catalog-api";
import { GET } from "@/app/api/element-catalog/route";

const FILE = path.resolve(__dirname, "../src/widgets/pages/element-catalog-api.json");
const committedText = readFileSync(FILE, "utf8");
const committed = JSON.parse(committedText) as ElementCatalogApiDocument;
const build = (blocks: readonly BlockDefinition[]) =>
  buildElementCatalogDocument({ blocks, propsManifest: PAGES_PROPS_MANIFEST, catalogVersion: PAGES_CATALOG_VERSION });
const fresh = build(STUDIO_BLOCKS);
const typesOf = (doc: ElementCatalogApiDocument) => doc.elements.map((e) => e.type);
const sorted = (list: Iterable<string>) => [...list].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

test("composition: the document lists exactly the Elements of PAGES_BLOCKS and element-catalog.json", () => {
  const types = typesOf(committed);
  assert.ok(types.length >= 50, `expected the full pages catalog, got ${types.length}`);
  assert.deepEqual(types, sorted(types), "Elements are sorted by type");
  assert.deepEqual(types, sorted(PAGES_BLOCKS.map((b) => b.type)), "= the admin's PAGES_BLOCKS");
  assert.deepEqual(types, sorted(STUDIO_BLOCKS.map((b) => b.type)), "= @markerloop/studio/catalog PAGES_BLOCKS");
  assert.deepEqual(types, sorted(Object.keys(elementCatalog.elements)), "= element-catalog.json");
  for (const type of ["Page", "Section", "Text", "Image", "Box", "Link", "DataView"]) {
    assert.ok(types.includes(type), `${type} is served`);
  }
  assert.equal(committed.catalogVersion, PAGES_CATALOG_VERSION, "catalogVersion = /api/health pagesCatalogVersion");
  assert.equal(committed.jsonSchemaDialect, ELEMENT_CATALOG_SCHEMA_DIALECT);
  assert.deepEqual(elementCatalogDocumentProblems(committed, elementCatalog), []);
});

test("the committed document is the fresh one, byte for byte", () => {
  assert.equal(committedText, serializeElementCatalogDocument(fresh), "run `pnpm --filter admin catalog:api`");
  // The admin's set differs from the package default only in what draws
  // DataView — the definitions, and so the document, are the same.
  assert.equal(serializeElementCatalogDocument(build(PAGES_BLOCKS)), committedText);
});

test("every props schema is valid draft 2020-12 and compiles (Ajv, strict)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
  // The meta-schema check bites: a schema that is not draft 2020-12 is refused.
  assert.equal(ajv.validateSchema({ $schema: ELEMENT_CATALOG_SCHEMA_DIALECT, type: "object", required: "title" }), false);
  for (const element of committed.elements) {
    assert.ok(element.propsSchema, `${element.type} has a props schema`);
    assert.equal(element.propsSchema.$schema, ELEMENT_CATALOG_SCHEMA_DIALECT, `${element.type} dialect`);
    const valid = ajv.validateSchema(element.propsSchema);
    assert.ok(valid, `${element.type}: ${ajv.errorsText(ajv.errors)}`);
    assert.doesNotThrow(() => ajv.compile(element.propsSchema!), `${element.type} compiles`);
  }
});

test("examples: JSON Schema and zod agree, and exampleMissing says why one is incomplete", () => {
  const ajv = new Ajv2020({ strict: true, validateFormats: false });
  const blocks = new Map(STUDIO_BLOCKS.map((b) => [b.type, b]));
  for (const element of committed.elements) {
    const validate = ajv.compile(element.propsSchema!);
    const byJsonSchema = validate(element.example.props) as boolean;
    const byZod = blocks.get(element.type)!.staticProps!.safeParse(element.example.props).success;
    assert.equal(byJsonSchema, byZod, `${element.type}: JSON Schema says ${byJsonSchema}, zod says ${byZod}`);
    assert.equal(byZod, element.exampleMissing.length === 0, `${element.type}: exampleMissing ${JSON.stringify(element.exampleMissing)}`);
    assert.equal(element.example.type, element.type);
    assert.equal(element.example.propsVersion, element.propsVersion);
  }
  // A missing required prop is caught by the JSON Schema too, not only by zod.
  const dataView = committed.elements.find((e) => e.type === "DataView")!;
  assert.deepEqual(dataView.exampleMissing, ["source"]);
  assert.ok(committed.elements.every((e) => !e.exampleMissing.includes("")), "no unnamed missing prop");
});

// The Elements whose example may fail its own schema, each with the props it
// lacks and why. Nothing else may: an example is the node the editor inserts,
// so a failing one is a node the editor writes invalid (SDL-696 — ListHeader
// shipped without its required `title`).
const EXAMPLE_INCOMPLETE: Readonly<Record<string, readonly string[]>> = {
  // A fresh DataView is unbound on purpose (DATA_VIEW_INITIAL_PROPS): a
  // placeholder collection id would validate a node that can never fetch.
  DataView: ["source"],
  // A Ref is never inserted empty (SDL-718, `insertable: false`): its
  // `blockId` is the id pages-service issued for a picked Component, and a
  // placeholder UUID would describe a reference to nothing.
  Ref: ["blockId"],
};

test("examples: every example passes its props schema (Ajv 2020, strict), except the listed unbound ones", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
  const failing: string[] = [];
  for (const element of committed.elements) {
    const validate = ajv.compile(element.propsSchema!);
    const valid = validate(element.example.props) as boolean;
    const allowed = EXAMPLE_INCOMPLETE[element.type];
    if (allowed) {
      assert.equal(valid, false, `${element.type} is listed in EXAMPLE_INCOMPLETE but its example is valid — drop it from the list`);
      assert.deepEqual(element.exampleMissing, [...allowed], `${element.type}.exampleMissing`);
    } else if (!valid) {
      failing.push(`${element.type}: ${ajv.errorsText(validate.errors)}`);
    }
  }
  assert.deepEqual(failing, [], "examples that fail their own props schema");
});

test("planted: an example without a required prop is caught", () => {
  const listHeader = STUDIO_BLOCKS.find((b) => b.type === "ListHeader")!;
  const { title: _title, ...props } = listHeader.meta!.initialProps!;
  void _title;
  const planted = STUDIO_BLOCKS.map((b) =>
    b.type === "ListHeader" ? { ...b, meta: { ...b.meta, initialProps: props } } : b,
  );
  const element = build(planted).elements.find((e) => e.type === "ListHeader")!;
  assert.deepEqual(element.exampleMissing, ["title"]);
  const ajv = new Ajv2020({ strict: true, validateFormats: false });
  assert.equal(ajv.compile(element.propsSchema!)(element.example.props), false);
});

test("manifest-derived Elements carry the manifest's label and description", () => {
  const button = committed.elements.find((e) => e.type === "Button")!;
  const properties = button.propsSchema!.properties as Record<string, Record<string, unknown>>;
  const annotated = Object.values(properties).filter((p) => typeof p.title === "string");
  assert.ok(annotated.length > 0, "Button has titled properties");
});

test("planted: an Element without a props schema is refused", () => {
  const planted = STUDIO_BLOCKS.map((b) => (b.type === "Section" ? { ...b, staticProps: undefined } : b));
  const doc = build(planted);
  assert.equal(doc.elements.find((e) => e.type === "Section")!.propsSchema, null);
  const problems = elementCatalogDocumentProblems(doc, elementCatalog);
  assert.ok(problems.some((p) => p.startsWith("Section: no props schema")), problems.join("; "));
});

test("planted: an Element absent from element-catalog.json, or at another propsVersion, is refused", () => {
  const extra = [...STUDIO_BLOCKS, { type: "Planted", staticProps: STUDIO_BLOCKS[0].staticProps }];
  assert.ok(elementCatalogDocumentProblems(build(extra), elementCatalog).includes("Planted: not in element-catalog.json"));
  const bumped = STUDIO_BLOCKS.map((b) => (b.type === "Text" ? { ...b, propsVersion: 2 } : b));
  assert.ok(
    elementCatalogDocumentProblems(build(bumped), elementCatalog).some((p) => p.startsWith("Text: propsVersion 2")),
  );
});

test("planted: a stale committed document fails the check and names the Element", () => {
  const stale = JSON.parse(committedText) as ElementCatalogApiDocument;
  stale.elements.find((e) => e.type === "Box")!.displayName = "Planted";
  const result = checkElementCatalogDocument(serializeElementCatalogDocument(stale), fresh, "file", "regen");
  assert.equal(result.ok, false);
  assert.match((result as { message: string }).message, /Box: changed/);
});

test("route: 200 with the document and an ETag; 304 on If-None-Match", async () => {
  const url = "http://localhost/api/element-catalog";
  const first = GET(new Request(url));
  assert.equal(first.status, 200);
  assert.match(first.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(first.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const etag = first.headers.get("etag");
  assert.ok(etag && /^"[0-9a-f]{64}"$/.test(etag), `strong sha256 ETag, got ${etag}`);
  const body = (await first.json()) as ElementCatalogApiDocument;
  assert.deepEqual(body, committed);

  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
    const again = GET(new Request(url, { headers: { "If-None-Match": header } }));
    assert.equal(again.status, 304, `If-None-Match: ${header}`);
    assert.equal(again.headers.get("etag"), etag);
    assert.equal(await again.text(), "");
  }
  const miss = GET(new Request(url, { headers: { "If-None-Match": '"0000"' } }));
  assert.equal(miss.status, 200);
});

test("refinements: DataView, Section, Text and Box are marked incomplete with a note; every other Element is complete", () => {
  // Section.background, Text.color and Box.background take a custom theme
  // colour key (SDL-950): a refinement (reserved words); its shape is a pattern.
  const REFINED = ["DataView", "Section", "Text", "Box"];
  for (const element of committed.elements) {
    const refined = REFINED.includes(element.type);
    assert.equal(element.meta.schemaComplete, !refined, `${element.type}.meta.schemaComplete`);
    assert.equal(element.meta.validationNote !== null, refined, `${element.type}.meta.validationNote`);
  }
  const dataView = STUDIO_BLOCKS.find((b) => b.type === "DataView")!;
  assert.deepEqual(refinedPaths(dataView.staticProps), ["(root)", "filter[]", "presets[].filter[]"]);
  assert.deepEqual(refinedPaths(STUDIO_BLOCKS.find((b) => b.type === "Text")!.staticProps), ["color"]);
  assert.deepEqual(refinedPaths(STUDIO_BLOCKS.find((b) => b.type === "Box")!.staticProps), ["background"]);
  assert.deepEqual(refinedPaths(STUDIO_BLOCKS.find((b) => b.type === "Section")!.staticProps), ["background"]);
});

test("SDL-950: the colour props' JSON Schema carries the key's pattern (pages-service ThemeCustomColorKeyRe)", () => {
  const props = (type: string) =>
    committed.elements.find((e) => e.type === type)!.propsSchema as { properties: Record<string, { anyOf?: { pattern?: string; enum?: string[] }[] }> };
  for (const [type, field, builtins] of [
    ["Section", "background", ["default", "muted", "primary", "dark"]],
    ["Text", "color", ["default", "muted", "primary", "inverse"]],
    ["Box", "background", ["none", "surface", "muted"]],
  ] as const) {
    const anyOf = props(type).properties[field]?.anyOf ?? [];
    assert.deepEqual(anyOf[0]?.enum, [...builtins], `${type}.${field} built-ins`);
    assert.equal(anyOf[1]?.pattern, "^[a-z][A-Za-z0-9_-]{0,31}$", `${type}.${field} key pattern`);
  }
});

test("planted: a refinement without a validation note is refused, and so is a stale note", () => {
  // Image: an Element with no refinement of its own (Section has one since SDL-950).
  const image = STUDIO_BLOCKS.find((b) => b.type === "Image")!;
  const refined = { ...image, staticProps: image.staticProps!.superRefine(() => undefined) };
  assert.deepEqual(refinedPaths(refined.staticProps), ["(root)"], "the walker sees a superRefine");
  const planted = STUDIO_BLOCKS.map((b) => (b.type === "Image" ? refined : b));
  assert.ok(
    elementCatalogDocumentProblems(build(planted), elementCatalog).some((p) => p.startsWith("Image: its zod schema has refinements")),
  );
  const stale = JSON.parse(committedText) as ElementCatalogApiDocument;
  stale.elements.find((e) => e.type === "Image")!.meta.validationNote = "planted";
  assert.ok(elementCatalogDocumentProblems(stale, elementCatalog).some((p) => p.startsWith("Image: a validationNote")));
});
