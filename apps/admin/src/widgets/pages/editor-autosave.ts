"use client";

// The auto-save of the two studio editors — pages (page-editor.tsx) and Blocks
// (block-editor.tsx) — with the one save status and the one leave-guard of
// EP-186 pattern 6. Both editors used to keep their own copy of the status
// map; the page editor alone had the guard, so leaving the Block editor inside
// the 800 ms debounce dropped the last edit without a word.
//
// Block editor history is NOT here yet (layer 5): only the page editor has a
// "History" button.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { SaunaProvider, SaunaSchema, SaunaVersion } from "@markerloop/engine";
import { useStudioAutoSave, type AutoSaveStatus, type StudioStore } from "@markerloop/studio";

import { SAVE_DEBOUNCE_MS, type SaveStatusState } from "@/shared/components/save-status";
import { useBeforeUnloadGuard } from "@/shared/hooks";

/** Auto-save status → the kit's SaveStatus vocabulary — the one map. */
export const AUTO_SAVE_TO_SAVE_STATE: Record<AutoSaveStatus, SaveStatusState> = {
  idle: "saved",
  ready: "saved",
  loading: "loading",
  dirty: "unsaved",
  saving: "saving",
  error: "error",
  conflict: "conflict",
};

export function saveStateOf(status: AutoSaveStatus): SaveStatusState {
  return AUTO_SAVE_TO_SAVE_STATE[status] ?? "unsaved";
}

export interface UseEditorAutoSaveOptions {
  store: StudioStore;
  provider: SaunaProvider;
  id: string;
  externalVersion: SaunaVersion;
  /** A PUT landed (after the guard's own bookkeeping). */
  onSaveSuccess?: () => void;
  /** The question asked before a link leaves an edit that could not be saved. */
  leaveUnsavedMessage: string;
}

export function useEditorAutoSave({
  store,
  provider,
  id,
  externalVersion,
  onSaveSuccess,
  leaveUnsavedMessage,
}: UseEditorAutoSaveOptions) {
  /**
   * Is what is on the screen on the server? `status` cannot answer that, and
   * both the publish button and every link out of the editor rest on the
   * answer.
   *
   * Two states of the auto-saver lie about it. An edit made while a PUT is in
   * flight leaves the status at "saving" (auto-save.ts marks dirty only when
   * it is not already saving), and when that PUT lands the status turns
   * "ready" with the new edit still sitting in the 800 ms debounce — "ready"
   * there means "the PREVIOUS body is on the server". And a debounce timer
   * that fires while a PUT is in flight is dropped outright (`runSave`
   * returns on `inflightRef`), so that edit waits for the next keystroke with
   * the status reading "ready" the whole time.
   *
   * So the question is answered by identity, never by a label: the schema the
   * last successful PUT carried, against the one the store holds now. The
   * status of the save itself is kept in a ref written by the auto-saver's
   * own callbacks, because a ref filled during render lags exactly the
   * transition that matters.
   */
  const savedSchemaRef = React.useRef<SaunaSchema | null>(null);
  const sendingSchemaRef = React.useRef<SaunaSchema | null>(null);
  const liveStatusRef = React.useRef<"idle" | "saving" | "error" | "conflict">("idle");
  const [unsaved, setUnsaved] = React.useState(false);
  const onSuccessRef = React.useRef(onSaveSuccess);
  onSuccessRef.current = onSaveSuccess;

  const autoSave = useStudioAutoSave({
    store,
    provider,
    id,
    externalVersion,
    debounceMs: SAVE_DEBOUNCE_MS,
    onSaveStart: () => {
      // Same tick as the `runSave(store.getState().schema)` that called it,
      // so this IS the schema going up the wire.
      sendingSchemaRef.current = store.getState().schema;
      liveStatusRef.current = "saving";
    },
    onSaveSuccess: () => {
      savedSchemaRef.current = sendingSchemaRef.current;
      liveStatusRef.current = "idle";
      setUnsaved(store.getState().schema !== savedSchemaRef.current);
      onSuccessRef.current?.();
    },
    onSaveError: () => {
      liveStatusRef.current = "error";
    },
    onConflict: () => {
      liveStatusRef.current = "conflict";
    },
  });
  if (savedSchemaRef.current === null) savedSchemaRef.current = store.getState().schema;
  const hasPendingEdit = () => store.getState().schema !== savedSchemaRef.current;

  // Leaving the editor must not drop an edit still waiting in the debounce
  // window: the hook clears its timer on unmount without flushing. A link
  // out waits for the save (`leaveTo`); a tab close while unsaved gets the
  // browser's prompt — and the prompt asks the same question as the link, so
  // it reads the same answer and not `status`.
  const router = useRouter();
  React.useEffect(() => {
    const sync = () => setUnsaved(store.getState().schema !== savedSchemaRef.current);
    sync();
    return store.subscribe(sync);
  }, [store]);
  useBeforeUnloadGuard(unsaved || autoSave.status === "saving");

  /**
   * Wait out an in-flight save. `true` = it finished (or there was none);
   * `false` = the budget of 5 s ran out with the PUT still going. The
   * difference is the whole point: on a slow network the loop used to fall
   * out on the counter and the caller read that as "saved".
   */
  const settle = async (): Promise<boolean> => {
    for (let i = 0; i < 100; i++) {
      if (liveStatusRef.current !== "saving") return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return liveStatusRef.current !== "saving";
  };
  /**
   * Wait for an in-flight save, write a pending one. `true` ONLY when the
   * schema on the screen is the schema on the server — not when the save is
   * merely "not failing".
   */
  const flushPendingSave = async (): Promise<boolean> => {
    if (!(await settle())) return false;
    if (liveStatusRef.current === "conflict") return false;
    // `saveNow` is also the way out of the two silent states above: a pending
    // edit whose debounce was dropped, and one the PUT it raced left behind.
    if (hasPendingEdit() || liveStatusRef.current === "error") {
      await autoSave.saveNow();
      if (!(await settle())) return false;
    }
    return !hasPendingEdit() && liveStatusRef.current === "idle";
  };
  /**
   * Every link out of the editor (Back, History) goes through here: wait for
   * an in-flight save, write a pending one, and only then navigate. A save
   * that ends in "error" or "conflict" would drop the edit without a word, so
   * leaving then asks first.
   */
  const leaveTo = (href: string) => async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // A conflict already on screen leaves freely — the person has seen it,
    // and the journal is where it is sorted out.
    if (liveStatusRef.current === "conflict") return;
    if (!hasPendingEdit() && liveStatusRef.current !== "saving" && liveStatusRef.current !== "error") return;
    e.preventDefault();
    // Unsaved at click time and not saved now — leaving would drop the edit,
    // so ask.
    if (!(await flushPendingSave()) && !window.confirm(leaveUnsavedMessage)) return;
    router.push(href);
  };

  return {
    autoSave,
    /** The screen is ahead of the server (a pending or unsaved edit). */
    unsaved,
    /** The kit's state for SaveStatus. */
    saveState: saveStateOf(autoSave.status),
    /** «Try again» on an error: write now. */
    retry: () => void autoSave.saveNow(),
    flushPendingSave,
    leaveTo,
  };
}
