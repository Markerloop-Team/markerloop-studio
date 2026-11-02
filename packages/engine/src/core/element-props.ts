// Reading a node's props through its Element definition (EP-128, SDL-639).
//
// Two things can be wrong with a stored node, and they are told apart:
//
//   1. the VERSION — the node says its props follow contract vN and this
//      engine's definition of the Element is at vM. An older node is brought
//      up through the definition's declarative migrations
//      (`migrateElementProps`, SDL-670) and the RESULT is checked for shape;
//      a newer one, or one the migrations cannot carry, is refused by number;
//   2. the SHAPE — same version, but `props` does not satisfy
//      `staticProps`. The zod issues come back as path + message, the same
//      form `validateSaunaSchema` reports in.
//
// Server-safe (zod only, no React, no DOM), like the rest of `core`.

import type { z } from "zod";

import type { SaunaNodeConfig } from "../schema/types";
import { SAUNA_DEFAULT_PROPS_VERSION, saunaNodePropsVersion } from "../schema/props-version";
import type { BlockDefinition } from "./define-block";
import { isElementMigrationError, migrateElementProps } from "./element-migrations";

/** The props-schema version an Element definition is at; absent means 1. */
export function blockPropsVersion(def: Pick<BlockDefinition, "propsVersion">): number {
  return def.propsVersion ?? SAUNA_DEFAULT_PROPS_VERSION;
}

/**
 * A node's props version against its Element definition's (SDL-667): `null`
 * when they agree, both numbers when they do not. The ONE place the rule
 * lives — `parseElementProps` asks it first, and the renderer and the
 * properties form ask it directly, because they only need the number (a zod
 * parse of every node on every canvas render would buy them nothing).
 */
export function elementPropsVersionMismatch(
  def: Pick<BlockDefinition, "propsVersion">,
  node: Pick<SaunaNodeConfig, "propsVersion">
): { nodeVersion: number; knownVersion: number } | null {
  const nodeVersion = saunaNodePropsVersion(node);
  const knownVersion = blockPropsVersion(def);
  return nodeVersion === knownVersion ? null : { nodeVersion, knownVersion };
}

/**
 * Element type → the props version a NEW node of that type is written at;
 * `undefined` for a type the definitions do not know (nothing to write).
 */
export type SaunaPropsVersionOf = (type: string) => number | undefined;

/**
 * `SaunaPropsVersionOf` over a list of Element definitions (SDL-667) — what
 * the editor's store and the Insert modal stamp onto a node they create.
 * The first definition of a type wins, as in the catalog lookups.
 */
export function propsVersionsFromBlocks(
  blocks: readonly Pick<BlockDefinition, "type" | "propsVersion">[] | undefined
): SaunaPropsVersionOf {
  const versions = new Map<string, number>();
  for (const b of blocks ?? []) if (!versions.has(b.type)) versions.set(b.type, blockPropsVersion(b));
  return (type) => versions.get(type);
}

export type ElementPropsIssue = { path: string; message: string };

/**
 * The parsed props of a definition: the output of its `staticProps`, or a
 * plain record when it has none (or an untyped `ZodTypeAny` one, whose
 * output would be `any` — refused here on purpose).
 */
export type ElementPropsOf<D extends BlockDefinition> =
  NonNullable<D["staticProps"]> extends z.ZodTypeAny
    ? z.ZodTypeAny extends NonNullable<D["staticProps"]>
      ? Record<string, unknown>
      : z.output<NonNullable<D["staticProps"]>>
    : Record<string, unknown>;

export type ElementPropsResult<T = unknown> =
  | { ok: true; version: number; props: T }
  | { ok: false; version: number; issues: ElementPropsIssue[] };

/**
 * Parses `node.props` against `def.staticProps` at the definition's version.
 *
 * An older node is migrated first (`migrateElementProps`) and the migrated
 * props are what `staticProps` checks — a step that produces props outside
 * the schema is reported, not passed; `version` is then the definition's.
 * Refused by number: a newer node (written by an engine this one has not
 * seen), or an older one the migrations cannot carry (wrong count, an
 * unregistered custom id, a path conflict). A definition without
 * `staticProps` accepts any props at its own version, as the untyped kit
 * Components do today.
 *
 * The result is a report, not an exception: the caller (a properties
 * panel, a renderer choosing an empty state, a server refusing a PATCH)
 * decides what to do with it.
 */
export function parseElementProps<D extends BlockDefinition>(
  def: D,
  node: Pick<SaunaNodeConfig, "props" | "propsVersion">
): ElementPropsResult<ElementPropsOf<D>> {
  type Out = ElementPropsOf<D>;
  let version = saunaNodePropsVersion(node);
  const mismatch = elementPropsVersionMismatch(def, node);
  if (mismatch) {
    const refuse = (why: string): ElementPropsResult<Out> => ({
      ok: false,
      version,
      issues: [{ path: "$.propsVersion", message: `node props follow ${def.type} props schema v${version}; this engine knows v${mismatch.knownVersion} and ${why}` }],
    });
    if (mismatch.nodeVersion > mismatch.knownVersion) return refuse("has no migration");
    if ((def.migrations?.length ?? 0) === 0) return refuse("has no migration");
    try {
      node = migrateElementProps(def, node);
    } catch (e) {
      if (!isElementMigrationError(e)) throw e;
      return refuse(`the migration failed (${e.code}): ${e.message}`);
    }
    version = mismatch.knownVersion;
  }
  const raw = node.props ?? {};
  if (!def.staticProps) return { ok: true, version, props: raw as Out };
  const parsed = def.staticProps.safeParse(raw);
  if (parsed.success) return { ok: true, version, props: parsed.data as Out };
  return {
    ok: false,
    version,
    issues: parsed.error.issues.map((i) => ({
      path: "$.props" + i.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join(""),
      message: i.message,
    })),
  };
}
