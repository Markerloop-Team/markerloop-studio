"use client";

// Inline text editing on the canvas (SDL-299, EP-48).
//
// Owner's ask: the text you see is the text you edit. Until now a heading
// could only be changed in the properties panel — the author looked at one
// place and typed in another, and for a page of short strings that is most
// of the work.
//
// The editing surface is the RENDERED ELEMENT itself, made `contenteditable`
// in place. Not an input positioned over it: the whole point of the canvas
// since SDL-297 is that it shows the visitor's document, and an overlay input
// would have to re-create the font, size, colour, line-height and wrapping of
// whatever the author styled — approximately, and wrongly the first time the
// styling changes. Editing the element itself is exact by construction.
//
// Which prop receives the text is decided by `resolveCanvasTextTarget`
// (canvas-text.ts) — the resolution rule and why it depends on neither the
// registry nor the props manifest are documented there.
//
// Listeners are native and live on the FRAME's document, like the rest of the
// canvas chrome: React attaches its own listeners to the root container in
// the admin document, and events raised inside the frame never reach it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SaunaNodeId } from "@markerloop/engine";
import { SAUNA_NODE_ID_ATTR } from "@markerloop/engine/react/renderer";
import { resolveCanvasTextTarget, type CanvasTextTarget } from "./canvas-text";
import { propsPatchOp, type StudioStore } from "./store";
import { studioEditTarget, studioFieldProps } from "./visibility-modes";

/** Marks the element currently being edited — the e2e hook, and the CSS one. */
export const SAUNA_CANVAS_EDITING_ATTR = "data-sauna-canvas-editing";

type Session = {
  el: HTMLElement;
  nodeId: SaunaNodeId;
  prop: string;
  /** The element's text when the session opened — what Escape restores. */
  original: string;
  /**
   * The prop's value when the session opened — what a commit is compared
   * against. Kept apart from `original` because the two can differ by
   * surrounding whitespace (the resolver matches on trimmed text), and
   * comparing against the DOM would write that whitespace into the schema
   * on a session where the author changed nothing.
   */
  value: string;
  /** The element's own inline caret-color before the session, restored on end. */
  caretColor: string;
};

export type CanvasTextSessionOptions = {
  /**
   * Caret colour for the duration of the session. The PO editor passes its
   * section blue (board POInline draws the in-place caret in it); the Studio
   * passes nothing and keeps the author's own colour.
   */
  caretColor?: string;
};

export type CanvasTextSession = {
  /** Node whose text is being edited right now, or null. */
  editingId: SaunaNodeId | null;
  /** Opens a session on `el`, committing any session already open. */
  begin: (
    el: HTMLElement,
    nodeId: SaunaNodeId,
    target: CanvasTextTarget,
    options?: CanvasTextSessionOptions
  ) => void;
  /** True when `el` sits inside the element currently being edited. */
  isEditingElement: (el: Element | null) => boolean;
};

/**
 * The editing-session machinery, trigger-agnostic (SDL-367 split): the
 * `contenteditable` lifecycle, commit-on-Enter/blur, Escape-cancel and the
 * write back through the store. The Studio opens sessions from a
 * double-click (`useCanvasTextEditing` below); the PO editor opens them from
 * a second click inside a selected section (`po-canvas.tsx`) — both share
 * this hook so the DOM handover to React and the key handling cannot drift.
 *
 * Keys: Enter commits, Shift+Enter inserts a line break, Escape cancels and
 * puts the original text back. Moving focus away commits — the same thing
 * every builder does, and the thing an author does by accident most often.
 */
