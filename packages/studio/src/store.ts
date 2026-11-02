// Zustand store factory for one Studio instance.
//
// Per-instance: every <SaunaStudio> mounts its own store via
// `createStudioStore(initial)`. The factory pattern is deliberate —
// multiple Studios can coexist on a page (e.g. preview + drawer)
// without sharing state. The shell uses React.useState to keep the
// store handle stable across renders.

import { createStore, type StoreApi } from "zustand/vanilla";

import {
  addChildNode,
  applyBlockParams,
  expandRefIntoCopy,
  refParamValues,
  addCompoundItem,
  moveCompoundItem,
  removeCompoundItem,
  setCompoundItems,
  duplicateSubtree,
  isSaunaVisibilityMode,
  removeSubtree,
  renameNode,
  replaceSubtreeWithNode,
  replaceSubtreeWithRef,
  reorderChildren,
  reparentNode,
  saunaEffectiveVisibilityMode,
  setBlockParams as setBlockParamsOp,
  setVariants as setVariantsOp,
  setVisibility as setVisibilityOp,
  updateNodeConfig,
  updateNodePropsPartial,
} from "@markerloop/engine";
import type { CanParentFn, SaunaNewNode, SaunaNodeId, SaunaPropsVersionOf, SaunaSchema } from "@markerloop/engine";
import {
  applyRedo,
  applyUndo,
  canRedo,
  canUndo,
  createHistory,
  DEFAULT_HISTORY_DEPTH,
  pushHistory,
  type HistoryState,
} from "./history";
import { saunaInsertRefusedReason } from "./insert-copy";
import type { OutlineDropTarget } from "./outline-drop";
import {
  withMemberPropsPatch,
  withoutMemberProp,
  withoutScreenProp,
  withScreenPropsPatch,
  type StudioEditTarget,
  type StudioScreen,
} from "./screen-variants";
import { withMembersPruned, withVisibilityMode, type StudioAudience } from "./visibility-modes";
import type { SchemaOp, Selection } from "./types";

/**
 * What `applyOp` did (SDL-634). A refusal by the nesting rule carries a
 * `reason` the caller can show; any other non-change (an op that changes
 * nothing, an id that is not in the schema) carries none.
 */
export type ApplyOpResult =
  | { applied: true }
  | { applied: false; reason?: string };

/** An in-flight in-place edit: which node's which prop, and the live text. */
export type TextDraft = {
  nodeId: SaunaNodeId;
  prop: string;
  value: string;
};

