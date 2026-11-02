// Declarative props migrations of an Element (EP-128, SDL-670).
//
// An Element at `propsVersion` N carries exactly N-1 migrations next to its
// definition: `migrations[k-1]` turns props written against vk into props of
// v(k+1). A migration is DATA — a list of steps over prop paths — so the same
// list can be shipped in `element-catalog.json` and replayed by pages-service
// (SDL-671) without running TypeScript. The one escape hatch, `custom`, names
// an implementation by id; every runtime that migrates has to register its
// own implementation under that id (TS here, Go in pages-service), and an id
// nobody registered is an explicit error, never a silent skip.
//
// Steps (paths are dot-separated object keys, e.g. "source.filter"; no array
// indices, a key cannot contain a dot):
//
//   rename     { from: path, to: key }   the key at `from` gets a new name in
//                                        the same object
//   move       { from: path, to: path }  the value moves to another path;
//                                        missing objects on the way are created
//   remove     { key: path }             the key is deleted
//   setDefault { key: path, value }      written only where the key is absent
//                                        (a present null stays null)
//   mapValue   { key: path, map }        a STRING value found in `map` is
//                                        replaced by map[value]; anything else
//                                        is left as it is
//   custom     { id }                    the registered implementation gets
//                                        the whole node (a copy) and returns it
//
// rename / move / remove / mapValue apply to every props layer of the node —
// `props`, `member.props`, `screens[*].props`, `variants[*].props` — so an
// override keeps pointing at the renamed key. Override layers are laid over
// the base SHALLOWLY, by top-level key (`saunaOverlayProps`): a layer that
// holds `source` replaces the base's whole `source`. Two rules follow from it
// (SDL-670 review):
//   - setDefault writes into the base `props` (created if absent) AND into
//     every override layer that holds the path's top-level key — otherwise a
//     nested default would be hidden by the layer's own copy of the parent.
//     A top-level default goes to the base only: a layer without the key
//     falls back to it.
//     A layer holding a non-object on the way (`source: null`) is skipped.
//     That skip is for setDefault (and for the base value a move carries into
//     a layer without the source) only: a move whose source IS in the layer
//     and whose target's parent there is a non-object is `path_conflict` for
//     the whole node — skipping would silently lose the layer's value.
//   - move into a nested path, in an override layer that has the source but
//     not the target's top-level key, first seeds that key with a copy of the
//     base's (already migrated) value — otherwise the layer would carry a
//     partial parent and erase the base's siblings. A layer WITHOUT the source
//     (and not hiding it) that holds the target's top-level object gets the
//     base's pre-step value written into the target — its own object would
//     otherwise hide the moved value.
// Known limits of the shallow overlay, kept on purpose (fixture cases pin
// them): a seeded layer holds a COPY of the base's siblings, so a later edit
// of the base no longer reaches that screen; a move out of a nested object to
// the top level lets the base's moved value show through a layer that used to
// hide it (`style: {gap}` without `align`, base `style.align` -> `align`); the
// value written into a screen layer is the base's, not the member branch's
// (member x screen cannot be told apart in one layer).
// A source that is absent makes rename / move a no-op; a target that is
// present is replaced (rename onto an existing key overwrites it). Paths go
// through objects only: reading through an array finds nothing (remove,
// mapValue, rename and move are then no-ops), writing through an array or any
// other non-object is `path_conflict` — the node is not half-migrated, the
// caller gets nothing. `move a -> a.b` wraps: the value is read, `a` deleted,
// then `a.b` written. The node's own `propsVersion` must be an integer >= 1
// (`invalid_version`).
//
// Server-safe: no zod, no React, no DOM. Shared fixture with the Go
// interpreter: `test/fixtures/element-migrations.cases.json`.

import { SAUNA_DEFAULT_PROPS_VERSION, saunaNodePropsVersion } from "../schema/props-version";
import type { SaunaNodeConfig } from "../schema/types";
import type { BlockDefinition } from "./define-block";

/** A JSON value — what a step may write into props. */
export type ElementMigrationValue =
  | null
  | boolean
  | number
  | string
  | ElementMigrationValue[]
  | { [key: string]: ElementMigrationValue };

export type ElementMigrationStep =
  | { op: "rename"; from: string; to: string }
  | { op: "move"; from: string; to: string }
  | { op: "remove"; key: string }
  | { op: "setDefault"; key: string; value: ElementMigrationValue }
  | { op: "mapValue"; key: string; map: Record<string, ElementMigrationValue> }
  | { op: "custom"; id: string };

