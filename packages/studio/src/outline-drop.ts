// Outline drag-and-drop: where does a dropped row actually land? (SDL-304)
//
// Phase 1 (SDL-301) only reordered siblings, so "which row am I over" was the
// whole answer. Phase 2 moves nodes BETWEEN parents, and then a single row
// carries two different meanings: "stand next to this node" and "go inside
// it". dnd-kit hands us one droppable per row and nothing else, so the split
// is ours to make — by where inside the row's box the pointer sits.
//
// The rule (Figma's layers panel, VS Code's explorer — the convention authors
// already know):
//
//   ┌───────────────┐  top 25%     → before the row, in ITS parent
//   │ ───────────── │  middle 50%  → inside the row, when it can hold children
//   └───────────────┘  bottom 25%  → after the row, in ITS parent
//
// Everything here is pure: `computeOutlineDrop` takes the schema, the catalog
// and one number (where in the row the pointer is, 0…1) and returns the exact
// insertion the drop will perform — the SAME value that draws the indicator
// line. One source for both is the point: an indicator computed separately
// from the operation is an indicator that lies.

import type {
  BlockDefinition,
  CanParentFn,
  SaunaNodeId,
  SaunaSchema,
} from "@markerloop/engine";

/** Where a drop would land. `index` is the position inside `parentId`. */
export type OutlineDropTarget = {
  /** The row the pointer is over — what the indicator attaches to. */
  overId: SaunaNodeId;
  /** Visual form of the indicator: a line above/below, or a ring around. */
  mode: "before" | "after" | "inside";
  parentId: SaunaNodeId;
  index: number;
};

/**
 * Which side of the nesting rule, if any, forbids putting `childType`
 * inside `parentType` (SDL-352).
 *
 * The rule has two halves and the kit declares both: the child's
 * `allowedParents` («куда можно вставлять это») and the parent's
 * `allowedChildren` («что можно класть внутрь»). The catalog's
 * `canAddChild` always read both; until SDL-352 this module read only the
 * child's — which is how `ToggleGroup` declared it takes nothing but
 * `ToggleGroupItem` and the modal offered it the whole catalogue anyway.
 *
 * The verdict names the refusing side because the Insert card words the
 * two differently: «Нельзя в Section» is a fact about the child,
 * «ToggleGroup принимает только ToggleGroupItem» a fact about the parent.
 * When both sides refuse, the child's wins — the same order `canAddChild`
 * checks in, and the sentence that stays true wherever the card is drawn.
 */
export type ParentRuleVerdict =
  | "allowed"
  | "child-refuses-parent"
  | "parent-refuses-child";

export function parentRuleVerdict(
  blocks: readonly BlockDefinition[] | undefined,
  parentType: string,
  childType: string
): ParentRuleVerdict {
  const childAllowed = blocks?.find((b) => b.type === childType)?.meta
    ?.allowedParents;
  if (childAllowed && !childAllowed.includes(parentType)) {
    return "child-refuses-parent";
  }
  const parentAllowed = blocks?.find((b) => b.type === parentType)?.meta
    ?.allowedChildren;
  if (parentAllowed && !parentAllowed.includes(childType)) {
    return "parent-refuses-child";
  }
  return "allowed";
}

/**
 * The insert modal's rule, lifted out of its render loop so drag and modal
 * cannot drift apart (they enforced the same sentence in two places, and
 * only one of them was on the drag path — which is how the outline let the
 * mouse do what the modal forbade).
 *
 * Both halves of the rule, same as the catalog's `canAddChild`
 * (see {@link parentRuleVerdict}). A block with no lists is allowed
 * anywhere: absence of a constraint is not a constraint. A type the
 * catalog does not describe at all is likewise unconstrained — the schema
 * may legitimately carry nodes the current catalog has no entry for, and
 * refusing to move them would make an unknown type un-editable rather
 * than merely un-insertable.
 */
export function canParentType(
  blocks: readonly BlockDefinition[] | undefined,
  parentType: string,
  childType: string
): boolean {
  return parentRuleVerdict(blocks, parentType, childType) === "allowed";
}

/**
 * `canParentType` as the store's `canParent` predicate — the same sentence
 * the outline and the insert modal read, handed to `reparentNode` so the
 * rule survives call sites that never touch this module.
 */
export function parentGuardFromBlocks(
  blocks: readonly BlockDefinition[] | undefined
): CanParentFn {
  return ({ parentType, childType }) =>
    canParentType(blocks, parentType, childType);
}