export type StudioState = {
  schema: SaunaSchema;
  selection: Selection;
  /**
   * Node under the pointer, on either surface, or null (SDL-300).
   *
   * Lives here rather than in the canvas layer because two surfaces read
   * it: the canvas draws its thin frame, the outline marks its row. It is
   * the same class of state as `selection` — a pointer into the schema
   * that no one persists — and it is deliberately NOT part of `history`:
   * undo restores what the author changed, and moving the mouse is not a
   * change.
   */
  hoveredId: SaunaNodeId | null;
  /**
   * Text the author is typing into the canvas RIGHT NOW, before it commits
   * (SDL-378). The board promises the properties field "обновляется по мере
   * набора", and the two surfaces live in different React trees — the field
   * is in the admin chrome, the caret is inside the iframe — so the draft
   * travels through the store like `hoveredId` does.
   *
   * Deliberately NOT in `history` and NOT in `schema`: an undo step per
   * keystroke is exactly what the in-place editor was built to avoid (one
   * entry per session, pinned by e2e 21), and a schema that changes on every
   * character would auto-save the same way. This is a display value with a
   * lifetime of one editing session.
   */
  textDraft: TextDraft | null;
  /**
   * Where the outline drag in flight would land, or null when nothing is
   * being dragged (SDL-378).
   *
   * The third piece of state to move here for the same reason as `hoveredId`
   * and `textDraft`: two surfaces read it and they are in different React
   * trees. The outline computes it and draws the line on its row; the canvas
   * — portalled into the iframe document — mirrors it between the author's
   * own blocks, which is what the board draws and what the editor could not
   * do while this lived in a `useState` inside the outline.
   *
   * NOT in `history` and not in `schema`: a drag that is abandoned changes
   * nothing, and the drop itself is an ordinary `applyOp`.
   */
  dropTarget: OutlineDropTarget | null;
  history: HistoryState;
  /**
   * How the author is LOOKING at the document, as opposed to what is in it
   * (SDL-632). `screen` is the width variant being edited — `"base"`, or a
   * width whose `screens[screen].props` the Properties form writes to — and
   * the canvas renders at that width with that variant applied.
   *
   * Not in `history` and not in `schema`: switching to Phone changes nothing
   * in the document, and undo must not flip the author between widths.
   */
  view: { screen: StudioScreen; audience: StudioAudience };
  /** Switches the width variant being edited and shown. */
  setScreen(screen: StudioScreen): void;
  /**
   * Switches who the author is looking as (SDL-632, S6): the Guests /
   * Signed in tabs of a hybrid node. On a hybrid node at the base width
   * "member" makes the form edit `member.props`; the canvas renders for the
   * same audience. Not in history, like the width.
   */
  setAudience(audience: StudioAudience): void;
  /**
   * Last `applyOp` may have re-pointed selection (e.g. remove). An op that
   * would put a node under a parent the nesting rule forbids is refused
   * here, whoever called it, with the tree left as it was (SDL-634).
   */
  applyOp(op: SchemaOp): ApplyOpResult;
  selectNode(id: SaunaNodeId | null): void;
  /** Marks the node under the pointer. `null` clears the mark. */
  hoverNode(id: SaunaNodeId | null): void;
  /** Publishes the uncommitted canvas text. `null` ends the draft. */
  setTextDraft(draft: TextDraft | null): void;
  /** Publishes where the outline drag would land. `null` ends the drag. */
  setDropTarget(target: OutlineDropTarget | null): void;
  undo(): void;
  redo(): void;
  /** Replace the entire schema (e.g. after reload). Clears history. */
  loadSchema(schema: SaunaSchema): void;
};

export type StudioStore = StoreApi<StudioState>;

export type CreateStudioStoreOptions = {
  /** Initial schema to load. Required. */
  initialSchema: SaunaSchema;
  /** Initially selected node. Defaults to no selection. */
  initialSelection?: SaunaNodeId | null;
  /** Override history ring-buffer depth. Default 100. */
  historyDepth?: number;
  /**
   * Nesting rule (SDL-304, SDL-634): the catalog's `allowedParents` and
   * `allowedChildren`, as a predicate. Supplied by the host that owns the
   * block catalog — `parentGuardFromBlocks(BLOCKS)`. Checked for every op
   * that puts a node under a parent: `addChild`, `replaceNode`, `reparent`,
   * `duplicate`. Omitted, the store enforces only the structural guards
   * (cycles, root).
   */
  canParent?: CanParentFn;
  /**
   * The Element definitions' props versions (SDL-667, EP-128), as a lookup —
   * `propsVersionsFromBlocks(BLOCKS)` from the host that owns the catalog.
   * Every node the store CREATES (`addChild`, `replaceNode`, the content
   * child of a new compound item) is stamped with its Element's version, so
   * the props the editor just wrote are never read back as another
   * contract's. Written only when it is not 1 ("absent means 1"); an op that
   * names its own `child.propsVersion` keeps it. A `duplicate` keeps the
   * source's version — a copy is the same props at the same contract.
   * Omitted, the store writes only what the op says.
   */
  propsVersionOf?: SaunaPropsVersionOf;
};

