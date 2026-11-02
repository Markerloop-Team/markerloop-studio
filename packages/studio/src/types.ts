// Discriminated union of every mutation the Studio applies to a schema.
//
// Every operation goes through `applyOp` on the store. Centralising the
// vocabulary buys us:
//   - one place that knows how to invert/replay ops (history)
//   - one place that knows how to serialise an op to the network if we
//     ever switch from snapshot-based saves to op-log saves
//   - exhaustive `switch` checks across the whole package

import type {
  SaunaNewNode,
  SaunaNodeConfig,
  SaunaNodeId,
  SaunaParamSpec,
  SaunaSchema,
  SaunaScreen,
  SaunaVisibilityMode,
  VariantSpec,
  VisibilityRule,
} from "@markerloop/engine";

export type SchemaOp =
  | {
      kind: "addChild";
      parentId: SaunaNodeId;
      /**
       * `propsVersion`, when given, is what the node's props follow; absent,
       * the store writes the Element's own (`propsVersionOf`, SDL-667).
       */
      child: SaunaNewNode;
      /**
       * Position among the parent's children (SDL-368: the PO editor
       * inserts a section INTO a boundary). Omitted or out of range —
       * appends, exactly what the op always did.
       */
      index?: number;
    }
  | { kind: "remove"; nodeId: SaunaNodeId }
  | {
      /**
       * Swap the subtree at `nodeId` for a fresh node of `child.type`, at
       * the same position under the same parent (SDL-368 «Заменить
       * секцию»). One op — one history snapshot, so a single undo brings
       * the old section back whole.
       */
      kind: "replaceNode";
      nodeId: SaunaNodeId;
      child: SaunaNewNode;
    }
  | {
      kind: "renameNode";
      nodeId: SaunaNodeId;
      /** Trimmed by the op; `null` or blank clears the name (SDL-302). */
      name: string | null;
    }
  | { kind: "duplicate"; nodeId: SaunaNodeId }
  | {
      /**
       * The node's subtree has just been written to `/blocks/<blockId>`;
       * leave a reference to it in the node's place (SDL-341). The block
       * itself is created by the host BEFORE the op is applied — the op is
       * the page half only, so a failed write never leaves a dangling ref.
       */
      kind: "replaceWithRef";
      nodeId: SaunaNodeId;
      blockId: string;
    }
  | {
      /**
       * «Detach» (SDL-720): the Ref at `nodeId` becomes a copy of
       * `block`'s body with the Ref's own `params` written in (an empty
       * parameter takes the spec's default, else the block's value —
       * `applyBlockParams`). The node keeps its id; descendants get fresh
       * ids (`expandRefIntoCopy`). One op — one history frame, so a single
       * undo brings the Ref back whole. `block` is the Component the host
       * already holds; the op refuses (no frame) when the node is not a Ref
       * to `blockId`.
       */
      kind: "expandRef";
      nodeId: SaunaNodeId;
      blockId: string;
      block: SaunaSchema;
    }
  | {
      kind: "reorderChildren";
      parentId: SaunaNodeId;
      fromIndex: number;
      toIndex: number;
    }
  | {
      kind: "reparent";
      nodeId: SaunaNodeId;
      newParentId: SaunaNodeId;
      index?: number;
    }
  | { kind: "updateNodeConfig"; nodeId: SaunaNodeId; next: SaunaNodeConfig }
  | {
      kind: "updateNodePropsPartial";
      nodeId: SaunaNodeId;
      patch: Record<string, unknown>;
    }
  | {
      /**
       * Writes `patch` into `screens[screen].props` — a width variant
       * (SDL-632). Only the keys that differ from the base live there.
       */
      kind: "setScreenProps";
      nodeId: SaunaNodeId;
      screen: SaunaScreen;
      patch: Record<string, unknown>;
    }
  | {
      /**
       * Reset of one overridden field at a width (SDL-632): DELETES `key`
       * from `screens[screen].props` (and an emptied width / `screens`), so
       * the field inherits the base again. Never writes `""`.
       */
      kind: "resetScreenProp";
      nodeId: SaunaNodeId;
      screen: SaunaScreen;
      key: string;
    }
  | {
      /**
       * Writes `patch` into `member.props` — the values a signed-in member
       * sees on a hybrid node (SDL-632, S6). Same storage rules as a width:
       * only differences from the base, an emptied field stored as empty.
       */
      kind: "setMemberProps";
      nodeId: SaunaNodeId;
      patch: Record<string, unknown>;
    }
  | {
      /** Reset of one member field: DELETES `key` from `member.props`. */
      kind: "resetMemberProp";
      nodeId: SaunaNodeId;
      key: string;
    }
  | {
      /**
       * Sets the node's visibility MODE (SDL-632, S6) — always the string,
       * never an object — or removes the field (`null`, or the mode the node
       * inherits anyway). A subtree that stops being hybrid loses its
       * `member` branches in the same op (one undo step). Refused on the
       * root for anything but public.
       */
      kind: "setVisibilityMode";
      nodeId: SaunaNodeId;
      mode: SaunaVisibilityMode | null;
    }
  | {
      /**
       * The item list of a `TabsView` / `AccordionView` (SDL-633), changed
       * together with the children bound to the items by position: `add`
       * appends an item with a content child of its own, `remove` drops an
       * item and its child's subtree, `move` carries the child along. One op —
       * one history frame. A no-op (a refused move, an add at the cap) is none.
       * Every action also drops `items` from the node's width and member
       * overrides, so the list is the same for every width and visitor.
       */
      kind: "compoundItems";
      nodeId: SaunaNodeId;
      edit:
        | { action: "add"; item: { label: string; text: string } }
        | { action: "remove"; index: number }
        | { action: "move"; from: number; to: number }
        /** Headings and texts only — the same number of items. */
        | { action: "set"; items: { label: string; text: string }[] };
    }
  | {
      kind: "setVisibility";
      nodeId: SaunaNodeId;
      rule: VisibilityRule | null;
    }
  | {
      kind: "setVariants";
      nodeId: SaunaNodeId;
      /** Whole-array replacement. `null` or empty array clears the field. */
      variants: VariantSpec[] | null;
    }
  | {
      /**
       * The parameters this document exposes when it is referenced as a
       * block (SDL-503, EP-61).
       *
       * DOCUMENT-level, unlike every op above it: a manifest belongs to the
       * whole component, not to whichever node happens to be selected. That
       * is also why it carries no `nodeId` — the node a parameter points at
       * lives inside the spec.
       */
      kind: "setBlockParams";
      /** Whole-array replacement. `null` or empty array clears the field. */
      params: SaunaParamSpec[] | null;
    };

/** Selection state. `null` means nothing is selected. */
export type Selection = { nodeId: SaunaNodeId | null };
