// Element migrations reaching a Component's parameters (SDL-723, EP-145).
//
// A Component (blocks/Ref) exposes fields as `schema.params[] = {name,
// nodeId, prop, ...}` (SDL-718): `prop` is a TOP-LEVEL prop key of the node
// `nodeId` (`applyBlockParams` writes `props[spec.prop]`). When that node's
// Element migrates (`migrateElementProps`, SDL-670) and the migration renames
// or removes that key, the param has to follow, or it would write into a key
// the Element no longer reads.
//
// What follows the migration, and what deliberately does not:
//   - `params[].prop` — rewritten along the step chain of the node's Element,
//     from the node's stored propsVersion to the definition's:
//       rename {from: P, to: K}                  P → K
//       move   {from: P, to: K} (K one segment)  P → K
//       move   {from: P, to: "a.b"}             the param is REMOVED — a
//                                                param addresses a top-level
//                                                prop only, the value left it
//       remove {key: P}                          the param is REMOVED
//     Steps on nested paths ("P.x"), setDefault, mapValue and steps on other
//     keys leave the name alone (a step writing ONTO P replaces its value,
//     not its name). `custom` is opaque: the name is kept — a custom step
//     that renames a key must ship with a declarative twin if params matter.
//   - `Ref.props.params` on pages is NOT rewritten. Values are keyed by the
//     param's NAME, never by the prop (refs.ts, `SAUNA_REF_PARAMS_PROP`), so a
//     rename changes nothing there; a value whose param was REMOVED stays on
//     the page as an orphan — the SDL-501 rule: nothing is dropped silently,
//     `refParamOrphans` reports it and the author decides. pages-service
//     (the Go twin) does the same.
//
// Not wired into a read or write path yet: stored documents are migrated by
// pages-service. This is the engine's half of the contract, held to the same
// fixture, for a caller that migrates a Component in the browser.
//
// Shared fixture with pages-service (Go twin):
// `test/fixtures/component-params-migration.cases.json`.
//
// Pure and server-safe: no React, no DOM, no I/O. Inputs are never mutated;
// nothing to do → the same reference back.

import { SAUNA_DEFAULT_PROPS_VERSION, saunaNodePropsVersion } from "../schema/props-version";
import type { SaunaNodeConfig, SaunaParamSpec, SaunaSchema } from "../schema/types";
import type { BlockDefinition } from "./define-block";
import { migrateElementProps } from "./element-migrations";

type MigratableDefinition = Pick<BlockDefinition, "type" | "propsVersion" | "migrations">;

/** Finds an Element definition by node type; `undefined` = unknown Element, left alone. */
export type SaunaElementDefinitionLookup = (type: string) => MigratableDefinition | undefined;

/**
 * Where the top-level prop `prop` of a node at `fromVersion` ends up after
 * the definition's migration chain: the new key, or `null` when the chain
 * removes it (or moves it into a nested path).
 */
export function saunaMigratedParamProp(
  def: MigratableDefinition,
  fromVersion: number,
  prop: string,
): string | null {
  const to = def.propsVersion ?? SAUNA_DEFAULT_PROPS_VERSION;
  let cur = prop;
  for (let v = fromVersion; v < to; v++) {
    for (const step of def.migrations?.[v - 1]?.steps ?? []) {
      switch (step.op) {
        case "rename":
          if (step.from === cur) cur = step.to;
          break;
        case "move":
          if (step.from === cur) {
            if (step.to.includes(".")) return null;
            cur = step.to;
          }
          break;
        case "remove":
          if (step.key === cur) return null;
          break;
        default:
          break;
      }
    }
  }
  return cur;
}

export type SaunaComponentMigration = {
  /** The Component with its nodes migrated and its params following them. */
  schema: SaunaSchema;
  /** Names of the params the migration removed; their values on pages become orphans (`refParamOrphans`). */
  removedParams: string[];
};

/**
 * Migrates every node of a Component to its Element's current props version
 * AND carries `schema.params[].prop` along. The params are read against the
 * nodes' STORED versions, which is why the two happen in one call: once a
 * node is migrated, the version it came from is gone.
 *
 * Throws what `migrateElementProps` throws (`ElementMigrationError`).
 */
export function saunaMigrateComponent(
  schema: SaunaSchema,
  lookup: SaunaElementDefinitionLookup,
): SaunaComponentMigration {
  const removedParams: string[] = [];
  const specs = schema.params ?? [];
  let changed = false;
  const rebuilt: SaunaParamSpec[] = [];
  for (const spec of specs) {
    const node = schema.nodes[spec.nodeId];
    const def = node ? lookup(node.type) : undefined;
    const next = node && def ? saunaMigratedParamProp(def, saunaNodePropsVersion(node), spec.prop) : spec.prop;
    if (next === spec.prop) {
      rebuilt.push(spec);
      continue;
    }
    changed = true;
    if (next === null) removedParams.push(spec.name);
    else rebuilt.push({ ...spec, prop: next });
  }
  const params = changed ? rebuilt : null;

  let nodes: Record<string, SaunaNodeConfig> | null = null;
  for (const [id, node] of Object.entries(schema.nodes)) {
    const def = lookup(node.type);
    if (!def) continue;
    const migrated = migrateElementProps(def, node);
    if (migrated === node) continue;
    nodes ??= { ...schema.nodes };
    nodes[id] = migrated;
  }

  if (!params && !nodes) return { schema, removedParams };
  return {
    schema: { ...schema, ...(nodes ? { nodes } : {}), ...(params ? { params } : {}) },
    removedParams,
  };
}