export function createStudioStore(opts: CreateStudioStoreOptions): StudioStore {
  const historyDepth = opts.historyDepth ?? DEFAULT_HISTORY_DEPTH;
  const canParent = opts.canParent;
  const propsVersionOf = opts.propsVersionOf;

  return createStore<StudioState>((set, get) => ({
    schema: opts.initialSchema,
    selection: { nodeId: opts.initialSelection ?? null },
    hoveredId: null,
    textDraft: null,
    dropTarget: null,
    history: createHistory(),
    view: { screen: "base", audience: "guest" },

    setScreen(screen) {
      if (get().view.screen === screen) return;
      set({ view: { ...get().view, screen } });
    },

    setAudience(audience) {
      if (get().view.audience === audience) return;
      set({ view: { ...get().view, audience } });
    },

    applyOp(op) {
      const { schema, selection, hoveredId, textDraft, history } = get();
      const refused = canParent ? refusedInsertion(schema, op, canParent) : null;
      if (refused) return { applied: false, reason: refused };
      const result = applySchemaOp(schema, selection, op, { canParent, propsVersionOf });
      if (!result) return { applied: false };
      const { schema: nextSchema, selection: nextSelection } = result;
      if (nextSchema === schema && nextSelection === selection) return { applied: false };

      set({
        schema: nextSchema,
        selection: nextSelection,
        // A node that just left the schema cannot stay marked: the outline
        // row is gone and the canvas box with it, so the mark would hang
        // over nothing until the next pointer move. Cleared here rather
        // than in an effect of the canvas layer, which only runs while
        // that layer is mounted — the outline alone would have kept it.
        hoveredId: hoveredId && !nextSchema.nodes[hoveredId] ? null : hoveredId,
        // Same reasoning one line up, and one more: the commit that ends an
        // editing session IS an `applyOp`, so a draft left behind here would
        // outlive its session and keep overriding the field it was meant to
        // preview.
        textDraft:
          textDraft && !nextSchema.nodes[textDraft.nodeId] ? null : textDraft,
        // Unconditional, unlike the two above: a drop target is a `parentId`
        // plus an INDEX into that parent's children, and both were computed
        // against the schema this op just replaced. Keeping it would leave
        // the canvas drawing a line at a position that no longer means what
        // it meant. The drop's own `applyOp` arrives after `handleDragEnd`
        // has already cleared it, so this only catches schema changes from
        // elsewhere (undo, a delete from the row menu) mid-drag.
        dropTarget: null,
        history: pushHistory(history, schema, historyDepth),
      });
      return { applied: true };
    },

    selectNode(id) {
      const { selection } = get();
      if (selection.nodeId === id) return;
      set({ selection: { nodeId: id } });
    },

    hoverNode(id) {
      const { hoveredId, schema } = get();
      if (hoveredId === id) return;
      // An id that is not in the schema is dropped rather than stored: the
      // canvas hit-tests a DOM attribute, which can name a node the schema
      // no longer has (a stale frame between a delete and its repaint).
      if (id !== null && !schema.nodes[id]) return;
      set({ hoveredId: id });
    },

    setTextDraft(draft) {
      const { textDraft } = get();
      if (
        textDraft?.nodeId === draft?.nodeId &&
        textDraft?.prop === draft?.prop &&
        textDraft?.value === draft?.value
      ) {
        return;
      }
      set({ textDraft: draft });
    },

    setDropTarget(target) {
      const { dropTarget } = get();
      // Field-by-field, not by reference: `dropFromEvent` builds a fresh
      // object on every pointer move, so an identity check would re-render
      // both surfaces on every pixel of travel while the answer stood still.
      if (
        dropTarget?.overId === target?.overId &&
        dropTarget?.mode === target?.mode &&
        dropTarget?.index === target?.index &&
        dropTarget?.parentId === target?.parentId
      ) {
        return;
      }
      set({ dropTarget: target });
    },

    undo() {
      const { schema, history } = get();
      if (!canUndo(history)) return;
      const undone = applyUndo(history, schema);
      if (!undone) return;
      set({ schema: undone.nextSchema, history: undone.nextHistory });
    },

    redo() {
      const { schema, history } = get();
      if (!canRedo(history)) return;
      const redone = applyRedo(history, schema);
      if (!redone) return;
      set({ schema: redone.nextSchema, history: redone.nextHistory });
    },

    loadSchema(schema) {
      set({
        schema,
        selection: { nodeId: null },
        hoveredId: null,
        textDraft: null,
        dropTarget: null,
        history: createHistory(),
      });
    },
  }));
}

