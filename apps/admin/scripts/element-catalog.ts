// The Element catalog manifest (EP-128, SDL-668): what version of its props
// contract every Element of the pages catalog is at, and one hash over all of
// it — the catalog version.
//
//   { "elements": { "<type>": { "propsVersion": N, "migrations": [{ "steps": [...] }, ...] } },
//     "catalogVersion": "<sha256 hex>" }
//
// catalogVersion = sha256 of the CANONICAL JSON of the manifest WITHOUT the
// catalogVersion field, i.e. of `{"elements":{…}}`: object keys sorted at
// every depth, no whitespace, UTF-8. (Go's `json.Marshal` of the same data as
// maps gives the same bytes — pages-service can recompute it.)
//
// Inputs are only the Element's `type`, its props version
// (`blockPropsVersion`) and its declarative migrations (SDL-670, the steps as
// data — engine `element-migrations.ts`). The component that draws the
// Element, its catalog meta and its zod schema are NOT inputs: a look-only
// change of a component must not move the version, a props-contract change
// must come with a `propsVersion` bump AND its migration. The build refuses a
// definition without exactly propsVersion-1 well-formed migrations (a step
// field its op does not take, a non-JSON value), or with a `custom` step whose
// id has no registered TS implementation.
//
// Consequence, by design: the hash covers the whole catalog, so adding or
// removing any Element changes it for every site.
//
// Pure module (node:crypto only): the CLI is scripts/catalog-manifest.ts, the
// test scripts/catalog-manifest.test.ts. The app reads only the generated
// JSON (src/widgets/pages/catalog-version.ts).

import { createHash } from "node:crypto";

import {
  blockPropsVersion,
  checkElementMigrations,
  isElementMigrationError,
  type BlockDefinition,
  type ElementMigration,
} from "@markerloop/engine";

export type ElementCatalogEntry = {
  propsVersion: number;
  migrations: ElementMigration[];
};

export type ElementCatalog = {
  elements: Record<string, ElementCatalogEntry>;
  catalogVersion: string;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Deep copy with object keys sorted (code-unit order) at every depth. */
function sortKeys(value: unknown): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error(`element catalog: ${typeof value} is not JSON`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`element catalog: ${value} is not JSON`);
  }
  return value as Json;
}

/** Canonical JSON: sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** sha256 hex of the canonical form of the manifest without `catalogVersion`. */
export function catalogVersionOf(elements: ElementCatalog["elements"]): string {
  return createHash("sha256").update(canonicalJson({ elements }), "utf8").digest("hex");
}

/** Build the manifest from the catalog's block definitions. */
export function buildElementCatalog(blocks: readonly BlockDefinition[]): ElementCatalog {
  const elements: Record<string, ElementCatalogEntry> = {};
  for (const block of blocks) {
    if (typeof block.type !== "string" || block.type === "") {
      throw new Error("element catalog: a block has no type");
    }
    if (Object.prototype.hasOwnProperty.call(elements, block.type)) {
      throw new Error(`element catalog: type "${block.type}" is declared twice`);
    }
    const propsVersion = blockPropsVersion(block);
    if (!Number.isInteger(propsVersion) || propsVersion < 1) {
      throw new Error(`element catalog: "${block.type}" has propsVersion ${String(propsVersion)} (an integer >= 1 expected)`);
    }
    try {
      checkElementMigrations(block, { requireCustom: true });
    } catch (error) {
      if (!isElementMigrationError(error)) throw error;
      throw new Error(`element catalog: ${error.message} (${error.code})`);
    }
    elements[block.type] = {
      propsVersion,
      // Validated above: only the op's own fields, JSON values — a deep JSON
      // copy is exactly what Go will read back.
      migrations: JSON.parse(JSON.stringify(block.migrations ?? [])) as ElementMigration[],
    };
  }
  return { elements, catalogVersion: catalogVersionOf(elements) };
}

/** The file's bytes: sorted keys, 2-space indent, trailing newline. */
export function serializeElementCatalog(catalog: ElementCatalog): string {
  return `${JSON.stringify(sortKeys(catalog), null, 2)}\n`;
}

/**
 * What differs between the committed manifest and the fresh one, per type —
 * `[]` when the Elements agree (the difference, if any, is then in
 * `catalogVersion` or in formatting).
 */
export function elementCatalogChanges(committed: unknown, fresh: ElementCatalog): string[] {
  const old =
    committed !== null && typeof committed === "object" && "elements" in committed
      ? ((committed as { elements?: unknown }).elements as Record<string, Partial<ElementCatalogEntry>> | undefined) ?? {}
      : {};
  const types = [...new Set([...Object.keys(old), ...Object.keys(fresh.elements)])].sort();
  const changes: string[] = [];
  for (const type of types) {
    const was = old[type];
    const now = fresh.elements[type];
    if (was === undefined) {
      changes.push(`${type}: added (propsVersion ${now.propsVersion})`);
    } else if (now === undefined) {
      changes.push(`${type}: removed (was propsVersion ${String(was.propsVersion)})`);
    } else if (was.propsVersion !== now.propsVersion) {
      changes.push(`${type}: propsVersion ${String(was.propsVersion)} -> ${now.propsVersion}`);
    } else if (canonicalJson(was.migrations ?? null) !== canonicalJson(now.migrations)) {
      changes.push(`${type}: migrations differ`);
    }
  }
  return changes;
}

export type ElementCatalogCheck = { ok: true } | { ok: false; message: string };

/**
 * Freshness of the committed file against the live catalog: byte for byte.
 * A failure names every type that differs.
 */
export function checkElementCatalog(committedText: string | null, fresh: ElementCatalog, rel: string, regen: string): ElementCatalogCheck {
  if (committedText === null) {
    return { ok: false, message: `${rel} is missing. Generate it with \`${regen}\` and commit it.` };
  }
  const freshText = serializeElementCatalog(fresh);
  if (committedText === freshText) return { ok: true };
  let committed: unknown;
  try {
    committed = JSON.parse(committedText);
  } catch (error) {
    return { ok: false, message: `${rel} is not valid JSON (${(error as Error).message}). Regenerate with \`${regen}\`.` };
  }
  const changes = elementCatalogChanges(committed, fresh);
  const committedVersion = (committed as { catalogVersion?: unknown } | null)?.catalogVersion;
  const what = changes.length
    ? `elements: ${changes.join("; ")}`
    : committedVersion !== fresh.catalogVersion
      ? `catalogVersion: ${String(committedVersion)} -> ${fresh.catalogVersion}`
      : "formatting only";
  return {
    ok: false,
    message: `${rel} is stale — it differs from PAGES_BLOCKS (${what}). Regenerate with \`${regen}\` and commit the result; never hand-edit it.`,
  };
}
