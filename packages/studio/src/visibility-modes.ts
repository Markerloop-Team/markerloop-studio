// Visibility modes and the hybrid member branch in the Studio (SDL-632, S6).
//
// The contract is the engine's (S3): `node.visibility` is a mode STRING —
// "public" (= absent), "hybrid", "private" — or the legacy condition object;
// `member.props` holds the values a signed-in member sees instead of the
// guest ones, and means something only where the mode in force (the node's
// own, else the nearest ancestor's) is hybrid. Props layer
// `props < member.props (member only) < screens[screen].props < legacy variant`.
//
// This file is the Studio's side of it, pure and React-free like
// ./screen-variants, so the store, the form, the canvas and the tests read one
// answer:
//
//   - where a properties edit lands (`studioEditTarget`): the base, a width,
//     or the member branch;
//   - what a field SHOWS for that target (the engine's own layering);
//   - how a mode switch is written: a STRING, never an object, and a node
//     that stops being hybrid takes every `member` in its subtree that no
//     longer means anything with it — in the same op, so one undo brings
//     both back;
//   - who the canvas renders for (`studioCanvasAudience`): preview is a
//     visitor's view and never shows a private node to a guest.

import {
  isSaunaVisibilityMode,
  saunaEffectiveVisibilityMode,
  saunaLayerNodeProps,
  saunaNodeVisibilityMode,
} from "@markerloop/engine";
import type {
  SaunaNodeConfig,
  SaunaNodeId,
  SaunaSchema,
  SaunaVisibilityMode,
} from "@markerloop/engine";

import {
  memberOverrideProps,
  screenOverrideProps,
  type StudioEditTarget,
  type StudioScreen,
} from "./screen-variants";

/** Who the author is looking as: a guest, or a signed-in member. */
export type StudioAudience = "guest" | "member";

/** The mode switch's options, in the order the design-system canvas draws them. */
export const STUDIO_VISIBILITY_MODES: readonly {
  id: SaunaVisibilityMode;
  label: string;
  guest: string;
  member: string;
}[] = [
  {
    id: "public",
    label: "Public",
    guest: "Sees the block.",
    member: "Sees the same block.",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    guest: "Sees the guest values.",
    member: "Sees the signed-in values where they are set, the guest ones elsewhere.",
  },
  {
    id: "private",
    label: "Private",
    guest: "Sees nothing — not even an empty gap where the block would be.",
    member: "Sees the block.",
  },
];

/** The node's `visibility` is the legacy condition object (not a mode). */
export function hasLegacyVisibilityRule(node: SaunaNodeConfig | undefined): boolean {
  const v = node?.visibility;
  return typeof v === "object" && v !== null;
}

/**
 * Where a properties edit of `nodeId` lands, given how the author is looking:
 *
 *   - at a width (Tablet/Phone) → that width's overrides. Widths lie ABOVE
 *     the member branch, so a width override is what BOTH audiences see —
 *     and what a guest receives: pages-service strips `member` from the
 *     public shell but not `screens`. That is why a width is always edited
 *     through GUEST eyes (`studioFieldProps` lays no member branch there,
 *     the Guests / Signed in tabs are off): a field that showed member
 *     values at Phone wrote them into `screens` on the first blur, and a
 *     guest on a phone got the member's data (S6 review);
 *   - at the base, looking as a member, on a node whose mode in force is
 *     hybrid → `member.props`;
 *   - otherwise → the base `props`.
 */
export function studioEditTarget(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  view: { screen: StudioScreen; audience: StudioAudience }
): StudioEditTarget {
  if (view.screen !== "base") return { kind: "screen", screen: view.screen };
  if (view.audience === "member" && saunaEffectiveVisibilityMode(schema, nodeId) === "hybrid") {
    return { kind: "member" };
  }
  return { kind: "base" };
}

/**
 * What the form shows for `target`: exactly what the canvas draws for the
 * same view — the engine's layering, never a second copy of it. `member` says
 * whether the member branch is laid under a width (a member looking at Phone
 * on a hybrid node sees member values where Phone overrides nothing).
 */
export function nodePropsForTarget(
  node: SaunaNodeConfig,
  target: StudioEditTarget,
  member = false
): Record<string, unknown> {
  if (target.kind === "base") return (node.props ?? {}) as Record<string, unknown>;
  if (target.kind === "member") {
    return (saunaLayerNodeProps(node, { member: true }) ?? {}) as Record<string, unknown>;
  }
  return (saunaLayerNodeProps(node, { member, screen: target.screen }) ?? {}) as Record<string, unknown>;
}