/**
 * Why `op` may not run under the nesting rule, or `null` when it may — or
 * when it puts nothing under a parent at all. One place for every insertion
 * path, so the Insert modal, the outline drag, the row menu's duplicate and
 * a host calling `applyOp` directly all meet the same check (SDL-634).
 *
 * `replaceWithRef` is not here on purpose: the node's content moves into a
 * block and the `Ref` draws that same content in the same place.
 */
function refusedInsertion(
  schema: SaunaSchema,
  op: SchemaOp,
  canParent: CanParentFn
): string | null {
  let parentId: SaunaNodeId | null | undefined;
  let childType: string | undefined;
  switch (op.kind) {
    case "addChild":
      parentId = op.parentId;
      childType = op.child.type;
      break;
    case "replaceNode":
      parentId = schema.parents[op.nodeId];
      childType = op.child.type;
      break;
    case "reparent":
      parentId = op.newParentId;
      childType = schema.nodes[op.nodeId]?.type;
      break;
    case "duplicate":
      parentId = schema.parents[op.nodeId];
      childType = schema.nodes[op.nodeId]?.type;
      break;
    default:
      return null;
  }
  const parentType = parentId ? schema.nodes[parentId]?.type : undefined;
  if (parentType === undefined || childType === undefined) return null;
  return canParent({ parentType, childType })
    ? null
    : saunaInsertRefusedReason(childType, parentType);
}

/**
 * Applies `op` to the schema, returns the next schema + selection.
 * Returns `null` when the op was a no-op (so the store can skip the
 * history push).
 *
 * Selection is re-pointed on remove (selection lands on the removed
 * node's parent if the removed node was selected) and on duplicate
 * (selection follows the new copy).
 */
