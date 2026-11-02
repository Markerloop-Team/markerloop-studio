// Visibility modes, the member branch and per-width overrides (SDL-632).
//
// The contract lives in `schema/types.ts` (`SaunaVisibilityMode`,
// `SaunaNodeConfig.member`, `SaunaNodeConfig.screens`). This file holds the
// pure readers every consumer shares — the renderer, the public shell and
// (later) the Studio — so that "which mode is this node in" and "which props
// does it end up with" have exactly one answer.
//
// Pure and server-safe: no React, no DOM, no I/O.

import type {
  SaunaNodeConfig,
  SaunaNodeId,
  SaunaSchema,
  SaunaScreen,
  SaunaVisibilityMode,
} from "../schema/types";
import { SAUNA_REF_PARAMS_PROP, SAUNA_REF_TYPE } from "./refs";

/** Every value `SaunaVisibilityMode` admits, in the order the editor offers them. */
export const SAUNA_VISIBILITY_MODES: readonly SaunaVisibilityMode[] = ["public", "hybrid", "private"];

/** Every key `SaunaNodeConfig.screens` admits. */
export const SAUNA_SCREENS: readonly SaunaScreen[] = ["tablet", "mobile"];

/** Mode of a node whose `visibility` names none: absent field or legacy rule. */
export const SAUNA_DEFAULT_VISIBILITY_MODE: SaunaVisibilityMode = "public";

export function isSaunaVisibilityMode(value: unknown): value is SaunaVisibilityMode {
  return value === "public" || value === "hybrid" || value === "private";
}

/**
 * The mode a node DECLARES, or `undefined` when its `visibility` is absent or
 * the legacy object rule. A string that is not a mode also reads `undefined`
 * here — whether such a node is shown is `evaluateVisibility`'s question (it
 * is not), and whether it reaches the shell is `saunaPublicShell`'s (it does
 * not).
 */
export function saunaNodeVisibilityMode(node: SaunaNodeConfig | undefined): SaunaVisibilityMode | undefined {
  const v = node?.visibility;
  return isSaunaVisibilityMode(v) ? v : undefined;
}

/**
 * The mode in force at `nodeId`: its own, or that of the nearest ancestor that
 * declares one (walked through `parents`), else `"public"`. This is the mode
 * that decides whether `member` on the node means anything.
 */
export function saunaEffectiveVisibilityMode(schema: SaunaSchema, nodeId: SaunaNodeId): SaunaVisibilityMode {
  const seen = new Set<SaunaNodeId>();
  let cur: SaunaNodeId | null | undefined = nodeId;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    const mode = saunaNodeVisibilityMode(schema.nodes[cur]);
    if (mode) return mode;
    cur = schema.parents?.[cur];
  }
  return SAUNA_DEFAULT_VISIBILITY_MODE;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `overlay` laid over `base` key by key. For a `Ref` node the `params` key is
 * merged by PARAMETER NAME rather than replaced: parameters are addressed by
 * name (`core/refs.ts`), so an override that sets one of them must not drop
 * the others. Everything else is a plain key replacement — a nested object
 * prop is replaced whole, like the legacy variant merge does.
 *
 * Returns `base` itself when there is nothing to lay over.
 */
export function saunaOverlayProps(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined,
  options: { mergeParamsByName?: boolean } = {},
): Record<string, unknown> | undefined {
  if (!isPlainObject(overlay)) return base;
  const out: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(overlay)) {
    const prev = Object.hasOwn(out, key) ? out[key] : undefined;
    const next =
      options.mergeParamsByName && key === SAUNA_REF_PARAMS_PROP && isPlainObject(prev) && isPlainObject(value)
        ? { ...prev, ...value }
        : value;
    defineOwn(out, key, next);
  }
  return out;
}

/**
 * `target[key] = value` without the assignment semantics: a stored document is
 * JSON.parse output, where `"__proto__"` is an ordinary own key, and plain
 * assignment of that key would swap the result's PROTOTYPE instead of writing
 * a prop. Spread and `Object.entries` already treat it as data; this keeps the
 * write side consistent with them.
 */
function defineOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export type SaunaPropsLayers = {
  /** Lay `member.props` over the base — true only for a member on a hybrid node. */
  member?: boolean;
  /** Width being rendered; `undefined` or `"base"` lays nothing. */
  screen?: SaunaScreen | "base";
};

/**
 * A node's props after the SDL-632 layers, in contract order:
 * `props` < `member.props` (when `layers.member`) < `screens[screen].props`.
 * The legacy conditional variant goes on top of this, in `resolveNodeBody`.
 *
 * Identity-stable: returns `node.props` itself when no layer applies.
 */
export function saunaLayerNodeProps(
  node: SaunaNodeConfig,
  layers: SaunaPropsLayers,
): Record<string, unknown> | undefined {
  const mergeParamsByName = node.type === SAUNA_REF_TYPE;
  let props = node.props;
  if (layers.member && isPlainObject(node.member)) {
    props = saunaOverlayProps(props, node.member.props, { mergeParamsByName });
  }
  const screen = layers.screen;
  if (screen && screen !== "base" && isPlainObject(node.screens)) {
    const override = (node.screens as Record<string, unknown>)[screen];
    if (isPlainObject(override)) {
      props = saunaOverlayProps(props, override.props as Record<string, unknown> | undefined, { mergeParamsByName });
    }
  }
  return props;
}