/** One version step of an Element's props contract, vk → v(k+1). */
export type ElementMigration = { steps: readonly ElementMigrationStep[] };

/** Builders for the steps — `migrationStep.rename("title", "heading")`. */
export const migrationStep = {
  rename: (from: string, to: string): ElementMigrationStep => ({ op: "rename", from, to }),
  move: (from: string, to: string): ElementMigrationStep => ({ op: "move", from, to }),
  remove: (key: string): ElementMigrationStep => ({ op: "remove", key }),
  setDefault: (key: string, value: ElementMigrationValue): ElementMigrationStep => ({ op: "setDefault", key, value }),
  mapValue: (key: string, map: Record<string, ElementMigrationValue>): ElementMigrationStep => ({ op: "mapValue", key, map }),
  custom: (id: string): ElementMigrationStep => ({ op: "custom", id }),
} as const;

/**
 * Stable error codes — the Go interpreter reports the same strings
 * (`expect_error` in the shared fixture).
 */
export type ElementMigrationErrorCode =
  | "migration_count" // the definition does not carry exactly propsVersion-1 migrations
  | "invalid_step" // a step is malformed (unknown op, bad path, …)
  | "unknown_custom" // a custom step names an id no implementation is registered for
  | "newer_version" // the node is written against a version this definition has not reached
  | "path_conflict" // a path runs into a value that is not an object
  | "invalid_version" // a propsVersion (node or definition) is not an integer >= 1
  | "custom_failed"; // a custom implementation threw or returned something that is not a node

export class ElementMigrationError extends Error {
  readonly code: ElementMigrationErrorCode;
  constructor(code: ElementMigrationErrorCode, message: string) {
    super(message);
    this.name = "ElementMigrationError";
    this.code = code;
  }
}

/** Name guard — `instanceof` does not hold across bundles. */
export function isElementMigrationError(e: unknown): e is ElementMigrationError {
  return e instanceof Error && e.name === "ElementMigrationError" && typeof (e as { code?: unknown }).code === "string";
}

// --- custom implementations -------------------------------------------------

/** A custom step: gets a copy of the node, returns the node to continue with. */
export type ElementMigrationImpl = (node: SaunaNodeConfig) => SaunaNodeConfig;

const CUSTOM = new Map<string, ElementMigrationImpl>();

/**
 * Registers the TS implementation of `custom:<id>`. The same id must have a
 * Go implementation in pages-service (SDL-671) before an Element ships a
 * step that uses it.
 *
 * Registering again under a taken id REPLACES the implementation (last one
 * wins) instead of throwing: hot reload and a module evaluated twice
 * re-register the same id with a new function reference, and a throw there
 * would break module loading in dev. Function identity cannot tell "the same
 * code loaded again" from "another meaning" anyway; what keeps one id to one
 * meaning is the Element's definition naming it and the shared fixture both
 * runtimes replay — not this map.
 */
export function registerElementMigration(id: string, impl: ElementMigrationImpl): void {
  if (typeof id !== "string" || id === "") throw new ElementMigrationError("invalid_step", "custom migration id must be a non-empty string");
  if (typeof impl !== "function") throw new ElementMigrationError("invalid_step", `custom migration "${id}" needs a function`);
  CUSTOM.set(id, impl);
}

/** The registered implementation of `custom:<id>`, if any. */
export function elementMigrationImpl(id: string): ElementMigrationImpl | undefined {
  return CUSTOM.get(id);
}

// --- validation of a definition --------------------------------------------

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function pathSegments(path: unknown, where: string): string[] {
  if (typeof path !== "string" || path === "") throw new ElementMigrationError("invalid_step", `${where}: a path must be a non-empty string`);
  const segs = path.split(".");
  for (const s of segs) {
    if (s === "") throw new ElementMigrationError("invalid_step", `${where}: "${path}" has an empty segment`);
    if (FORBIDDEN_SEGMENTS.has(s)) throw new ElementMigrationError("invalid_step", `${where}: "${path}" uses the reserved key "${s}"`);
  }
  return segs;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** A JSON value: null, boolean, finite number, string, arrays and plain objects of those. */
function isJsonValue(v: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (v === null || typeof v === "boolean" || typeof v === "string") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isJsonValue(x, depth + 1));
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.entries(v as Record<string, unknown>).every(([k, x]) => !FORBIDDEN_SEGMENTS.has(k) && isJsonValue(x, depth + 1));
  }
  return false;
}

