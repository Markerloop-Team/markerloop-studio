"use client";

import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { DeleteDialog } from "@/shared/components/delete-dialog";
import { Box, Text } from "@markerloop/ui/ui";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Localized title shown at the top of the dialog. */
  title: string;
  /**
   * Localized description with the resource name baked in. Caller is
   * responsible for the wording — this component stays generic and
   * doesn't know whether it's deleting a workspace, a project, or
   * something else later on.
   */
  description: string;
  /** Localized warning bullet list, optional. */
  warnings?: readonly string[];
  /**
   * What the deletion does, in the product rules' own words (SDL-666):
   * a PolicyLine. The dialog never writes that sentence itself.
   */
  consequence?: ReactNode;
  /**
   * Type-to-confirm (SDL-666): both delete buttons stay disabled until the
   * input equals `value` exactly (surrounding spaces ignored).
   */
  confirmName?: { value: string; label: string; placeholder: string };
  /**
   * A second, irreversible action («Delete forever»). Offered only by a
   * caller that knows the promise behind it is in force on the contour.
   */
  forever?: { label: string; busyLabel: string; onConfirm: () => Promise<void> };
  /** Async deletion handler. A throw keeps the dialog open, the error inline. */
  onConfirm: () => Promise<void>;

  /** Disabled state while the parent mutation is in flight. */
  isDeleting: boolean;
  /** Localized success toast message; shown on resolved onConfirm. None = no toast. */
  successMessage?: string;
  /** Localized fallback error message when the thrown error is not an Error. */
  errorMessage: string;
}

/** Whether the typed name confirms the deletion — exact, spaces trimmed. */
export function nameConfirms(typed: string, expected: string): boolean {
  return typed.trim() === expected.trim() && expected.trim().length > 0;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  warnings,
  consequence,
  confirmName,
  forever,
  onConfirm,
  isDeleting,
  successMessage,
  errorMessage,
}: DeleteConfirmDialogProps) {
  const tCommon = useTranslations("common");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  // A reopened dialog asks for the name again and forgets the last failure.
  useEffect(() => {
    if (open) {
      setTyped("");
      setError(null);
    }
  }, [open]);

  const confirmed = !confirmName || nameConfirms(typed, confirmName.value);

  // EP-186: a failure stays in the dialog, next to the question — never a toast.
  const run = async (action: () => Promise<void>) => {
    if (!confirmed) return;
    setError(null);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : errorMessage);
    }
  };

  // The admin's one delete dialog (shared/components/delete-dialog): Cancel
  // left of the destructive action in a Box (not the footer that flips them on
  // a phone), focus on Cancel, the error inline.
  return (
    <DeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      consequence={consequence}
      pending={isDeleting}
      error={error}
      confirmDisabled={!confirmed}
      confirmLabel={tCommon("delete")}
      pendingLabel={tCommon("deleting")}
      // With a «forever» next to it, the plain delete is the reversible one
      // (the trash) and looks calmer; the irreversible action is the
      // destructive one (SDL-666 review).
      confirmVariant={forever ? "outline" : "destructive"}
      extraActions={
        forever ? (
          <UI.Button
            type="button"
            variant="destructive"
            data-testid="delete-forever"
            onClick={() => void run(forever.onConfirm)}
            disabled={isDeleting || !confirmed}
          >
            {isDeleting ? forever.busyLabel : forever.label}
          </UI.Button>
        ) : null
      }
      onCancel={() => onOpenChange(false)}
      onConfirm={() => void run(onConfirm)}
    >
      <DeleteConfirmBody
        warnings={warnings}
        confirmName={confirmName}
        typed={typed}
        onTyped={setTyped}
        inputId={inputId}
        disabled={isDeleting}
      />
    </DeleteDialog>
  );
}

/**
 * The dialog's body as a component of its own: the kit's Dialog content is
 * portalled and renders nothing under react-dom/server, so this is what
 * smoke:usage-limits executes.
 */
export function DeleteConfirmBody({
  warnings,
  consequence,
  confirmName,
  typed,
  onTyped,
  inputId,
  disabled,
}: {
  warnings?: readonly string[];
  consequence?: ReactNode;
  confirmName?: { value: string; label: string; placeholder: string };
  typed: string;
  onTyped: (value: string) => void;
  inputId: string;
  disabled?: boolean;
}) {
  return (
    <Box direction="column" gap={3} data-testid="delete-confirm-body">
      {warnings && warnings.length > 0 ? (
        <Box as="ul" gap={1} className="pl-5">
          {warnings.map((w, i) => (
            <Text as="li" key={i} size="sm" variant="destructive">
              {w}
            </Text>
          ))}
        </Box>
      ) : null}

      {consequence}

      {confirmName ? (
        <Box direction="column" gap={1}>
          <label htmlFor={inputId}>
            <Text as="span" size="sm">
              {confirmName.label}
            </Text>
          </label>
          <UI.FormControl.Input
            id={inputId}
            data-testid="delete-confirm-name"
            autoComplete="off"
            placeholder={confirmName.placeholder}
            value={typed}
            disabled={disabled}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onTyped(e.target.value)}
          />
        </Box>
      ) : null}
    </Box>
  );
}