/**
 * What a field of `nodeId` shows for the author's current view — the width,
 * and the member branch where the author looks as a member at a hybrid node.
 * One reader for the form and the canvas's in-place text edit.
 */
export function studioFieldProps(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  view: { screen: StudioScreen; audience: StudioAudience }
): Record<string, unknown> {
  const node = schema.nodes[nodeId];
  if (!node) return {};
  // Never the member branch under a width: see `studioEditTarget`.
  return nodePropsForTarget(node, studioEditTarget(schema, nodeId, view), false);
}

/** The overrides `target` holds, or `undefined` at the base / when empty. */
export function targetOverrideProps(
  node: SaunaNodeConfig,
  target: StudioEditTarget
): Record<string, unknown> | undefined {
  if (target.kind === "base") return undefined;
  if (target.kind === "member") return memberOverrideProps(node);
  return screenOverrideProps(node, target.screen);
}

export function isTargetOverridden(
  node: SaunaNodeConfig,
  target: StudioEditTarget,
  key: string
): boolean {
  const overrides = targetOverrideProps(node, target);
  return !!overrides && Object.hasOwn(overrides, key);
}

function withoutMember(node: SaunaNodeConfig): SaunaNodeConfig {
  const next: SaunaNodeConfig = { ...node };
  delete next.member;
  return next;
}

/**
 * The mode `nodeId` would inherit with no `visibility` of its own: its
 * parent's mode in force, `"public"` at the root.
 */
export function inheritedVisibilityMode(schema: SaunaSchema, nodeId: SaunaNodeId): SaunaVisibilityMode {
  const parent = schema.parents?.[nodeId];
  return parent ? saunaEffectiveVisibilityMode(schema, parent) : "public";
}

/**
 * Why `mode` may not be written on `nodeId`, or `null` when it may. The
 * root is public or absent — pages-service refuses anything else with 422
 * `invalid_visibility`, and every autosave after it would fail.
 */
export function visibilityModeRefusal(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  mode: SaunaVisibilityMode | null
): string | null {
  if (mode !== null && !isSaunaVisibilityMode(mode)) return "Not a visibility mode.";
  if (nodeId === schema.rootId && mode !== null && mode !== "public") {
    return "The page itself is always public. Set Hybrid or Private on a block inside it.";
  }
  return null;
}

/**
 * `schema` with `nodeId`'s visibility set to `mode` — always the STRING,
 * never an object (a legacy condition is replaced) — or REMOVED when `mode`
 * is `null`, or is public/hybrid and equals the mode the node would inherit
 * anyway (an explicit "public" under a hybrid block would silently take it
 * out of hybrid). An explicit "private" is never collapsed: it must survive
 * the enclosing block leaving Private. Every `member` in the subtree that no longer sits under a
 * hybrid mode is dropped. One schema out, so the store pushes one history
 * frame for both: undo brings the mode and the member values back together.
 *
 * Returns `schema` itself when nothing changes or the write is refused
 * (`visibilityModeRefusal`).
 */
export function withVisibilityMode(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  mode: SaunaVisibilityMode | null
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node) return schema;
  if (visibilityModeRefusal(schema, nodeId, mode)) return schema;
  // Only public and hybrid collapse to "inherit". An explicit Private is
  // ALWAYS stored: collapsing it to the enclosing Private would make the node
  // public the moment that enclosing block leaves Private — fail-open, a
  // guest would receive what the author closed (S6 re-review).
  const stored =
    mode === null || (mode !== "private" && mode === inheritedVisibilityMode(schema, nodeId))
      ? undefined
      : mode;
  if (node.visibility === stored) return schema;
  const written: SaunaNodeConfig = { ...node };
  if (stored === undefined) delete written.visibility;
  else written.visibility = stored;
  const nodes: SaunaSchema["nodes"] = { ...schema.nodes, [nodeId]: written };
  const next: SaunaSchema = { ...schema, nodes };
  pruneMembers(next, nodes, nodeId);
  return next;
}

/**
 * Walks `nodeId`'s subtree in `next` (whose `nodes` IS `nodes`) and drops
 * `member` where the mode in force is no longer hybrid. A descendant that
 * declares hybrid itself keeps its branch.
 */
function pruneMembers(next: SaunaSchema, nodes: SaunaSchema["nodes"], nodeId: SaunaNodeId): void {
  const stack: SaunaNodeId[] = [nodeId];
  const seen = new Set<SaunaNodeId>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const current = nodes[id];
    if (!current) continue;
    if (current.member !== undefined && saunaEffectiveVisibilityMode(next, id) !== "hybrid") {
      nodes[id] = withoutMember(current);
    }
    for (const child of current.children ?? []) stack.push(child);
  }
}

