// The Element catalog as a document for machines (SDL-696, EP-20): what
// `GET /api/element-catalog` serves to the markerloop MCP — every Element a
// page may contain, with the JSON Schema of its props.
//
//   { catalogVersion, jsonSchemaDialect, elements: [
//       { type, displayName, propsVersion, propsSchema, meta, example,
//         exampleMissing } ] }
//
// - `catalogVersion` is the one from `element-catalog.json` (SDL-668), the
//   value /api/health serves as `pagesCatalogVersion`; it is NOT recomputed
//   here. `elementCatalogDocumentProblems` fails when the two disagree on the
//   set of types or a propsVersion.
// - `propsSchema` is `z.toJSONSchema(staticProps, { io: "input" })`, draft
//   2020-12: what a node's `props` may be written as (a field with a zod
//   default is optional on input). For an Element whose props come from the
//   kit's props manifest (`meta.propsForm === "manifest"`) the manifest's
//   label, description and default are laid over each property as `title`,
//   `description` and `default` — annotations only: a default is what the
//   component does when the prop is unset, never something to write.
// - `example` is the node the editor inserts (`meta.initialProps`);
//   `exampleMissing` names the required props it still lacks (DataView needs
//   a `source`: a fresh one is unbound on purpose) — empty when the example
//   is valid as is; a problem with no prop path is listed as "(root)". Only
//   the Elements listed in the test's EXAMPLE_INCOMPLETE may have one.
// - The schema is NECESSARY, not always SUFFICIENT: `z.toJSONSchema` drops
//   zod refinements (`superRefine`), which have no JSON Schema form. Where the
//   zod schema has one, `meta.schemaComplete` is false and
//   `meta.validationNote` says in words what is checked on top
//   (`STRICTER_VALIDATION`); `refinedPaths` finds them, and a refinement
//   without a note — or a note without a refinement — is a problem.
// - An Element without `staticProps` is listed with `propsSchema: null` so the
//   list stays the full set of renderable types — and it is a defect:
//   `elementCatalogDocumentProblems` names it, the generator refuses to write
//   the file and `smoke:pages` goes red.
//
// Why a generated, committed file and not a build in the route: the catalog
// (`@markerloop/studio/catalog`) is a "use client" module, so a route handler
// that imports it gets client references instead of the block list (measured:
// `t.blocks is not iterable`, HTTP 500). The route reads the JSON, the same
// way catalog-version.ts reads element-catalog.json.
//
// Pure module: the generator and its check are scripts/element-catalog-api.ts,
// the test scripts/element-catalog-api.test.ts, the generated file
// element-catalog-api.json next to this one, the route
// src/app/api/element-catalog/route.ts.

import { blockPropsVersion, type BlockDefinition } from "@markerloop/engine";
import { z } from "zod";

export const ELEMENT_CATALOG_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema";

type JsonSchema = Record<string, unknown>;

export type ElementCatalogApiMeta = {
  category: string | null;
  description: string | null;
  /** Parent types this Element may go under; null = anywhere. */
  allowedParents: string[] | null;
  /** Child types this Element accepts; null = any. */
  allowedChildren: string[] | null;
  /** The compound this Element is a part of (`TabsTrigger` → `Tabs`). */
  partOf: string | null;
  /** false = kept for stored nodes, never offered for insertion. */
  insertable: boolean;
  /**
   * false = the zod schema has refinements the JSON Schema cannot carry:
   * props valid against `propsSchema` may still be refused by the engine.
   */
  schemaComplete: boolean;
  /** What is checked beyond `propsSchema`, in words; null when nothing. */
  validationNote: string | null;
};

export type ElementCatalogApiNode = {
  type: string;
  propsVersion: number;
  props: Record<string, unknown>;
};

export type ElementCatalogApiElement = {
  type: string;
  displayName: string;
  propsVersion: number;
  propsSchema: JsonSchema | null;
  meta: ElementCatalogApiMeta;
  example: ElementCatalogApiNode;
  exampleMissing: string[];
};