function applySchemaOp(
  schema: SaunaSchema,
  selection: Selection,
  op: SchemaOp,
  opts?: { canParent?: CanParentFn; propsVersionOf?: SaunaPropsVersionOf }
): { schema: SaunaSchema; selection: Selection } | null {
  switch (op.kind) {
    case "addChild": {
      const { schema: next, nodeId } = addChildNode(
        schema,
        op.parentId,
        withPropsVersion(op.child, opts?.propsVersionOf),
        op.index,
        { canParent: opts?.canParent }
      );
      if (next === schema) return null;
      return { schema: next, selection: { nodeId } };
    }
    case "replaceNode": {
      const { schema: next, nodeId } = replaceSubtreeWithNode(
        schema,
        op.nodeId,
        withPropsVersion(op.child, opts?.propsVersionOf),
        { canParent: opts?.canParent }
      );
      if (next === schema) return null;
      // Selection follows the replacement, as it follows a duplicate's
      // copy: the author asked for a new section HERE, and the chrome
      // should frame what they just got.
      return { schema: next, selection: { nodeId } };
    }
    case "remove": {
      const { schema: next, parentId } = removeSubtree(schema, op.nodeId);
      if (next === schema) return null;
      const wasSelected = selection.nodeId === op.nodeId;
      return {
        schema: next,
        selection: wasSelected ? { nodeId: parentId } : selection,
      };
    }
    case "renameNode": {
      const next = renameNode(schema, op.nodeId, op.name);
      if (next === schema) return null;
      // Selection deliberately untouched: on the approved canvas the row
      // being renamed is NOT the selected row, so renaming must not steal
      // the properties panel away from whatever the author was editing.
      return { schema: next, selection };
    }
    case "duplicate": {
      const { schema: next, nodeId } = duplicateSubtree(schema, op.nodeId);
      if (next === schema) return null;
      return { schema: next, selection: { nodeId } };
    }
    case "replaceWithRef": {
      const next = replaceSubtreeWithRef(schema, op.nodeId, op.blockId);
      if (next === schema) return null;
      // Selection deliberately stays on the node: it kept its id and it is
      // still the row the author was looking at — now a reference to the
      // component they just made out of it.
      return { schema: next, selection };
    }
    case "expandRef": {
      const values = refParamValues(schema.nodes[op.nodeId]);
      const next = expandRefIntoCopy(schema, op.nodeId, op.blockId, applyBlockParams(op.block, values));
      if (next === schema) return null;
      // The node kept its id — it is the root of the copy now — so the
      // selection stays on it and the Properties turn into the ordinary ones.
      return { schema: next, selection };
    }
    case "reorderChildren": {
      const next = reorderChildren(schema, op.parentId, op.fromIndex, op.toIndex);
      if (next === schema) return null;
      return { schema: next, selection };
    }
    case "reparent": {
      const moved = reparentNode(schema, op.nodeId, op.newParentId, op.index, {
        canParent: opts?.canParent,
      });
      if (moved === schema) return null;
      // Out from under a hybrid block, `member` means nothing: drop it in the
      // same frame, so undo brings the move and the branch back together.
      const next = withMembersPruned(moved, op.nodeId);
      return { schema: next, selection };
    }
    case "updateNodeConfig": {
      // A caller that worked out "nothing changes" hands the node back
      // itself (the raw JSON field at a width, SDL-632) — no frame for it.
      if (op.next === schema.nodes[op.nodeId]) return null;
      const next = updateNodeConfig(schema, op.nodeId, op.next);
      if (next === schema) return null;
      return { schema: next, selection };
    }
    case "updateNodePropsPartial": {
      // The engine op returns a fresh schema even when every patched value
      // already holds, and the store would then push an undo step that
      // changes nothing (a properties field re-committing its own value on
      // blur). Caught by the package tests (SDL-604): a no-op is no frame.
      const current = schema.nodes[op.nodeId]?.props ?? {};
      const unchanged = Object.entries(op.patch).every(([key, value]) =>
        Object.is((current as Record<string, unknown>)[key], value)
      );
      if (unchanged) return null;
      const next = updateNodePropsPartial(schema, op.nodeId, op.patch);
      if (next === schema) return null;
      return { schema: next, selection };
    }
    case "setScreenProps":
    case "resetScreenProp": {
      const node = schema.nodes[op.nodeId];
      if (!node) return null;
      const nextNode =
        op.kind === "setScreenProps"
          ? withScreenPropsPatch(node, op.screen, op.patch)
          : withoutScreenProp(node, op.screen, op.key);
      if (nextNode === node) return null;
      return { schema: updateNodeConfig(schema, op.nodeId, nextNode), selection };
    }
    case "setMemberProps":
    case "resetMemberProp": {
      const node = schema.nodes[op.nodeId];
      if (!node) return null;
      // `member.props` means something only where the mode in force is
      // hybrid; a write anywhere else would store data no reader shows and
      // the next mode change would silently discard.
      if (op.kind === "setMemberProps" && saunaEffectiveVisibilityMode(schema, op.nodeId) !== "hybrid") {
        return null;
      }
      const nextNode =
        op.kind === "setMemberProps"
          ? withMemberPropsPatch(node, op.patch)
          : withoutMemberProp(node, op.key);
      if (nextNode === node) return null;
      return { schema: updateNodeConfig(schema, op.nodeId, nextNode), selection };
    }
    case "setVisibilityMode": {
      // Only a mode string or `null` (remove), and never a non-public root:
      // `withVisibilityMode` refuses both and hands the schema back.
      if (op.mode !== null && !isSaunaVisibilityMode(op.mode)) return null;
      const next = withVisibilityMode(schema, op.nodeId, op.mode);
      if (next === schema) return null;
      return { schema: next, selection };
    }
    case "compoundItems": {
      const before = schema.nodes[op.nodeId];
      const e = op.edit;
      const next =
        e.action === "add"
          ? addCompoundItem(schema, op.nodeId, e.item, { propsVersionOf: opts?.propsVersionOf })
          : e.action === "remove"
            ? removeCompoundItem(schema, op.nodeId, e.index)
            : e.action === "set"
              ? setCompoundItems(schema, op.nodeId, e.items)
              : moveCompoundItem(schema, op.nodeId, e.from, e.to);
      const after = next.nodes[op.nodeId];
      // A refused edit (a move that would open a hole, an add at the cap)
      // comes back unchanged; compare the node's content, not identity.
      if (next === schema || !before || !after || JSON.stringify(before) === JSON.stringify(after)) {
        return null;
      }
      // A selection inside the removed item's content goes to the compound.
      const lost = selection.nodeId !== null && !next.nodes[selection.nodeId];
      return { schema: next, selection: lost ? { nodeId: op.nodeId } : selection };
    }
    case "setVisibility": {
      const next = setVisibilityOp(schema, op.nodeId, op.rule);
      if (next === schema) return null;
      return { schema: next, selection };
    }
    case "setVariants": {
      const next = setVariantsOp(schema, op.nodeId, op.variants);
      if (next === schema) return null;
      return { schema: next, selection };
    }
    // Selection is carried through untouched: naming a parameter must not
    // move the author off the node whose field they just named, and a
    // manifest is not addressed by node anyway.
    case "setBlockParams": {
      const next = setBlockParamsOp(schema, op.params);
      if (next === schema) return null;
      return { schema: next, selection };
    }
  }
}