/** The fields each op may carry — anything else would leak into element-catalog.json and catalogVersion. */
const STEP_FIELDS: Record<string, readonly string[]> = {
  rename: ["op", "from", "to"],
  move: ["op", "from", "to"],
  remove: ["op", "key"],
  setDefault: ["op", "key", "value"],
  mapValue: ["op", "key", "map"],
  custom: ["op", "id"],
};

function checkStep(step: unknown, where: string, requireCustom: boolean): void {
  if (!isPlainObject(step)) throw new ElementMigrationError("invalid_step", `${where}: a step must be an object`);
  const allowed = typeof step.op === "string" && Object.prototype.hasOwnProperty.call(STEP_FIELDS, step.op) ? STEP_FIELDS[step.op]! : null;
  if (allowed) {
    const extra = Object.keys(step).filter((k) => !allowed.includes(k));
    if (extra.length) throw new ElementMigrationError("invalid_step", `${where}: ${String(step.op)} does not take ${extra.join(", ")}`);
  }
  switch (step.op) {
    case "rename":
      pathSegments(step.from, `${where} rename.from`);
      if (pathSegments(step.to, `${where} rename.to`).length !== 1) {
        throw new ElementMigrationError("invalid_step", `${where}: rename.to is a key name, not a path (use move)`);
      }
      return;
    case "move":
      pathSegments(step.from, `${where} move.from`);
      pathSegments(step.to, `${where} move.to`);
      return;
    case "remove":
      pathSegments(step.key, `${where} remove.key`);
      return;
    case "setDefault":
      pathSegments(step.key, `${where} setDefault.key`);
      if (!("value" in step) || !isJsonValue(step.value)) throw new ElementMigrationError("invalid_step", `${where}: setDefault needs a JSON value`);
      return;
    case "mapValue":
      pathSegments(step.key, `${where} mapValue.key`);
      if (!isPlainObject(step.map) || !isJsonValue(step.map)) throw new ElementMigrationError("invalid_step", `${where}: mapValue.map must be a JSON object`);
      return;
    case "custom":
      if (typeof step.id !== "string" || step.id === "") throw new ElementMigrationError("invalid_step", `${where}: custom needs an id`);
      if (requireCustom && !CUSTOM.has(step.id)) {
        throw new ElementMigrationError("unknown_custom", `${where}: custom migration "${step.id}" has no registered implementation`);
      }
      return;
    default:
      throw new ElementMigrationError("invalid_step", `${where}: unknown op ${JSON.stringify(step.op)}`);
  }
}

/**
 * Throws `ElementMigrationError` unless the definition carries exactly
 * propsVersion-1 well-formed migrations. `defineBlock` runs it without
 * `requireCustom` (implementations may register after the definition is
 * built); the catalog generator runs it with `requireCustom: true`, so a
 * custom id without a TS implementation never reaches `element-catalog.json`.
 */
export function checkElementMigrations(
  def: Pick<BlockDefinition, "type" | "propsVersion" | "migrations">,
  options?: { requireCustom?: boolean }
): void {
  const version = def.propsVersion ?? SAUNA_DEFAULT_PROPS_VERSION;
  if (!Number.isInteger(version) || version < 1) {
    throw new ElementMigrationError("invalid_version", `${def.type}: propsVersion ${String(version)} is not an integer >= 1`);
  }
  const migrations = def.migrations ?? [];
  if (!Array.isArray(migrations)) throw new ElementMigrationError("invalid_step", `${def.type}: migrations must be an array`);
  if (migrations.length !== version - 1) {
    throw new ElementMigrationError(
      "migration_count",
      `${def.type}: propsVersion ${version} needs exactly ${version - 1} migration(s), has ${migrations.length} — bump propsVersion only together with a migration`
    );
  }
  migrations.forEach((m, i) => {
    const where = `${def.type} migration v${i + 1}→v${i + 2}`;
    if (!isPlainObject(m) || !Array.isArray(m.steps)) throw new ElementMigrationError("invalid_step", `${where}: expected { steps: [...] }`);
    const extra = Object.keys(m).filter((k) => k !== "steps");
    if (extra.length) throw new ElementMigrationError("invalid_step", `${where}: a migration takes only steps, not ${extra.join(", ")}`);
    m.steps.forEach((s, j) => checkStep(s, `${where} step ${j}`, options?.requireCustom === true));
  });
}

