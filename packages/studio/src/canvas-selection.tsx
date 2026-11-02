"use client";

// Selection on the canvas (SDL-298, EP-48).
//
// Owner's remark 5: "хочу чтобы был selection outline поверх элемента которого
// канваса". Until now selection existed only as a highlighted row in the
// outline; the canvas showed nothing, and a click on it could not select
// anything at all — the renderer put no node identity on the DOM, so there was
// nothing to hit-test against.
//
// Two decisions carry this file.
//
// 1. The frames are drawn INSIDE the canvas document, through the same portal
//    that renders the content (SDL-297). Coordinates are then native: no
//    postMessage bridge, and nothing drifts when the document scrolls, when the
//    device switches between 1280/768/375, or when the frame is scaled down to
//    fit a narrow column — the overlay is scaled by the same transform as the
//    content it marks.
//
// 2. Hit-testing uses NATIVE listeners on the frame's document, not React
//    props. React 17+ attaches its listeners to the root container, which lives
//    in the admin document; events raised inside the frame's document never
//    reach it, so an `onClick` on portalled content simply never fires. This is
//    a property of portalling across documents, not something to work around.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";

import { saunaNodeDisplayName, type SaunaNodeId, type SaunaSchema } from "@markerloop/engine";
import { SAUNA_NODE_ID_ATTR } from "@markerloop/engine/react/renderer";
import { useCanvasTextEditing } from "./canvas-text-edit";
import { escapeHitFloatingLayer } from "./floating-layer";
import { ChevronDown, Component } from "./icons";
import type { OutlineDropTarget } from "./outline-drop";
import type { StudioStore } from "./store";

/* ------------------------------------------------------------------ */
/* Palette                                                            */
/* ------------------------------------------------------------------ */

/**
 * The overlay's colours are the admin's layer-1 tokens (EP-184), never
 * literals (EP-187, layer 5, decision 2): the selection is the brand blue
 * `--selection` (#008ed0), the same in a light and a dark admin.
 *
 * They are read INSIDE the frame, where the author's palette lives — which is
 * why the overlay root carries `data-surface`: the kit's sheet, which the frame
 * receives like every public sheet, scopes the admin tokens to
 * `[data-surface]`, so `--selection` resolves to the admin's value on the
 * overlay and nowhere else in the page. The frame is never `.dark` (the canvas
 * shows the site in the site's theme, decision 3), so the light admin set is
 * the one in force — the colour does not move with the admin's theme. An
 * author who themes their site blue still keeps the distinction between "my
 * content" and "the editor is talking to me": `--primary` of the site never
 * reaches the overlay, `--selection` is not a site token.
 */
const SELECT_COLOR = "var(--selection)";
const HOVER_COLOR = "color-mix(in srgb, var(--selection) 45%, transparent)";
/** The board's wash under a node being edited in place (SDL-378). */
const EDITING_TINT = "color-mix(in srgb, var(--selection) 4%, transparent)";
/** Text and glyphs on the selection colour, and the handles' fill. */
const ON_SELECT = "var(--primary-foreground)";
const HANDLE_FILL = "var(--background)";

/** The overlay's paint, exported for the package tests: every value is a token. */
export const SAUNA_CANVAS_SELECTION_PAINT = {
  select: SELECT_COLOR,
  hover: HOVER_COLOR,
  editing: EDITING_TINT,
  onSelect: ON_SELECT,
  handleFill: HANDLE_FILL,
} as const;
/** The drop line the board mirrors from the outline (SDL-378): 2px, info. */
const DROP_LINE_THICKNESS = 2;
/** Corner handles: white square, info edge — the board's «Node badge & handles». */
const HANDLE_SIZE = 7;
const HANDLE_BORDER = 1.5;

/* ------------------------------------------------------------------ */
/* Geometry                                                           */
/* ------------------------------------------------------------------ */

export type Rect = { top: number; left: number; width: number; height: number };