/**
 * `schema` with every `member` in `nodeId`'s subtree dropped where the mode
 * in force is not hybrid — for a move: a node carried out from under a
 * hybrid block must not keep a branch no reader shows (S6 review, S7).
 * Returns `schema` itself when nothing is dropped.
 */
export function withMembersPruned(schema: SaunaSchema, nodeId: SaunaNodeId): SaunaSchema {
  const nodes: SaunaSchema["nodes"] = { ...schema.nodes };
  const next: SaunaSchema = { ...schema, nodes };
  pruneMembers(next, nodes, nodeId);
  return Object.keys(nodes).some((id) => nodes[id] !== schema.nodes[id]) ? next : schema;
}

/**
 * How many `member` branches leaving hybrid at `nodeId` would actually clear:
 * those in the subtree whose mode in force stops being hybrid. A descendant
 * that declares hybrid itself keeps its branch and is not counted. Works for
 * an own and an inherited hybrid alike.
 */
export function memberBranchCount(schema: SaunaSchema, nodeId: SaunaNodeId): number {
  if (saunaEffectiveVisibilityMode(schema, nodeId) !== "hybrid") return 0;
  const node = schema.nodes[nodeId];
  if (!node) return 0;
  // Probe the write that leaving hybrid is, without the root/inherit rules:
  // an explicit non-hybrid mode on the node itself.
  const probe = withVisibilityModeUnchecked(schema, nodeId, "private");
  let count = 0;
  for (const [id, n] of Object.entries(schema.nodes)) {
    if (n?.member !== undefined && probe.nodes[id]?.member === undefined) count += 1;
  }
  return count;
}

/**
 * How many blocks INSIDE `nodeId` stop being private — become visible to
 * guests — if `nodeId` leaves Private: the descendants that are private now
 * only through it. Zero when the mode in force is not private.
 */
export function privateRevealCount(schema: SaunaSchema, nodeId: SaunaNodeId): number {
  if (saunaEffectiveVisibilityMode(schema, nodeId) !== "private") return 0;
  if (!schema.nodes[nodeId]) return 0;
  const probe = withVisibilityModeUnchecked(schema, nodeId, "public");
  let count = 0;
  const stack: SaunaNodeId[] = [...(schema.nodes[nodeId]!.children ?? [])];
  const seen = new Set<SaunaNodeId>([nodeId]);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = schema.nodes[id];
    if (!node) continue;
    if (saunaEffectiveVisibilityMode(probe, id) !== "private") count += 1;
    for (const child of node.children ?? []) stack.push(child);
  }
  return count;
}

function withVisibilityModeUnchecked(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  mode: SaunaVisibilityMode
): SaunaSchema {
  const node = schema.nodes[nodeId]!;
  const nodes: SaunaSchema["nodes"] = { ...schema.nodes, [nodeId]: { ...node, visibility: mode } };
  const next: SaunaSchema = { ...schema, nodes };
  pruneMembers(next, nodes, nodeId);
  return next;
}

/** The mode the node itself declares, `"public"` when it declares none. */
export function studioNodeMode(node: SaunaNodeConfig | undefined): SaunaVisibilityMode {
  return saunaNodeVisibilityMode(node) ?? "public";
}

/**
 * Who the canvas renders for (`context.audience`).
 *
 *   - Preview is a visitor's view, and the visitor it shows is a GUEST: a
 *     private block is not drawn, a hybrid one shows its guest values. This
 *     is the half of the S4 guarantee (pages-service strips private from the
 *     public shell) the author can see before publishing.
 *   - Editing follows the Guests / Signed in choice — except that a selected
 *     node under a private mode is drawn as a member sees it, because the
 *     author who is editing it has to see what they are editing.
 */
export function studioCanvasAudience(args: {
  preview: boolean;
  audience: StudioAudience;
  selectedMode?: SaunaVisibilityMode;
  /** The width being edited: at Tablet/Phone the canvas draws guest values. */
  screen?: StudioScreen;
}): StudioAudience {
  if (args.preview) return "guest";
  // A width is edited through guest eyes (see `studioEditTarget`), so the
  // canvas draws what the form edits there — before anything else, a
  // selected private block included.
  if (args.screen && args.screen !== "base") return "guest";
  if (args.selectedMode === "private") return "member";
  return args.audience;
}
