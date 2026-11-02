import type { SaunaNodeId, SaunaSchema } from "@markerloop/engine";

import type { SchemaOp } from "./types";

export type SaunaMoveDirection = "up" | "down";

/**
 * The `reorderChildren` op that moves a node one slot among its siblings, or
 * `null` when the move is impossible (SDL-303).
 *
 * `null` is the interesting half: the row menu draws «Выше»/«Ниже» disabled
 * from it and the hotkeys drop the keystroke, so both surfaces agree on when
 * a move exists instead of each deciding for itself. Impossible means the
 * root (no parent to reorder inside), an unknown id, or an edge — the first
 * child has no «up», the last no «down». Moving across parents is NOT this
 * gesture: that is the drag-and-drop reparent of SDL-304, and quietly
 * promoting a keystroke into a different operation is how an author loses a
 * node they only meant to nudge.
 */
export function saunaSiblingMoveOp(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  direction: SaunaMoveDirection
): Extract<SchemaOp, { kind: "reorderChildren" }> | null {
  if (!schema.nodes[nodeId]) return null;
  const parentId = schema.parents[nodeId];
  if (!parentId) return null;
  const siblings = schema.nodes[parentId]?.children ?? [];
  const fromIndex = siblings.indexOf(nodeId);
  if (fromIndex < 0) return null;

  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= siblings.length) return null;

  return { kind: "reorderChildren", parentId, fromIndex, toIndex };
}