// --- applying ---------------------------------------------------------------

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function getAt(obj: Record<string, unknown>, segs: string[]): { found: boolean; value?: unknown } {
  let cur: unknown = obj;
  for (const s of segs) {
    if (!isPlainObject(cur) || !Object.prototype.hasOwnProperty.call(cur, s)) return { found: false };
    cur = cur[s];
  }
  return { found: true, value: cur };
}

function setAt(obj: Record<string, unknown>, segs: string[], value: unknown, path: string): void {
  let cur = obj;
  for (const s of segs.slice(0, -1)) {
    const next = Object.prototype.hasOwnProperty.call(cur, s) ? cur[s] : undefined;
    if (next === undefined) {
      const created: Record<string, unknown> = {};
      cur[s] = created;
      cur = created;
    } else if (isPlainObject(next)) {
      cur = next;
    } else {
      throw new ElementMigrationError("path_conflict", `cannot write "${path}": "${s}" holds a ${next === null ? "null" : Array.isArray(next) ? "array" : typeof next}, not an object`);
    }
  }
  cur[segs[segs.length - 1]!] = value;
}

function deleteAt(obj: Record<string, unknown>, segs: string[]): void {
  const parent = segs.length === 1 ? { found: true, value: obj } : getAt(obj, segs.slice(0, -1));
  if (parent.found && isPlainObject(parent.value)) delete parent.value[segs[segs.length - 1]!];
}

/**
 * What an override layer needs to know about the base: the base props AFTER
 * the step (to seed a missing parent) and the step's source value in the base
 * BEFORE it (a layer that did not hide that value kept seeing it).
 */
type LayerContext = {
  base: Record<string, unknown>;
  baseSourceBefore: { found: boolean; value?: unknown };
};

function isPathConflict(e: unknown): boolean {
  return isElementMigrationError(e) && e.code === "path_conflict";
}

/**
 * Moves the value at `fromSegs` to `toSegs` inside one layer. For an
 * override layer (`ctx` set) and a nested target, two shallow-overlay fixes:
 *   - the layer has the source but not the target's top-level key: that key
 *     is first seeded with a copy of the base's (migrated) object, so the
 *     layer does not replace it with a partial one;
 *   - the layer does not have the source and did not hide it (it does not
 *     hold the source's top-level key), but holds the target's top-level key
 *     as an object without the target: the base's pre-step value is written
 *     there — the layer used to show it through the base, and its own object
 *     would now hide the moved value.
 * Carrying the base value, a path running into a non-object in the layer is
 * skipped (the layer replaced that parent itself). Moving the layer's OWN
 * value into a non-object parent is `path_conflict` for the whole node —
 * skipping would silently lose that value.
 */
function relocate(
  layer: Record<string, unknown>,
  fromSegs: string[],
  toSegs: string[],
  to: string,
  ctx: LayerContext | null
): void {
  const src = getAt(layer, fromSegs);
  const top = toSegs[0]!;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(layer, k);
  if (!src.found) {
    if (!ctx || toSegs.length < 2 || !ctx.baseSourceBefore.found) return;
    if (has(fromSegs[0]!) || !isPlainObject(layer[top]) || getAt(layer, toSegs).found) return;
    try {
      setAt(layer, toSegs, clone(ctx.baseSourceBefore.value), to);
    } catch (e) {
      if (!isPathConflict(e)) throw e;
    }
    return;
  }
  deleteAt(layer, fromSegs);
  if (ctx && toSegs.length > 1 && !has(top)) {
    const seed = Object.prototype.hasOwnProperty.call(ctx.base, top) ? ctx.base[top] : undefined;
    if (isPlainObject(seed)) layer[top] = clone(seed);
  }
  setAt(layer, toSegs, src.value, to);
}