export type ElementCatalogApiDocument = {
  catalogVersion: string;
  jsonSchemaDialect: string;
  elements: ElementCatalogApiElement[];
};

/** The part of `PAGES_PROPS_MANIFEST` this module reads. */
export type ElementCatalogPropsManifest = {
  components?: Record<string, unknown>;
};

/** The part of `element-catalog.json` this module reads. */
export type ElementCatalogManifest = {
  catalogVersion: string;
  elements: Record<string, { propsVersion: number }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * What is validated beyond the JSON Schema, per Element — one entry
 * for every Element whose zod schema has a refinement (`refinedPaths`).
 * Written by hand on purpose: a refinement is code, and only a sentence can
 * tell an MCP client what it refuses.
 */
export const STRICTER_VALIDATION: Readonly<Record<string, string>> = {
  Section:
    "Validation is stricter than propsSchema: background is one of the listed values or the key of a custom colour of the site theme (SDL-950) — a lowercase Latin letter, then Latin letters, digits, - and _, up to 32 characters, and not a reserved word (the eight theme roles, default, none, dark, light, inverse, transparent, inherit, initial, unset, revert, revert-layer, currentColor; compared without case). A key the published theme does not have renders as the default band (no fill)",
  Box:
    "Validation is stricter than propsSchema: background is one of the listed values or the key of a custom colour of the site theme (SDL-950) — a lowercase Latin letter, then Latin letters, digits, - and _, up to 32 characters, and not a reserved word (the eight theme roles, default, none, dark, light, inverse, transparent, inherit, initial, unset, revert, revert-layer, currentColor; compared without case). A key the published theme does not have renders as no fill",
  Text:
    "Validation is stricter than propsSchema: color is one of the listed values or the key of a custom colour of the site theme (SDL-950) — a lowercase Latin letter, then Latin letters, digits, - and _, up to 32 characters, and not a reserved word (the eight theme roles, default, none, dark, light, inverse, transparent, inherit, initial, unset, revert, revert-layer, currentColor; compared without case). A key the published theme does not have renders in the default colour",
  DataView:
    "Validation is stricter than propsSchema: the engine parses these props with the full zod schema (the DataView renderer and the editor), and props that fail it render as an unbound DataView. On top of propsSchema: a filter clause with op \"null\" takes a boolean value (true = is null); preset ids are unique; a field+op pair appears at most once in the base filter, and at most once in each preset's filter taken together with the base filter (the request carries one value per filter[field][op])",
};

type ZodNode = { _zod: { def: Record<string, unknown> } };
const isZodNode = (value: unknown): value is ZodNode =>
  value !== null && typeof value === "object" && "_zod" in value;

/**
 * Where a zod schema carries a refinement (`superRefine`/`refine`, or a
 * `z.custom`) — paths like `filter[]` or `(root)`. Walks zod 4's `_zod.def`;
 * the planted test in scripts/element-catalog-api.test.ts proves it still
 * sees a refinement after a zod upgrade.
 */
export function refinedPaths(schema: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: ZodNode, path: string, stack: Set<ZodNode>) => {
    if (stack.has(node)) return;
    stack.add(node);
    const def = node._zod.def;
    const checks = Array.isArray(def.checks) ? def.checks : [];
    if (def.type === "custom" || checks.some((c) => isZodNode(c) && c._zod.def.check === "custom")) {
      found.add(path || "(root)");
    }
    for (const [key, value] of Object.entries(def)) {
      if (key === "checks") continue;
      if (isZodNode(value)) {
        walk(value, key === "element" ? `${path}[]` : path, stack);
      } else if (Array.isArray(value)) {
        for (const item of value) if (isZodNode(item)) walk(item, path, stack);
      } else if (key === "shape" && isRecord(value)) {
        for (const [name, child] of Object.entries(value)) {
          if (isZodNode(child)) walk(child, path ? `${path}.${name}` : name, stack);
        }
      }
    }
    stack.delete(node);
  };
  if (isZodNode(schema)) walk(schema, "", new Set());
  return [...found].sort();
}

