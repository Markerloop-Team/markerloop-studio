"use client";

// Studio hotkeys, bound to a single store instance.
//
// Every binding goes through `useHotkeys` so that focus inside an
// editable element (input, textarea, contenteditable) is respected by
// default — Cmd+Z inside a text input edits text, not the schema.

import { useEffect } from "react";
import { useStore } from "zustand";
import { useHotkeys } from "react-hotkeys-hook";

import {
  escapeHitFloatingLayer,
  installFloatingLayerProbe,
} from "./floating-layer";
import { saunaSiblingMoveOp } from "./node-move";
import type { StudioStore } from "./store";

export type StudioHotkeyOptions = {
  /** Disable the binding suite entirely. */
  disabled?: boolean;
  /**
   * Hand Delete/Backspace to the shell instead of removing outright
   * (SDL-303). The confirmation dialog lives above this hook, and a
   * keystroke that skipped it would leave the guard covering only the menu
   * — half a guard, which is the same defect the row menu was added to fix.
   *
   * Absent → the key removes directly, the behaviour hosts had before.
   */
  onDeleteRequest?: (nodeId: string) => void;
};

/**
 * Wires the standard Studio shortcuts to the given store. Mount
 * exactly once per Studio.
 *
 * Bindings:
 *   - Cmd/Ctrl+Z         → undo
 *   - Cmd/Ctrl+Shift+Z   → redo
 *   - Cmd/Ctrl+Y         → redo (Windows convention)
 *   - Cmd/Ctrl+D         → duplicate selected
 *   - Cmd/Ctrl+Up/Down   → move selected among its siblings
 *   - Delete / Backspace → remove selected (or ask the shell to confirm)
 *   - Escape             → clear selection
 */
export function useStudioHotkeys(store: StudioStore, opts: StudioHotkeyOptions = {}): void {
  const enabled = !opts.disabled;
  const onDeleteRequest = opts.onDeleteRequest;

  // Subscribe to selection so the duplicate/delete handlers see fresh values.
  const selection = useStore(store, (s) => s.selection);
  const selectedId = selection.nodeId;

  useHotkeys(
    "mod+z",
    (e) => {
      e.preventDefault();
      store.getState().undo();
    },
    { enabled, preventDefault: true }
  );

  useHotkeys(
    ["mod+shift+z", "mod+y"],
    (e) => {
      e.preventDefault();
      store.getState().redo();
    },
    { enabled, preventDefault: true }
  );

  useHotkeys(
    "mod+d",
    (e) => {
      if (!selectedId) return;
      e.preventDefault();
      store.getState().applyOp({ kind: "duplicate", nodeId: selectedId });
    },
    { enabled, preventDefault: true }
  );

  // The shortcuts the row menu prints next to «Выше»/«Ниже». They were drawn
  // on the approved board long before anything listened for them, so until
  // SDL-303 the menu would have promised a keystroke that did nothing.
  useHotkeys(
    ["mod+up", "mod+down"],
    (e, handler) => {
      if (!selectedId) return;
      const direction = handler.keys?.includes("up") ? "up" : "down";
      const op = saunaSiblingMoveOp(store.getState().schema, selectedId, direction);
      // No move (root, or already at the edge) → let the browser keep the
      // key: on macOS Cmd+Up is "scroll to top", and swallowing it to do
      // nothing is worse than not binding it at all.
      if (!op) return;
      e.preventDefault();
      store.getState().applyOp(op);
    },
    { enabled, preventDefault: false }
  );

  useHotkeys(
    ["delete", "backspace"],
    (e) => {
      if (!selectedId) return;
      e.preventDefault();
      if (onDeleteRequest) {
        onDeleteRequest(selectedId);
        return;
      }
      store.getState().applyOp({ kind: "remove", nodeId: selectedId });
    },
    { enabled }
  );

  // Escape may belong to a popover, a dialog or a menu rather than to the
  // selection (SDL-349) — the probe records that while the key is still
  // travelling, see floating-layer.ts.
  useEffect(() => {
    if (!enabled) return;
    return installFloatingLayerProbe();
  }, [enabled]);

  useHotkeys(
    "escape",
    (e) => {
      // The layer that Escape closed keeps the keystroke: dismissing the
      // preview-context popover used to clear the selection on the way past,
      // collapsing the whole right column. The mobile sheet had already
      // bought its way out with a listener of its own; this is the general
      // form of that fix, so the next popover cannot repeat the mistake.
      if (escapeHitFloatingLayer(e)) return;
      store.getState().selectNode(null);
    },
    { enabled }
  );
}