function elementFor(doc: Document, id: SaunaNodeId | null): HTMLElement | null {
  if (!id) return null;
  // `CSS.escape` lives on the frame's own window; ids are generated, but an
  // id is schema data and schema data is not ours to trust.
  const escape = doc.defaultView?.CSS?.escape ?? ((v: string) => v);
  return doc.querySelector<HTMLElement>(`[${SAUNA_NODE_ID_ATTR}="${escape(id)}"]`);
}

/** Document-space rect: viewport rect plus scroll, so it survives scrolling. */
function measure(el: HTMLElement): Rect {
  const win = el.ownerDocument.defaultView;
  const r = el.getBoundingClientRect();
  return {
    top: r.top + (win?.scrollY ?? 0),
    left: r.left + (win?.scrollX ?? 0),
    width: r.width,
    height: r.height,
  };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
  );
}

/**
 * Tracks the on-screen box of one node.
 *
 * The element is re-resolved on every measurement rather than held in a ref:
 * a re-render replaces the DOM node (React reuses it when it can, but a
 * changed `type` or a re-keyed child does not), and a stale reference would
 * leave the frame drawn around an element no longer in the document.
 *
 * Everything that can move a box schedules the same coalesced measurement:
 * layout changes inside the document (ResizeObserver), content edits
 * (MutationObserver), and scrolling or resizing the frame's viewport.
 *
 * Exported since SDL-364: the PO editor's section layer draws its own frame
 * and floating toolbar from the same measurement, in the same frame realm.
 */
export function useNodeRect(doc: Document | null, id: SaunaNodeId | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!doc || !id) {
      setRect(null);
      return;
    }
    const win = doc.defaultView;
    if (!win) return;

    const read = (): void => {
      frame.current = null;
      const el = elementFor(doc, id);
      const next = el ? measure(el) : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    const schedule = (): void => {
      if (frame.current !== null) return;
      frame.current = win.requestAnimationFrame(read);
    };

    read();

    const ro = new win.ResizeObserver(schedule);
    ro.observe(doc.documentElement);
    const mo = new win.MutationObserver(schedule);
    mo.observe(doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    win.addEventListener("scroll", schedule, { passive: true });
    win.addEventListener("resize", schedule);

    return () => {
      if (frame.current !== null) win.cancelAnimationFrame(frame.current);
      frame.current = null;
      ro.disconnect();
      mo.disconnect();
      win.removeEventListener("scroll", schedule);
      win.removeEventListener("resize", schedule);
    };
  }, [doc, id]);

  return rect;
}

/** The canvas document's visible box: the frame's viewport, in CSS pixels. */
export type Bounds = { width: number; height: number };

/**
 * The outer box of a selection or hover frame of `stroke` pixels around
 * `rect` (SDL-770).
 *
 * The frame sits OUTSIDE the node, so it never covers the node's first or
 * last pixel row and its edge lands exactly on the boundary with a neighbour
 * — over the neighbour, since the overlay is above every block. Where outside
 * is off the document (a full-width block touches the left and right edges,
 * the first block touches the top, the last one the bottom), that side is
 * pulled in to the document edge and drawn INSIDE the node instead: an edge
 * at y = -2 is an edge nobody sees. `null` bounds (not measured yet) clamp
 * nothing.
 *
 * Exported for the package tests: jsdom has no layout, so the geometry is
 * pinned as a function and the mounted test checks it is the one applied.
 */
export function frameBox(rect: Rect, stroke: number, bounds: Bounds | null): Rect {
  const maxX = bounds && bounds.width > 0 ? bounds.width : Infinity;
  const maxY = bounds && bounds.height > 0 ? bounds.height : Infinity;
  const top = Math.max(0, rect.top - stroke);
  const left = Math.max(0, rect.left - stroke);
  const bottom = Math.min(maxY, rect.top + rect.height + stroke);
  const right = Math.min(maxX, rect.left + rect.width + stroke);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Tracks the canvas viewport. The frame grows with its document (SDL-297), so
 * the viewport IS the document: its width is the device width and its height
 * the content height. Resizing the iframe fires `resize` on its window; the
 * ResizeObserver catches the rest.
 *
 * The bound is the WINDOW, not the scrollable document. Content wider than the
 * device (a table that does not wrap) scrolls the frame sideways; a node out
 * there gets its frame pressed against the window's right edge, and the
 * clipped layer shows nothing past it. Accepted: on a width-true canvas that
 * content is itself the defect the author has to see.
 */
function useViewportBounds(doc: Document): Bounds | null {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  useEffect(() => {
    const win = doc.defaultView;
    if (!win) return;
    const read = (): void => {
      const width = doc.documentElement.clientWidth;
      const height = doc.documentElement.clientHeight;
      setBounds((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height }
      );
    };
    read();
    const ro = new win.ResizeObserver(read);
    ro.observe(doc.documentElement);
    win.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      win.removeEventListener("resize", read);
    };
  }, [doc]);
  return bounds;
}