/** label / description / default of each manifest descriptor of `type`. */
function manifestAnnotations(
  manifest: ElementCatalogPropsManifest | undefined,
  type: string
): Map<string, JsonSchema> {
  const out = new Map<string, JsonSchema>();
  const entry = manifest?.components?.[type];
  const props = isRecord(entry) && Array.isArray(entry.props) ? entry.props : [];
  for (const descriptor of props) {
    if (!isRecord(descriptor) || typeof descriptor.name !== "string") continue;
    const notes: JsonSchema = {};
    if (typeof descriptor.label === "string") notes.title = descriptor.label;
    if (typeof descriptor.description === "string") notes.description = descriptor.description;
    if (["string", "number", "boolean"].includes(typeof descriptor.default)) {
      notes.default = descriptor.default;
    }
    if (Object.keys(notes).length > 0) out.set(descriptor.name, notes);
  }
  return out;
}

/** JSON Schema of a block's static props, or null when it declares none. */
export function elementPropsSchema(
  block: BlockDefinition,
  manifest?: ElementCatalogPropsManifest
): JsonSchema | null {
  if (!block.staticProps) return null;
  const schema = z.toJSONSchema(block.staticProps, { io: "input" }) as JsonSchema;
  if (block.meta?.propsForm === "manifest" && isRecord(schema.properties)) {
    const properties = schema.properties;
    for (const [name, notes] of manifestAnnotations(manifest, block.type)) {
      const property = properties[name];
      if (isRecord(property)) properties[name] = { ...notes, ...property };
    }
  }
  return schema;
}

/** Top-level props the example still has to be given to be valid. */
function missingProps(block: BlockDefinition, props: Record<string, unknown>): string[] {
  if (!block.staticProps) return [];
  const result = block.staticProps.safeParse(props);
  if (result.success) return [];
  const names = new Set<string>();
  for (const issue of result.error.issues) {
    const head = issue.path[0];
    names.add(head === undefined ? "(root)" : String(head));
  }
  return [...names].sort();
}

function elementOf(
  block: BlockDefinition,
  manifest: ElementCatalogPropsManifest | undefined
): ElementCatalogApiElement {
  const meta = block.meta ?? {};
  const propsVersion = blockPropsVersion(block);
  const props = { ...(meta.initialProps ?? {}) };
  return {
    type: block.type,
    displayName: block.displayName ?? block.type,
    propsVersion,
    propsSchema: elementPropsSchema(block, manifest),
    meta: {
      category: meta.category ?? null,
      description: meta.description ?? null,
      allowedParents: meta.allowedParents ? [...meta.allowedParents] : null,
      allowedChildren: meta.allowedChildren ? [...meta.allowedChildren] : null,
      partOf: meta.partOf ?? null,
      insertable: meta.insertable !== false,
      schemaComplete: refinedPaths(block.staticProps).length === 0,
      validationNote: STRICTER_VALIDATION[block.type] ?? null,
    },
    example: { type: block.type, propsVersion, props },
    exampleMissing: missingProps(block, props),
  };
}

/** The document, Elements sorted by type (code-unit order). */
export function buildElementCatalogDocument(args: {
  blocks: readonly BlockDefinition[];
  propsManifest?: ElementCatalogPropsManifest;
  catalogVersion: string;
}): ElementCatalogApiDocument {
  const elements = [...args.blocks]
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
    .map((block) => elementOf(block, args.propsManifest));
  return {
    catalogVersion: args.catalogVersion,
    jsonSchemaDialect: ELEMENT_CATALOG_SCHEMA_DIALECT,
    elements,
  };
}

/**
 * What makes the document unfit to serve — `[]` when it is fine. Checked by
 * `smoke:pages`; the route serves whatever it is given.
 */
