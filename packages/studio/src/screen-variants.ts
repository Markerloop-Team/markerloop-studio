// Width variants in the Studio (SDL-632, slice S5).
//
// The contract is the engine's (`SaunaNodeConfig.screens`, S3): a node may
// carry `screens.tablet.props` / `screens.mobile.props`, and each holds ONLY
// the keys that differ from the base `props`. The renderer lays them over the
// base when `context.screen` names that width.
//
// This file is the Studio's side of it, pure and React-free so the store, the
// form and the tests read one answer:
//
//   - which width the author is editing (`StudioScreen`, held in the store's
//     `view`), and which canvas device goes with it;
//   - what a field SHOWS at that width (override ?? base — the engine's own
//     layering, not a second copy of it);
//   - how a write lands (into `screens[screen].props`) and how Reset undoes it
//     (the key is DELETED, and an emptied width or `screens` goes with it —
//     an empty string would be an override to "", not the absence of one).
//     An EMPTIED text field is the opposite case (S6): the author cleared the
//     field at this width, and that is stored as `""`. Reset is the only way
//     back to the base. A cleared non-text field has no empty value its
//     props schema accepts, so there clearing removes the override.
//
// The hybrid member branch (`member.props`, S6) follows the same storage
// rules through the same functions (`StudioOverrideBranch`).

import { SAUNA_REF_PARAMS_PROP, SAUNA_REF_TYPE, saunaLayerNodeProps } from "@markerloop/engine";
import type { SaunaNodeConfig, SaunaScreen } from "@markerloop/engine";

import type { SaunaCanvasDeviceId } from "./canvas-frame";

/** The width being edited: the base, or one of the engine's override widths. */
export type StudioScreen = SaunaScreen | "base";

/**
 * Where a properties edit lands: the base `props`, one width's
 * `screens[screen].props`, or the hybrid member branch's `member.props`
 * (S6). Resolved by `studioEditTarget` in ./visibility-modes.
 */
export type StudioEditTarget =
  | { kind: "base" }
  | { kind: "screen"; screen: SaunaScreen }
  | { kind: "member" };

/** The switch's options, in the order the design-system canvas draws them. */
export const STUDIO_SCREENS: readonly {
  id: StudioScreen;
  label: string;
  device: SaunaCanvasDeviceId;
}[] = [
  { id: "base", label: "Base", device: "desktop" },
  { id: "tablet", label: "Tablet", device: "tablet" },
  { id: "mobile", label: "Phone", device: "mobile" },
];

export function studioScreenLabel(screen: StudioScreen): string {
  return STUDIO_SCREENS.find((s) => s.id === screen)?.label ?? "Base";
}

export function screenToDevice(screen: StudioScreen): SaunaCanvasDeviceId {
  return STUDIO_SCREENS.find((s) => s.id === screen)?.device ?? "desktop";
}

export function deviceToScreen(device: SaunaCanvasDeviceId): StudioScreen {
  return STUDIO_SCREENS.find((s) => s.device === device)?.id ?? "base";
}

/**
 * The canvas device for a width. A Tablet/Phone variant always shows at its
 * own width. The base shows on the desktop once the author has picked
 * anything; until then the canvas keeps following the viewport (SDL-297), so
 * opening the editor on a phone still shows a phone-wide page.
 */
export function canvasDeviceFor(
  screen: StudioScreen,
  picked: boolean,
  isMobile: boolean
): SaunaCanvasDeviceId {
  if (screen !== "base") return screenToDevice(screen);
  if (picked) return "desktop";
  return isMobile ? "mobile" : "desktop";
}

export function editTargetForScreen(screen: StudioScreen): StudioEditTarget {
  return screen === "base" ? { kind: "base" } : { kind: "screen", screen };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Same JSON value: `Object.is`, or arrays / plain objects equal member by
 * member. The JSON field hands back a freshly parsed object on every blur, so
 * identity alone would read "unchanged" as a change.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
  }
  return false;
}

/** The override object of one width, or `undefined` when it has none. */
export function screenOverrideProps(
  node: SaunaNodeConfig,
  screen: StudioScreen
): Record<string, unknown> | undefined {
  if (screen === "base" || !isPlainObject(node.screens)) return undefined;
  const branch = (node.screens as Record<string, unknown>)[screen];
  if (!isPlainObject(branch) || !isPlainObject(branch.props)) return undefined;
  return branch.props;
}

