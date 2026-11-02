"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../internal/utils/cn";

/**
 * Persistence states an admin document can be in. Generic vocabulary — the
 * host maps its own store/auto-save statuses onto these (a studio "ready"
 * becomes "saved", a dirty buffer becomes "unsaved").
 */
export type SaveStatusState =
  | "saved"
  | "saving"
  | "unsaved"
  | "loading"
  | "error"
  | "conflict";

const DEFAULT_LABELS: Record<SaveStatusState, string> = {
  saved: "saved",
  saving: "saving…",
  unsaved: "unsaved",
  loading: "loading…",
  error: "error",
  conflict: "conflict",
};

/** Semantic tone bucket per state: done / in flight / broken. */
type Tone = "success" | "pending" | "danger";

const STATE_TONE: Record<SaveStatusState, Tone> = {
  saved: "success",
  saving: "pending",
  unsaved: "pending",
  loading: "pending",
  error: "danger",
  conflict: "danger",
};

const chipVariants = cva(
  "inline-flex flex-none items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-caption font-semibold",
  {
    variants: {
      tone: {
        success: "bg-success/15 text-success-foreground",
        pending: "bg-warning/15 text-warning-foreground",
        danger: "bg-destructive/15 text-destructive",
      },
    },
  }
);

const dotVariants = cva("size-1.5 shrink-0 rounded-[3px]", {
  variants: {
    tone: {
      success: "bg-success",
      pending: "bg-warning",
      danger: "bg-destructive",
    },
  },
});

export type SaveStatusProps = React.ComponentProps<"span"> & {
  /** Current persistence state; picks tone and the default word. */
  state: SaveStatusState;
  /** Override for the default state word. */
  label?: React.ReactNode;
  /**
   * Full detail (an error message, say) — surfaces as the `title` tooltip
   * so the indicator stays one short word.
   */
  detail?: string;
  /**
   * `chip` (default) — tinted pill for the document toolbar;
   * `bare` — dot + word without the pill, for tight mobile bars.
   */
  variant?: "chip" | "bare";
};

/**
 * Save-state indicator of an admin document: status dot + short mono word
 * on a tone-tinted pill. Lifts the studio editor's save chip (SDL-223) as
 * a pure view — the host owns the state machine and passes the resulting
 * `state`; tones map onto theme tokens, no raw palette.
 */
export function SaveStatus({
  state,
  label,
  detail,
  variant = "chip",
  className,
  ...props
}: SaveStatusProps) {
  const tone = STATE_TONE[state];
  const word = label ?? DEFAULT_LABELS[state];

  if (variant === "bare") {
    return (
      <span
        data-slot="save-status"
        data-state={state}
        title={detail}
        className={cn(
          "text-muted-foreground flex flex-none items-center gap-1.5 text-xs font-semibold",
          className
        )}
        {...props}
      >
        <span aria-hidden="true" className={cn(dotVariants({ tone }), "size-2")} />
        {word}
      </span>
    );
  }

  return (
    <span
      data-slot="save-status"
      data-state={state}
      title={detail}
      className={cn(chipVariants({ tone }), className)}
      {...props}
    >
      <span aria-hidden="true" className={dotVariants({ tone })} />
      {word}
    </span>
  );
}