/**
 * Can a node of this type hold children at all?
 *
 * The kit has no "is a container" flag, so this is derived rather than
 * declared: a type is container-like when the catalog names it as a legal
 * parent for something. That covers every compound the kit ships — `Card`
 * (CardHeader/CardContent/…), `Tabs`, `Accordion`, `Table`, `Avatar`,
 * `InputGroup` — including while they are still EMPTY, which is the only
 * case where the middle zone is load-bearing: a container that already has
 * children can be entered by aiming at one of them.
 *
 * KNOWN GAP: a generic empty container nobody lists in `allowedParents`
 * (a bare `Section`/`Stack`) reads as a leaf here, so the middle of its row
 * splits into before/after instead of offering "inside". Nothing in the
 * catalog distinguishes it from a `Text`, and inventing a flag is a kit
 * change, not an outline change. Once it has one child it becomes reachable
 * the normal way.
 */
export function typeAcceptsChildren(
  blocks: readonly BlockDefinition[] | undefined,
  type: string
): boolean {
  return (blocks ?? []).some((b) => b.meta?.allowedParents?.includes(type));
}

/** Ids of `nodeId` and everything under it. Used as the cycle guard. */
function subtreeIds(schema: SaunaSchema, nodeId: SaunaNodeId): Set<SaunaNodeId> {
  const seen = new Set<SaunaNodeId>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of schema.nodes[id]?.children ?? []) stack.push(child);
  }
  return seen;
}

export type ComputeOutlineDropArgs = {
  schema: SaunaSchema;
  blocks?: readonly BlockDefinition[];
  /** The node being dragged. */
  activeId: SaunaNodeId;
  /** The row under the pointer. */
  overId: SaunaNodeId;
  /**
   * Pointer position inside the over-row's box: 0 = its top edge,
   * 1 = its bottom edge. Callers clamp; values outside the range are
   * clamped here too so a pointer in the gap between rows still resolves.
   */
  ratio: number;
};

/**
 * Resolve a hovered row + pointer position into the insertion that a drop
 * would perform, or `null` when no legal insertion exists there (dropping a
 * node into its own subtree, onto itself, or under a parent its
 * `allowedParents` forbids).
 *
 * Returning `null` is what makes the gate honest: the indicator is drawn
 * from this value, so an illegal target draws nothing and `handleDragEnd`
 * applies nothing — the author never sees a line promising a move that will
 * not happen.
 */
export function computeOutlineDrop(
  args: ComputeOutlineDropArgs
): OutlineDropTarget | null {
  const { schema, blocks, activeId, overId } = args;
  const ratio = Math.min(1, Math.max(0, args.ratio));

  if (activeId === overId) return null;
  const active = schema.nodes[activeId];
  const over = schema.nodes[overId];
  if (!active || !over) return null;
  if (activeId === schema.rootId) return null;

  // Cycle guard, the outline half of the one `reparentNode` keeps. Checked
  // here as well so the indicator never lights up over a descendant.
  const subtree = subtreeIds(schema, activeId);
  if (subtree.has(overId)) return null;

  const overParentId = schema.parents[overId] ?? null;

  const inside =
    typeAcceptsChildren(blocks, over.type) &&
    canParentType(blocks, over.type, active.type);

  // The middle 50% nests — but only into something that can hold children.
  // Over a leaf the whole row is an insertion zone, split down the middle,
  // which keeps plain sibling reordering as forgiving as it was in Phase 1.
  if (inside && ratio >= 0.25 && ratio < 0.75) {
    const children = over.children ?? [];
    const already = children.indexOf(activeId);
    // Appending, not prepending: with the container expanded, "first child"
    // is already reachable by aiming at the first child's top edge, and a
    // collapsed container has no visible position to speak of.
    //
    // `already >= 0` is the node being dragged onto the parent it is
    // already under: it vacates its slot first, so the last position is one
    // short — and if it IS the last child, the drop changes nothing and
    // must not light up.
    const index = already >= 0 ? children.length - 1 : children.length;
    if (already >= 0 && already === index) return null;
    return { overId, mode: "inside", parentId: overId, index };
  }

  // Sibling insertion happens in the OVER row's parent. The root row has no
  // parent, so it offers "inside" only — there is no "next to the root".
  if (!overParentId) return null;
  if (!canParentType(blocks, schema.nodes[overParentId]!.type, active.type)) {
    return null;
  }

  const siblings = schema.nodes[overParentId]?.children ?? [];
  const overIndex = siblings.indexOf(overId);
  if (overIndex < 0) return null;

  const mode: "before" | "after" = ratio < 0.5 ? "before" : "after";
  let index = mode === "before" ? overIndex : overIndex + 1;

  // Moving within one parent: the node vacates its own slot first, so an
  // index past it shifts down by one. Without this, "drop just below my
  // next sibling" lands the node back where it started and the drag reads
  // as if it did nothing.
  const activeIndex = siblings.indexOf(activeId);
  if (activeIndex >= 0 && activeIndex < index) index -= 1;

  if (activeIndex >= 0 && index === activeIndex) return null;

  return { overId, mode, parentId: overParentId, index };
}