/** Keys the width overrides, in stored order. Empty at the base. */
export function screenOverriddenKeys(node: SaunaNodeConfig, screen: StudioScreen): string[] {
  return Object.keys(screenOverrideProps(node, screen) ?? {});
}

export function isScreenOverridden(
  node: SaunaNodeConfig,
  screen: StudioScreen,
  key: string
): boolean {
  const overrides = screenOverrideProps(node, screen);
  return !!overrides && Object.hasOwn(overrides, key);
}

/**
 * What the form shows at `screen`: the override where there is one, the base
 * value everywhere else. Delegates to the engine's layering so the panel and
 * the canvas can never disagree about a value (a `Ref`'s `params` merge by
 * name there, and therefore here).
 */
export function nodePropsForScreen(
  node: SaunaNodeConfig,
  screen: StudioScreen
): Record<string, unknown> {
  if (screen === "base") return (node.props ?? {}) as Record<string, unknown>;
  return (saunaLayerNodeProps(node, { screen }) ?? {}) as Record<string, unknown>;
}

/**
 * Where an override lives: one width's `screens[screen].props`, or the
 * hybrid member branch's `member.props` (SDL-632, S6). Both follow the same
 * storage rules, so both go through the same two functions below.
 */
export type StudioOverrideBranch = { kind: "screen"; screen: SaunaScreen } | { kind: "member" };

/** The member branch's overrides, or `undefined` when it has none. */
export function memberOverrideProps(node: SaunaNodeConfig): Record<string, unknown> | undefined {
  const branch = node.member as unknown;
  if (!isPlainObject(branch) || !isPlainObject(branch.props)) return undefined;
  return branch.props;
}

function branchProps(node: SaunaNodeConfig, where: StudioOverrideBranch): Record<string, unknown> | undefined {
  return where.kind === "member" ? memberOverrideProps(node) : screenOverrideProps(node, where.screen);
}

/**
 * `node` with the override object of `where` replaced by `props`, pruning as
 * it goes: an empty `props` drops the branch, an emptied `screens` goes too —
 * a stored `{ mobile: { props: {} } }` would be noise every reader has to skip.
 */
function withBranchProps(
  node: SaunaNodeConfig,
  where: StudioOverrideBranch,
  props: Record<string, unknown>
): SaunaNodeConfig {
  const empty = Object.keys(props).length === 0;
  if (where.kind === "member") {
    const branch = isPlainObject(node.member) ? { ...(node.member as Record<string, unknown>) } : {};
    if (empty) delete branch.props;
    else branch.props = props;
    const next: SaunaNodeConfig = { ...node };
    if (Object.keys(branch).length > 0) next.member = branch as SaunaNodeConfig["member"];
    else delete next.member;
    return next;
  }
  const screens = isPlainObject(node.screens) ? { ...(node.screens as Record<string, unknown>) } : {};
  const branch = isPlainObject(screens[where.screen])
    ? { ...(screens[where.screen] as Record<string, unknown>) }
    : {};
  if (empty) delete branch.props;
  else branch.props = props;
  if (Object.keys(branch).length > 0) screens[where.screen] = branch;
  else delete screens[where.screen];
  const next: SaunaNodeConfig = { ...node };
  if (Object.keys(screens).length > 0) next.screens = screens as SaunaNodeConfig["screens"];
  else delete next.screens;
  return next;
}

/** A stored value that says "the author cleared this field". */
function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * `target[key] = value` without the assignment semantics — the engine's
 * rule (`core/visibility-mode.ts`): a stored document is JSON.parse output,
 * where `"__proto__"` is an ordinary own key, and plain assignment of that key
 * would swap the object's PROTOTYPE instead of writing a prop.
 */
function defineOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * A `Ref`'s `params` override reduced to the parameters that differ from the
 * base (SDL-632): the engine merges `params` BY NAME, so an override holding
 * a copy of every base parameter would pin them all at this width and a later
 * base edit would stop reaching it.
 */
function paramsDiff(base: unknown, value: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(value)) {
    if (!(Object.hasOwn(base, name) && sameValue(base[name], v))) defineOwn(out, name, v);
  }
  return out;
}

/**
 * `node` with `patch` written into the override branch `where`, which stores
 * ONLY the differences from the base:
 *
 *   - a value equal to the base value removes the key (typing a field back
 *     to the base, or a JSON field blurred without an edit, leaves no
 *     override behind — the field keeps following the base);
 *   - an EMPTIED text field (`undefined` from the editor, base a non-empty
 *     string) is an override like any other: it is stored as `""`. An
 *     emptied field of any other kind removes the override — `null` would
 *     fail the component's props schema — and falls back to the base;
 *   - a `Ref`'s `params` keep only the parameters that differ, by name;
 *   - when nothing changes, `node` itself comes back, so the store pushes no
 *     undo step.
 */