/* ------------------------------------------------------------------ */
/* Drop mirror                                                        */
/* ------------------------------------------------------------------ */

/**
 * Which element the drop line attaches to, and on which of its edges.
 *
 * The drop target names a PARENT and an INDEX, and neither of those is a box
 * on screen — the boxes belong to the children. So the slot is resolved to an
 * anchor: the child that would end up just below the line, or, for a slot past
 * the last child, the child that would end up just above it.
 */
type DropAnchor = {
  id: SaunaNodeId;
  edge: "top" | "bottom";
  /**
   * The parent is empty, so the anchor IS the parent and the line goes just
   * inside its top edge. Kept apart from `edge` because the two mean
   * different things to a reader: one is a boundary between siblings, this
   * one is "the first thing in here".
   */
  insideEmpty?: boolean;
};

function dropAnchorFor(
  schema: SaunaSchema,
  target: OutlineDropTarget | null
): DropAnchor | null {
  // "inside" is deliberately not drawn here — see the layer below.
  if (!target || target.mode === "inside") return null;
  const children = schema.nodes[target.parentId]?.children ?? [];
  if (children.length === 0) {
    return { id: target.parentId, edge: "top", insideEmpty: true };
  }
  const below = children[target.index];
  if (below) return { id: below, edge: "top" };
  const last = children[children.length - 1];
  return last ? { id: last, edge: "bottom" } : null;
}

/**
 * The line the board draws inside the canvas while a row is dragged in the
 * outline (SDL-378) — the same insertion, said twice, once on each surface.
 *
 * Width comes from the ANCHOR block, not from the parent's box: the parent's
 * box includes its own padding, and a line drawn across that runs past the
 * blocks it is separating. Taking the child's box lands the line exactly as
 * wide as the content on either side of it, which is what the board shows.
 */