export function elementCatalogDocumentProblems(
  doc: ElementCatalogApiDocument,
  manifest: ElementCatalogManifest
): string[] {
  const problems: string[] = [];
  for (const element of doc.elements) {
    if (!element.meta.schemaComplete && !element.meta.validationNote) {
      problems.push(`${element.type}: its zod schema has refinements propsSchema cannot carry and no validationNote — add one to STRICTER_VALIDATION`);
    } else if (element.meta.schemaComplete && element.meta.validationNote) {
      problems.push(`${element.type}: a validationNote for a schema without refinements — drop it from STRICTER_VALIDATION`);
    }
  }
  if (doc.catalogVersion !== manifest.catalogVersion) {
    problems.push(`catalogVersion ${doc.catalogVersion} is not element-catalog.json's ${manifest.catalogVersion}`);
  }
  const seen = new Set<string>();
  for (const element of doc.elements) {
    if (seen.has(element.type)) problems.push(`${element.type}: listed twice`);
    seen.add(element.type);
    if (element.propsSchema === null) {
      problems.push(`${element.type}: no props schema (the block declares no staticProps)`);
    } else if (element.propsSchema.$schema !== ELEMENT_CATALOG_SCHEMA_DIALECT) {
      problems.push(`${element.type}: props schema dialect ${String(element.propsSchema.$schema)}`);
    }
    const listed = manifest.elements[element.type];
    if (!listed) {
      problems.push(`${element.type}: not in element-catalog.json`);
    } else if (listed.propsVersion !== element.propsVersion) {
      problems.push(`${element.type}: propsVersion ${element.propsVersion}, element-catalog.json says ${listed.propsVersion}`);
    }
  }
  for (const type of Object.keys(manifest.elements)) {
    if (!seen.has(type)) problems.push(`${type}: in element-catalog.json, missing from the document`);
  }
  return problems;
}

/** The file's bytes: 2-space indent, trailing newline. */
export function serializeElementCatalogDocument(doc: ElementCatalogApiDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export type ElementCatalogDocumentCheck = { ok: true } | { ok: false; message: string };

/**
 * Freshness of the committed document against the live catalog, byte for
 * byte. A failure names every Element that differs.
 */
export function checkElementCatalogDocument(
  committedText: string | null,
  fresh: ElementCatalogApiDocument,
  rel: string,
  regen: string
): ElementCatalogDocumentCheck {
  if (committedText === null) {
    return { ok: false, message: `${rel} is missing. Generate it with \`${regen}\` and commit it.` };
  }
  if (committedText === serializeElementCatalogDocument(fresh)) return { ok: true };
  let committed: Partial<ElementCatalogApiDocument>;
  try {
    committed = JSON.parse(committedText) as Partial<ElementCatalogApiDocument>;
  } catch (error) {
    return { ok: false, message: `${rel} is not valid JSON (${(error as Error).message}). Regenerate with \`${regen}\`.` };
  }
  const old = new Map((committed.elements ?? []).map((e) => [e.type, JSON.stringify(e)]));
  const now = new Map(fresh.elements.map((e) => [e.type, JSON.stringify(e)]));
  const changes: string[] = [];
  for (const type of [...new Set([...old.keys(), ...now.keys()])].sort()) {
    if (!old.has(type)) changes.push(`${type}: added`);
    else if (!now.has(type)) changes.push(`${type}: removed`);
    else if (old.get(type) !== now.get(type)) changes.push(`${type}: changed`);
  }
  if (committed.catalogVersion !== fresh.catalogVersion) {
    changes.push(`catalogVersion ${String(committed.catalogVersion)} -> ${fresh.catalogVersion}`);
  }
  return {
    ok: false,
    message: `${rel} is stale — it differs from PAGES_BLOCKS (${changes.length ? changes.join("; ") : "formatting or order only"}). Regenerate with \`${regen}\` and commit the result; never hand-edit it.`,
  };
}