export function withOverridePatch(
  node: SaunaNodeConfig,
  where: StudioOverrideBranch,
  patch: Record<string, unknown>
): SaunaNodeConfig {
  const base = (node.props ?? {}) as Record<string, unknown>;
  const current = branchProps(node, where) ?? {};
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) defineOwn(next, k, v);
  for (const [key, raw] of Object.entries(patch)) {
    const baseValue = Object.hasOwn(base, key) ? base[key] : undefined;
    let value = raw;
    if (value === undefined) {
      // An emptied TEXT field is an override to "" — clearing a caption at
      // Phone is a decision about Phone, not a Reset. Anything else has no
      // empty value the component's props schema accepts (`null` fails a
      // `z.number().optional()`), so there clearing removes the override and
      // the field falls back to the base.
      if (typeof baseValue !== "string" || !hasValue(baseValue)) {
        delete next[key];
        continue;
      }
      value = "";
    }
    if (node.type === SAUNA_REF_TYPE && key === SAUNA_REF_PARAMS_PROP) {
      value = paramsDiff(baseValue, value);
      if (isPlainObject(value) && Object.keys(value).length === 0) {
        delete next[key];
        continue;
      }
    }
    if (Object.hasOwn(base, key) && sameValue(baseValue, value)) delete next[key];
    else defineOwn(next, key, value);
  }
  if (sameValue(next, current)) return node;
  return withBranchProps(node, where, next);
}

/**
 * `node` without `key` in the override branch `where` — the field goes back
 * to inheriting the base. Returns `node` itself when there is nothing to reset.
 */
export function withoutOverrideProp(
  node: SaunaNodeConfig,
  where: StudioOverrideBranch,
  key: string
): SaunaNodeConfig {
  const current = branchProps(node, where);
  if (!current || !Object.hasOwn(current, key)) return node;
  const props = { ...current };
  delete props[key];
  return withBranchProps(node, where, props);
}

/** {@link withOverridePatch} at one width: `screens[screen].props`. */
export function withScreenPropsPatch(
  node: SaunaNodeConfig,
  screen: SaunaScreen,
  patch: Record<string, unknown>
): SaunaNodeConfig {
  return withOverridePatch(node, { kind: "screen", screen }, patch);
}

/** {@link withoutOverrideProp} at one width. */
export function withoutScreenProp(
  node: SaunaNodeConfig,
  screen: SaunaScreen,
  key: string
): SaunaNodeConfig {
  return withoutOverrideProp(node, { kind: "screen", screen }, key);
}

/** {@link withOverridePatch} on the hybrid member branch: `member.props`. */
export function withMemberPropsPatch(node: SaunaNodeConfig, patch: Record<string, unknown>): SaunaNodeConfig {
  return withOverridePatch(node, { kind: "member" }, patch);
}

/** {@link withoutOverrideProp} on the hybrid member branch. */
export function withoutMemberProp(node: SaunaNodeConfig, key: string): SaunaNodeConfig {
  return withoutOverrideProp(node, { kind: "member" }, key);
}
/**
 * `node` with the WHOLE override object of `where` replaced by `props` — the
 * raw-JSON field's write at a width or on the member branch. An empty or
 * absent `props` clears the branch the way Reset does, key by key, so the
 * pruning rules stay in one place.
 */
export function withOverrideProps(
  node: SaunaNodeConfig,
  where: StudioOverrideBranch,
  props: Record<string, unknown> | undefined
): SaunaNodeConfig {
  let next = node;
  for (const key of Object.keys(branchProps(node, where) ?? {})) {
    next = withoutOverrideProp(next, where, key);
  }
  if (props && Object.keys(props).length > 0) next = withOverridePatch(next, where, props);
  // Same overrides as before (a blur without an edit): the node itself, so
  // the caller can skip the write and the history frame.
  return sameValue(branchProps(next, where), branchProps(node, where)) ? node : next;
}

/** {@link withOverrideProps} at one width. */
export function withScreenProps(
  node: SaunaNodeConfig,
  screen: SaunaScreen,
  props: Record<string, unknown> | undefined
): SaunaNodeConfig {
  return withOverrideProps(node, { kind: "screen", screen }, props);
}
