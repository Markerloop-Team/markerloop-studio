"use client";

// One save status (EP-186, layer 3, pattern 6). Every autosaving editor of the
// admin — the page editor, the Block editor, the site theme — says where its
// edits are with the kit's SaveStatus and the same words:
//
//   Saved · Saving… · Not saved · Conflict      (+ «Try again» on an error)
//
// with ONE debounce (SAVE_DEBOUNCE_MS) between the last edit and the write,
// and ONE leave-guard (useBeforeUnloadGuard, plus the editors' own link
// guard) while an edit is not on the server yet.
//
// The editor maps its own state machine onto the kit's `SaveStatusState`; the
// words and the retry live here, so no editor grows its own copy.

import * as React from "react";
import * as UI from "@markerloop/ui/ui";
import { SaveStatus, type SaveStatusState } from "@markerloop/ui/ui/admin";

import { useTranslations } from "@/shared/hooks";

export type { SaveStatusState };

/** The pause after the last edit before it is written — the same in every editor. */
export const SAVE_DEBOUNCE_MS = 800;

/** The word for a state — `common.saveStatus.*`. */
export function useSaveStatusWord(): (state: SaveStatusState) => string {
  const t = useTranslations("common.saveStatus");
  return (state) => t(state);
}

export interface EditorSaveStatusProps {
  state: SaveStatusState;
  /** The full reason (an error message) — the chip's tooltip, the word stays short. */
  detail?: string;
  /** Offered as «Try again» next to the chip while `state` is "error". */
  onRetry?: () => void;
  /** data-testid of the chip itself. */
  testId?: string;
  retryTestId?: string;
  /** Extra data-* attributes for the chip (the host's own state, read by e2e). */
  data?: Record<`data-${string}`, string | undefined>;
}

/** The kit's SaveStatus with the admin's words and its retry. */
export function EditorSaveStatus({ state, detail, onRetry, testId, retryTestId, data }: EditorSaveStatusProps) {
  const t = useTranslations("common.saveStatus");
  return (
    <UI.Box direction="row" align="center" gap={2} className="min-w-0" data-testid={testId ? `${testId}-line` : undefined}>
      <SaveStatus state={state} label={t(state)} detail={detail} data-testid={testId} {...data} />
      {state === "error" && onRetry ? (
        <UI.Button type="button" size="xs" variant="outline" onClick={onRetry} data-testid={retryTestId}>
          {t("retry")}
        </UI.Button>
      ) : null}
    </UI.Box>
  );
}