function applyToLayer(
  layer: Record<string, unknown>,
  step: ElementMigrationStep,
  ctx: LayerContext | null // null = this IS the base layer
): void {
  switch (step.op) {
    case "rename": {
      const fromSegs = step.from.split(".");
      relocate(layer, fromSegs, [...fromSegs.slice(0, -1), step.to], step.to, ctx);
      return;
    }
    case "move":
      relocate(layer, step.from.split("."), step.to.split("."), step.to, ctx);
      return;
    case "remove":
      deleteAt(layer, step.key.split("."));
      return;
    case "setDefault": {
      const segs = step.key.split(".");
      // An override layer gets the default only where it holds the path's
      // parent object itself (shallow overlay by top-level key).
      if (ctx && (segs.length === 1 || !Object.prototype.hasOwnProperty.call(layer, segs[0]!))) return;
      if (getAt(layer, segs).found) return;
      try {
        setAt(layer, segs, clone(step.value), step.key);
      } catch (e) {
        // A layer that holds a non-object on the way (`source: null`) replaced
        // that parent itself: no default goes there. The base still fails.
        if (!ctx || !isPathConflict(e)) throw e;
      }
      return;
    }
    case "mapValue": {
      const segs = step.key.split(".");
      const cur = getAt(layer, segs);
      if (cur.found && typeof cur.value === "string" && Object.prototype.hasOwnProperty.call(step.map, cur.value)) {
        setAt(layer, segs, clone(step.map[cur.value]), step.key);
      }
      return;
    }
    case "custom":
      return; // handled on the node, see applyStep
  }
}

function cloneFound(r: { found: boolean; value?: unknown }): { found: boolean; value?: unknown } {
  return r.found ? { found: true, value: clone(r.value) } : r;
}

function applyStep(node: SaunaNodeConfig, step: ElementMigrationStep): SaunaNodeConfig {
  if (step.op === "custom") {
    const impl = CUSTOM.get(step.id);
    if (!impl) throw new ElementMigrationError("unknown_custom", `custom migration "${step.id}" has no registered implementation`);
    let out: unknown;
    try {
      out = impl(node);
    } catch (e) {
      throw new ElementMigrationError("custom_failed", `custom migration "${step.id}" threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!isPlainObject(out) || out.type !== node.type) {
      throw new ElementMigrationError("custom_failed", `custom migration "${step.id}" did not return a node of the same type`);
    }
    // A copy: the implementation may hand back objects it still holds.
    let copied: SaunaNodeConfig;
    try {
      copied = clone(out) as SaunaNodeConfig;
    } catch (e) {
      throw new ElementMigrationError("custom_failed", `custom migration "${step.id}" returned a node that is not JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    return copied;
  }
  if (step.op === "setDefault" && !node.props) node.props = {};
  const base = node.props ?? {};
  const ctx: LayerContext = {
    base,
    baseSourceBefore: step.op === "move" || step.op === "rename" ? cloneFound(getAt(base, step.from.split("."))) : { found: false },
  };
  if (node.props) applyToLayer(node.props, step, null);
  if (node.member?.props) applyToLayer(node.member.props, step, ctx);
  for (const screen of Object.values(node.screens ?? {})) {
    if (screen?.props) applyToLayer(screen.props, step, ctx);
  }
  for (const variant of node.variants ?? []) {
    if (variant?.props) applyToLayer(variant.props, step, ctx);
  }
  return node;
}

/**
 * Brings a node's props up to its Element definition's version.
 *
 * - same version → the node itself, untouched (same reference);
 * - older → a NEW node: the chain `migrations[nodeVersion-1 .. version-2]`
 *   applied to a copy, `propsVersion` set to the definition's;
 * - newer, a node version that is not an integer >= 1, a wrong migration
 *   count, an unregistered custom id, a path conflict →
 *   `ElementMigrationError` (check with `isElementMigrationError`).
 *
 * The input is never mutated. It does not validate the result against
 * `staticProps` — `parseElementProps` does that after migrating.
 */
export function migrateElementProps<N extends SaunaNodeConfig | Pick<SaunaNodeConfig, "props" | "propsVersion">>(
  def: Pick<BlockDefinition, "type" | "propsVersion" | "migrations">,
  node: N
): N {
  const from = saunaNodePropsVersion(node);
  if (!Number.isInteger(from) || from < 1) {
    throw new ElementMigrationError("invalid_version", `${def.type}: node propsVersion ${String(from)} is not an integer >= 1`);
  }
  const to = def.propsVersion ?? SAUNA_DEFAULT_PROPS_VERSION;
  if (from === to) return node;
  if (from > to) {
    throw new ElementMigrationError("newer_version", `node props follow ${def.type} props schema v${from}; this engine knows v${to}`);
  }
  checkElementMigrations(def);
  let out = clone(node) as unknown as SaunaNodeConfig;
  for (let v = from; v < to; v++) {
    for (const step of def.migrations![v - 1]!.steps) out = applyStep(out, step);
  }
  out.propsVersion = to;
  return out as unknown as N;
}