export function useCanvasTextSession(
  doc: Document,
  store: StudioStore
): CanvasTextSession {
  const [editingId, setEditingId] = useState<SaunaNodeId | null>(null);
  const session = useRef<Session | null>(null);

  /**
   * Takes the element out of editing and returns the session.
   *
   * The DOM is restored to the text React last rendered BEFORE the store is
   * told anything. React owns this element's children; `contenteditable` has
   * been mutating them behind its back (a Shift+Enter leaves a `<br>`), and
   * reconciliation from a tree React never saw is undefined behaviour. Handing
   * it back the old text means the next render is an ordinary text diff.
   */
  const end = useCallback((): Session | null => {
    const current = session.current;
    if (!current) return null;
    session.current = null;
    const { el } = current;
    el.removeAttribute("contenteditable");
    el.removeAttribute(SAUNA_CANVAS_EDITING_ATTR);
    el.removeAttribute("spellcheck");
    el.style.caretColor = current.caretColor;
    setEditingId(null);
    // The draft belongs to the session, so it dies with it — on a commit,
    // a cancel, and an unmount alike. Left standing it would keep shadowing
    // the properties field with text no longer being typed.
    store.getState().setTextDraft(null);
    return current;
  }, [store]);

  const commit = useCallback((): void => {
    const current = session.current;
    if (!current) return;
    // Read before `end` restores the element.
    const next = (current.el.textContent ?? "").trim();
    end();
    current.el.textContent = current.original;
    if (next === current.value.trim()) return;
    // The node can be gone — deleted from the outline while the caret sat in
    // it — and a patch would then resurrect nothing but a props bag.
    if (!store.getState().schema.nodes[current.nodeId]) return;
    // Lands where the form's edit would: in the width variant being edited
    // (SDL-632), or the member branch of a hybrid node looked at as a member
    // (S6), since the canvas shows — and the author just typed over — that text.
    const state = store.getState();
    state.applyOp(
      propsPatchOp(studioEditTarget(state.schema, current.nodeId, state.view), current.nodeId, {
        [current.prop]: next,
      })
    );
  }, [end, store]);

  const cancel = useCallback((): void => {
    const current = end();
    if (current) current.el.textContent = current.original;
  }, [end]);

  const begin = useCallback(
    (
      el: HTMLElement,
      nodeId: SaunaNodeId,
      target: CanvasTextTarget,
      options?: CanvasTextSessionOptions
    ): void => {
      if (session.current?.el === el) return;
      commit();

      const original = el.textContent ?? "";

      // `plaintext-only` keeps the paste path honest: no pasted markup to
      // strip, no rich-text commands. Where it is not supported the attribute
      // is simply not honoured, so the result is checked rather than assumed
      // and falls back to a plain editable region — safe either way, since a
      // commit only ever reads `textContent`.
      el.setAttribute("contenteditable", "plaintext-only");
      if (!el.isContentEditable) el.setAttribute("contenteditable", "true");
      el.setAttribute(SAUNA_CANVAS_EDITING_ATTR, nodeId);
      el.setAttribute("spellcheck", "false");
      const caretColor = el.style.caretColor;
      if (options?.caretColor) el.style.caretColor = options.caretColor;

      session.current = {
        el,
        nodeId,
        prop: target.prop,
        original,
        value: target.value,
        caretColor,
      };
      setEditingId(nodeId);
      store.getState().selectNode(nodeId);
      // Seed the draft with what is on screen right now: the field has to
      // track the edit from its first keystroke, and the first `input` only
      // arrives after one.
      store.getState().setTextDraft({ nodeId, prop: target.prop, value: original });

      el.focus({ preventScroll: true });
      // Select the whole string rather than leaving the word the opening
      // click landed on: the element became editable only just now, and
      // "replace this label" is the common intent. Typing overwrites, an
      // arrow key collapses the range and keeps the text.
      const win = doc.defaultView;
      const selection = win?.getSelection();
      if (selection) {
        const range = doc.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    },
    [commit, doc, store]
  );

  const isEditingElement = useCallback((el: Element | null): boolean => {
    const current = session.current;
    if (!current || !el) return false;
    return current.el === el || current.el.contains(el);
  }, []);

  useEffect(() => {
    /**
     * Capture phase, and it matters. `SaunaCanvasSelection` listens for Escape
     * on the same document to clear the selection; registered in the bubble
     * phase it would otherwise also run, and one Escape would both cancel the
     * edit and deselect the node the author is working on.
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!session.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        commit();
      }
    };

    // `focusout` rather than `blur`: blur does not bubble, and the editable
    // element is replaced by React on every commit, so a listener bound to the
    // element itself would have to be rebound on each session.
    const onFocusOut = (event: FocusEvent): void => {
      if (!session.current) return;
      if (event.target !== session.current.el) return;
      commit();
    };

    /**
     * The live half of the board's promise that the `text` field "обновляется
     * по мере набора" (SDL-378). It publishes a DRAFT, never an op: the store
     * op is what pushes history and triggers auto-save, and one of those per
     * character is the behaviour the in-place editor exists to avoid. The
     * schema still changes exactly once, at commit.
     */
    const onInput = (event: Event): void => {
      const current = session.current;
      if (!current) return;
      if (event.target !== current.el) return;
      store.getState().setTextDraft({
        nodeId: current.nodeId,
        prop: current.prop,
        value: current.el.textContent ?? "",
      });
    };

    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("focusout", onFocusOut);
    doc.addEventListener("input", onInput);

    return () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("focusout", onFocusOut);
      doc.removeEventListener("input", onInput);
      // Unmounting mid-edit (device switch, navigation) must not leave a
      // `contenteditable` island behind in a document React still renders to.
      cancel();
    };
  }, [cancel, commit, doc, store]);

  return useMemo(
    () => ({ editingId, begin, isEditingElement }),
    [editingId, begin, isEditingElement]
  );
}

/**
 * The Studio's trigger over the shared session: a double-click on the
 * rendered element opens editing in place, with the prop resolved by text
 * equality (`resolveCanvasTextTarget` — the resolution rule and why it
 * depends on neither the registry nor the props manifest are documented
 * there).
 */
export function useCanvasTextEditing(
  doc: Document,
  store: StudioStore
): { editingId: SaunaNodeId | null } {
  const { editingId, begin, isEditingElement } = useCanvasTextSession(doc, store);

  useEffect(() => {
    const onDoubleClick = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      if (typeof target?.closest !== "function") return;
      const marked = target.closest<HTMLElement>(`[${SAUNA_NODE_ID_ATTR}]`);
      const nodeId = marked?.getAttribute(SAUNA_NODE_ID_ATTR) as SaunaNodeId | undefined;
      if (!marked || !nodeId) return;
      if (isEditingElement(marked)) return;

      // The canvas draws the width variant being edited (SDL-632), so the
      // prop behind the text is looked up in the LAYERED props: at Phone an
      // overridden text is the override, and a base prop that happens to
      // hold the same string must not win the match.
      const state = store.getState();
      const stored = state.schema.nodes[nodeId];
      const node = stored
        ? { ...stored, props: studioFieldProps(state.schema, nodeId, state.view) }
        : undefined;
      const resolved = resolveCanvasTextTarget(node, marked.textContent ?? "");
      // No editable prop behind this text: a container, a variant-driven node,
      // or a string this element did not get from a single prop. The author
      // keeps the properties panel — silently, because a double-click on a
      // section is not a mistake worth a message.
      if (!resolved) return;

      event.preventDefault();
      begin(marked, nodeId, resolved);
    };

    doc.addEventListener("dblclick", onDoubleClick);
    return () => doc.removeEventListener("dblclick", onDoubleClick);
  }, [begin, doc, isEditingElement, store]);

  return { editingId };
}