function DropLine({ rect, anchor }: { rect: Rect; anchor: DropAnchor }): ReactNode {
  const half = DROP_LINE_THICKNESS / 2;
  const top = anchor.insideEmpty
    ? rect.top + half
    : anchor.edge === "top"
      ? rect.top - half
      : rect.top + rect.height - half;
  return (
    <div
      data-sauna-canvas-marker="drop"
      data-sauna-canvas-drop-edge={anchor.insideEmpty ? "inside" : anchor.edge}
      style={{
        position: "absolute",
        top,
        left: rect.left,
        width: rect.width,
        height: DROP_LINE_THICKNESS,
        backgroundColor: SELECT_COLOR,
        borderRadius: DROP_LINE_THICKNESS,
        pointerEvents: "none",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Layer                                                              */
/* ------------------------------------------------------------------ */

export type SaunaCanvasSelectionProps = {
  /** The canvas document. Portalled here by `SaunaCanvasFrame`. */
  doc: Document;
  store: StudioStore;
  /** The actions of the selection label's menu (EP-187). Absent → a plain label. */
  nodeMenu?: (nodeId: SaunaNodeId) => SaunaCanvasNodeMenuItem[];
};

/**
 * Hit-testing plus the two frames, rendered into the canvas document.
 *
 * Interactions (03-canvas-and-outline.md, remark 5):
 *   click        — select the node under the pointer
 *   Alt-click    — select its parent instead (reach a container behind a leaf)
 *   Esc          — clear the selection
 *   hover        — thin frame under the pointer
 *   double-click — edit the node's text in place (SDL-299)
 *
 * Inline editing is mounted from here rather than as a second overlay: it
 * shares this layer's document and has to agree with it about Esc and about
 * what the frames may cover, and two independent listeners on the same
 * document would have to guess each other's state.
 */
export function SaunaCanvasSelection({
  doc,
  store,
  nodeMenu,
}: SaunaCanvasSelectionProps): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  // In the store since SDL-300, not in this layer: the outline draws the
  // same mark on its row, and a `useState` here is invisible to it.
  const hoveredId = useStore(store, (s) => s.hoveredId);
  // Written by the outline's drag handlers (SDL-378). Null whenever no drag
  // is in flight, which is almost always — the subscription costs nothing
  // until someone picks a row up.
  const dropTarget = useStore(store, (s) => s.dropTarget);
  const { editingId } = useCanvasTextEditing(doc, store);

  const nodeIdAt = useCallback((target: EventTarget | null): SaunaNodeId | null => {
    // Duck-typed, NOT `target instanceof Element`. The event target belongs to
    // the frame's realm, and `Element` in this module is the admin realm's
    // constructor — cross-realm `instanceof` is always false, so the guard
    // would reject every element and the canvas would look dead while every
    // listener was correctly attached. (Same shape as the kit's rule against
    // `instanceof` across build outputs; here the boundary is the document.)
    const el = target as Element | null;
    if (typeof el?.closest !== "function") return null;
    const marked = el.closest(`[${SAUNA_NODE_ID_ATTR}]`);
    return (marked?.getAttribute(SAUNA_NODE_ID_ATTR) as SaunaNodeId | undefined) ?? null;
  }, []);

  useEffect(() => {
    const win = doc.defaultView;
    if (!win) return;

    const onClick = (event: MouseEvent): void => {
      // The canvas is an editing surface, not a live page: a click on an
      // author's <a> must select it, not navigate the frame away and take the
      // portal (and the whole canvas) with it. Same for form submits.
      event.preventDefault();
      const id = nodeIdAt(event.target);
      if (!id) {
        store.getState().selectNode(null);
        return;
      }
      const parentId = event.altKey ? store.getState().schema.parents[id] : undefined;
      // Alt on the root has nowhere to go — keep the root selected rather
      // than clearing, which would read as "the click missed".
      store.getState().selectNode(event.altKey ? (parentId ?? id) : id);
    };

    // Mouse only (SDL-300). A tap fires `pointerover` too, but a finger
    // never leaves the surface the way a cursor does, so the mark it sets
    // would stay lit on both surfaces until the next tap elsewhere. The
    // canvas alone could live with that; the outline row it now lights up
    // makes it read as a second selection.
    const onOver = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      store.getState().hoverNode(nodeIdAt(event.target));
    };
    const onLeave = (): void => store.getState().hoverNode(null);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (!store.getState().selection.nodeId) return;
      // A popover, dialog or menu that Escape just dismissed owns the key
      // (SDL-349). This listener sits on the window as well as on the canvas
      // document, so without the check it cleared the selection behind every
      // closing layer — the hotkey layer's guard alone would not have helped.
      if (escapeHitFloatingLayer(event)) return;
      event.preventDefault();
      store.getState().selectNode(null);
    };

    // A link must not navigate even when its OWN click handler runs first.
    // next/link (the kit's ActionCardLink and RowLink) listens through
    // React's portal listener on the frame's <body>, which sits below this
    // document, so by the time the bubbling `onClick` above cancels the
    // event the router has already pushed — and it pushes the ADMIN, taking
    // the editor with it (SDL-634, measured on the contour: a click on an
    // ActionCardLink moved /pages/<id> to /x). next/link skips an event that
    // is already defaultPrevented, so cancelling in the capture phase, before
    // any element sees the click, is what stops it. Anchors only: a blanket
    // capture cancel would also silence every Radix trigger on the canvas,
    // which checks defaultPrevented the same way.
    const onClickCapture = (event: MouseEvent): void => {
      const el = event.target as Element | null;
      if (typeof el?.closest !== "function") return;
      if (el.closest("a[href]")) event.preventDefault();
    };

    doc.addEventListener("click", onClickCapture, true);
    doc.addEventListener("click", onClick);
    doc.addEventListener("pointerover", onOver);
    doc.addEventListener("pointerleave", onLeave);
    // Both documents: the pointer may be over the canvas while focus is still
    // in the admin chrome (the outline row that made the selection), and Esc
    // has to work either way.
    doc.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      doc.removeEventListener("click", onClickCapture, true);
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("pointerover", onOver);
      doc.removeEventListener("pointerleave", onLeave);
      doc.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [doc, nodeIdAt, store]);

  const selectedRect = useNodeRect(doc, selectedId);
  // Hovering the selected node would stack two frames on the same box; the
  // stronger one wins. While a node is being edited the hover frame is off
  // entirely — the pointer sits over text the author is typing into, and a
  // frame that follows it there reads as a second, competing selection.
  const hoverRect = useNodeRect(
    doc,
    hoveredId === selectedId || editingId !== null ? null : hoveredId
  );
  const dropAnchor = useMemo(
    () => dropAnchorFor(schema, dropTarget),
    [schema, dropTarget]
  );
  const dropRect = useNodeRect(doc, dropAnchor?.id ?? null);
  const bounds = useViewportBounds(doc);
  const selectedBox = selectedRect ? frameBox(selectedRect, 2, bounds) : null;
  const selectedNode = selectedId ? schema.nodes[selectedId] : undefined;
  // Editing always happens on the selected node (the dblclick that starts it
  // selects first), but the two ids are separate state — comparing them is
  // what keeps a stale `editingId` from tinting whatever got picked next.
  const isEditingSelected = editingId !== null && editingId === selectedId;

  return (
    <div
      data-sauna-canvas-overlay=""
      // Scopes the admin's tokens (the kit's `[data-surface]` block) to the
      // overlay: `--selection` and the menu's surface resolve here, and only here.
      data-surface="canvas-overlay"
      aria-hidden
      style={{
        position: "absolute",
        // The whole viewport, clipped (SDL-770). A frame drawn outside the
        // last block would otherwise add its stroke to the document's
        // scroll height, the canvas would grow to show it, and the frame
        // would move again — `frameBox` keeps the frames inside, the clip
        // makes sure nothing here can ever size the page.
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: "hidden",
        // Above author content, below nothing: the overlay is the topmost
        // thing in this document and never takes the pointer — every event
        // belongs to the content underneath.
        zIndex: 2147483647,
        pointerEvents: "none",
      }}
    >
      {hoverRect ? (
        <Frame rect={hoverRect} bounds={bounds} color={HOVER_COLOR} width={1} />
      ) : null}
      {/* The drag in the outline, mirrored here (SDL-378). Until now the
          canvas said nothing while a node was being moved, so an author
          reordering blocks had to read the answer off the tree and imagine
          the page — on exactly the surface built to spare them that.

          "inside" is NOT drawn: the board has no canvas state for it (only
          the outline's ring and «внутрь» pill), and inventing one here would
          be the editor asserting something the approved design does not.
          Flagged for the board instead. */}
      {dropRect && dropAnchor ? (
        <DropLine rect={dropRect} anchor={dropAnchor} />
      ) : null}
      {selectedRect && selectedBox ? (
        <>
          {/* Editing is a MODE, and until SDL-378 the canvas said nothing
              about being in it: the frame, the handles and the badge looked
              identical whether the author was about to type or merely had
              the node picked. The tint is the board's own wash — weak enough
              (4%) to leave the author's colours readable underneath, present
              enough that the box reads as live. */}
          {isEditingSelected ? <Tint rect={selectedRect} /> : null}
          <Frame rect={selectedRect} bounds={bounds} color={SELECT_COLOR} width={2} />
          <Handles box={selectedBox} stroke={2} bounds={bounds} />
          {selectedNode && selectedId ? (
            <Badge
              key={selectedId}
              doc={doc}
              box={selectedBox}
              // The node's name, as Layers shows it — the board's «Weekdays
              // card ▾». «· editing» is appended while its text is edited in
              // place: an author mid-edit still needs to know what they edit.
              label={isEditingSelected ? `${saunaNodeDisplayName(selectedNode)} · editing` : saunaNodeDisplayName(selectedNode)}
              isRef={selectedNode.type === REF_TYPE}
              menu={nodeMenu && !isEditingSelected ? () => nodeMenu(selectedId) : undefined}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Frame({
  rect,
  bounds,
  color,
  width,
}: {
  rect: Rect;
  bounds: Bounds | null;
  color: string;
  width: number;
}): ReactNode {
  const box = frameBox(rect, width, bounds);
  return (
    <div
      data-sauna-canvas-marker={width === 2 ? "selected" : "hover"}
      style={{
        position: "absolute",
        // Outside the node where the document has room, inside where it has
        // not — see `frameBox`. The box is the OUTER box, so the sizing is
        // pinned: the frame document carries the kit's preflight
        // (`*{box-sizing:border-box}`), under which the old `width =
        // rect.width` shifted the frame up and left by its stroke — the top
        // and left edges fell off a block at the document edge and the
        // bottom and right ones sank 2px into the block (SDL-770).
        boxSizing: "border-box",
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        borderWidth: width,
        borderStyle: "solid",
        borderColor: color,
        borderRadius: 2,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * The four corner squares of a selection. Purely a read-out — resizing on the
 * canvas is not a gesture this editor has — but they are what makes a 2px
 * frame read as "this node is selected" rather than as a border the author
 * put there themselves.
 */
function Handles({
  box,
  stroke,
  bounds,
}: {
  /** The frame's outer box (`frameBox`). */
  box: Rect;
  stroke: number;
  bounds: Bounds | null;
}): ReactNode {
  // Centred on the frame's stroke, and kept inside the document like the
  // frame itself — a handle half off the page reads as a broken corner.
  const half = HANDLE_SIZE / 2;
  const clamp = (v: number, max: number | undefined): number =>
    Math.max(0, max && max > 0 ? Math.min(v, max - HANDLE_SIZE) : v);
  const x0 = clamp(box.left + stroke / 2 - half, bounds?.width);
  const x1 = clamp(box.left + box.width - stroke / 2 - half, bounds?.width);
  const y0 = clamp(box.top + stroke / 2 - half, bounds?.height);
  const y1 = clamp(box.top + box.height - stroke / 2 - half, bounds?.height);
  const corners: Array<{ key: string; top: number; left: number }> = [
    { key: "nw", top: y0, left: x0 },
    { key: "ne", top: y0, left: x1 },
    { key: "sw", top: y1, left: x0 },
    { key: "se", top: y1, left: x1 },
  ];
  return (
    <>
      {corners.map((corner) => (
        <div
          key={corner.key}
          data-sauna-canvas-handle={corner.key}
          style={{
            position: "absolute",
            boxSizing: "border-box",
            top: corner.top,
            left: corner.left,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            backgroundColor: HANDLE_FILL,
            borderWidth: HANDLE_BORDER,
            borderStyle: "solid",
            borderColor: SELECT_COLOR,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

/** The wash under a node being edited in place (SDL-378, board). */
function Tint({ rect }: { rect: Rect }): ReactNode {
  return (
    <div
      data-sauna-canvas-marker="editing"
      style={{
        position: "absolute",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        backgroundColor: EDITING_TINT,
        pointerEvents: "none",
      }}
    />
  );
}

/** One action of the selection label's menu (EP-187) — the outline row's verbs. */
export type SaunaCanvasNodeMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/** The Ref (placed Component) type: its label carries the component glyph. */
const REF_TYPE = "Ref";

/**
 * The selection's name label on its top-left corner — «Weekdays card ▾» of the
 * approved canvas (flow 2, «Select»). With `menu` it is a button: it opens the
 * node's actions right under it, inside the frame.
 *
 * Native listeners, not React props: React does not hear events raised in the
 * frame's document (see the header of this file). Each listener stops the
 * event, so the document's own click — "select what is under the pointer" —
 * never sees a press on the label or the menu.
 */
function Badge({
  doc,
  box,
  label,
  isRef,
  menu,
}: {
  doc: Document;
  box: Rect;
  label: string;
  isRef: boolean;
  menu?: () => SaunaCanvasNodeMenuItem[];
}): ReactNode {
  const HEIGHT = 18;
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<SaunaCanvasNodeMenuItem[] | null>(null);
  const menuFn = useRef(menu);
  menuFn.current = menu;

  useEffect(() => {
    const el = badgeRef.current;
    if (!el || !menu) return;
    const onClick = (event: MouseEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      setItems((open) => (open ? null : (menuFn.current?.() ?? null)));
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [menu]);

  // An open menu closes on a press anywhere else in the frame and on Escape.
  useEffect(() => {
    if (!items) return;
    const onDown = (event: Event): void => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || badgeRef.current?.contains(target))) return;
      setItems(null);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setItems(null);
    };
    doc.addEventListener("pointerdown", onDown, true);
    doc.addEventListener("keydown", onKey, true);
    return () => {
      doc.removeEventListener("pointerdown", onDown, true);
      doc.removeEventListener("keydown", onKey, true);
    };
  }, [doc, items]);

  useEffect(() => {
    const root = menuRef.current;
    if (!root || !items) return;
    const onClick = (event: MouseEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      const id = (event.target as Element | null)?.closest?.("[data-sauna-canvas-menu-item]")?.getAttribute("data-sauna-canvas-menu-item");
      const item = items.find((i) => i.id === id);
      if (!item || item.disabled) return;
      setItems(null);
      item.onSelect();
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [items]);

  // Above the frame when there is room, tucked inside its top-left when the
  // node sits at the very top of the document. `box` is the frame's outer
  // box, already kept inside the document.
  const above = box.top >= HEIGHT;
  const top = above ? box.top - HEIGHT : box.top + 2;
  return (
    <>
      <div
        ref={badgeRef}
        data-sauna-canvas-badge=""
        data-sauna-canvas-badge-ref={isRef ? "" : undefined}
        role={menu ? "button" : undefined}
        aria-haspopup={menu ? "menu" : undefined}
        aria-expanded={menu ? items !== null : undefined}
        style={{
          position: "absolute",
          boxSizing: "border-box",
          top,
          left: box.left,
          height: HEIGHT,
          maxWidth: 240,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 6px",
          // Flag-shaped, per the board: square on the corner that touches the
          // frame, rounded on the three that do not.
          borderRadius: above ? "4px 4px 4px 0" : "0 4px 4px 4px",
          backgroundColor: SELECT_COLOR,
          color: ON_SELECT,
          font: "600 12px/1 ui-sans-serif, system-ui, sans-serif",
          whiteSpace: "nowrap",
          cursor: menu ? "pointer" : "default",
          // The overlay never takes the pointer; the label does, when it is a button.
          pointerEvents: menu ? "auto" : "none",
        }}
      >
        {isRef ? <Component aria-hidden width={12} height={12} strokeWidth={2} data-sauna-canvas-badge-icon="component" /> : null}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {menu ? <ChevronDown aria-hidden width={12} height={12} strokeWidth={2.2} /> : null}
      </div>
      {items ? (
        <div
          ref={menuRef}
          role="menu"
          data-sauna-canvas-menu=""
          style={{
            position: "absolute",
            boxSizing: "border-box",
            top: top + HEIGHT + 4,
            left: box.left,
            minWidth: 200,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "var(--popover)",
            color: "var(--popover-foreground)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "var(--border)",
            borderRadius: 8,
            boxShadow: "var(--elevated-shadow)",
            font: "400 13px/1.2 ui-sans-serif, system-ui, sans-serif",
            pointerEvents: "auto",
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              data-sauna-canvas-menu-item={item.id}
              style={{
                all: "unset",
                boxSizing: "border-box",
                display: "block",
                padding: "7px 10px",
                borderRadius: 4,
                cursor: item.disabled ? "default" : "pointer",
                opacity: item.disabled ? 0.45 : 1,
                color: item.destructive ? "var(--destructive)" : "inherit",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
