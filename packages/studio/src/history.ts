// Snapshot-based undo/redo with a fixed ring buffer.
//
// Every mutation pushes the *previous* schema onto `past`, clears `future`,
// and applies the change. Undo pops `past` to current, pushes current to
// `future`. Redo pops `future` to current, pushes current to `past`.
//
// The buffer is bounded — when it exceeds `maxDepth`, the oldest snapshot
// is dropped. The Studio does not commit to a snapshot per keystroke;
// callers are expected to debounce property edits before pushing
// (PR 5 wires that through auto-save).

import type { SaunaSchema } from "@markerloop/engine";

export const DEFAULT_HISTORY_DEPTH = 100;

export type HistoryState = {
  past: SaunaSchema[];
  future: SaunaSchema[];
};

export function createHistory(): HistoryState {
  return { past: [], future: [] };
}

/**
 * Records `previous` as a new past frame, drops the redo stack, and
 * caps the buffer.
 */
export function pushHistory(
  history: HistoryState,
  previous: SaunaSchema,
  maxDepth = DEFAULT_HISTORY_DEPTH
): HistoryState {
  const past = history.past.length >= maxDepth
    ? [...history.past.slice(history.past.length - maxDepth + 1), previous]
    : [...history.past, previous];
  return { past, future: [] };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

/**
 * Returns the schema to switch to plus the new history. Caller must:
 *   - apply `nextSchema` to its store, AND
 *   - replace its history with `nextHistory`.
 *
 * If undo is impossible, returns null.
 */
export function applyUndo(
  history: HistoryState,
  current: SaunaSchema
): { nextSchema: SaunaSchema; nextHistory: HistoryState } | null {
  if (!canUndo(history)) return null;
  const past = [...history.past];
  const nextSchema = past.pop()!;
  return {
    nextSchema,
    nextHistory: { past, future: [...history.future, current] },
  };
}

export function applyRedo(
  history: HistoryState,
  current: SaunaSchema
): { nextSchema: SaunaSchema; nextHistory: HistoryState } | null {
  if (!canRedo(history)) return null;
  const future = [...history.future];
  const nextSchema = future.pop()!;
  return {
    nextSchema,
    nextHistory: { past: [...history.past, current], future },
  };
}