/**
 * The new node with the version its props follow (SDL-667): the op's own
 * when it names one, else the Element's from the lookup. Whether it is
 * written at all ("not when 1") is the engine's call, in one place.
 */
function withPropsVersion(child: SaunaNewNode, propsVersionOf: SaunaPropsVersionOf | undefined): SaunaNewNode {
  if (child.propsVersion !== undefined || !propsVersionOf) return child;
  const propsVersion = propsVersionOf(child.type);
  return propsVersion === undefined ? child : { ...child, propsVersion };
}

/**
 * The op a properties edit becomes for the edit target (SDL-632): the base
 * props, a width's overrides, or the hybrid member branch (S6). One router
 * for the form and the canvas's in-place text edit, so an edit never lands in
 * the base from one surface and in an override from the other. A bare
 * `StudioScreen` is still accepted — the S5 call shape.
 */
export function propsPatchOp(
  target: StudioScreen | StudioEditTarget,
  nodeId: SaunaNodeId,
  patch: Record<string, unknown>
): SchemaOp {
  const t: StudioEditTarget =
    typeof target === "string"
      ? target === "base"
        ? { kind: "base" }
        : { kind: "screen", screen: target }
      : target;
  if (t.kind === "base") return { kind: "updateNodePropsPartial", nodeId, patch };
  if (t.kind === "member") return { kind: "setMemberProps", nodeId, patch };
  return { kind: "setScreenProps", nodeId, screen: t.screen, patch };
}

/**
 * The op a Reset becomes for the edit target: DELETES the override key. `null`
 * at the base, where there is nothing to inherit from.
 */
export function resetOverrideOp(
  target: StudioEditTarget,
  nodeId: SaunaNodeId,
  key: string
): SchemaOp | null {
  if (target.kind === "base") return null;
  if (target.kind === "member") return { kind: "resetMemberProp", nodeId, key };
  return { kind: "resetScreenProp", nodeId, screen: target.screen, key };
}
