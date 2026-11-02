"use client";

// ConfirmDialog — the admin's one question before a non-destructive step that
// changes what people see: publish, update a publication, unpublish, restore a
// version (EP-186, layer 3, patterns 5 and 7). Laid out by the same rules as
// the delete dialog (./delete-dialog.tsx):
//
//   title                    — the step, as a question
//   body                     — what exactly will change (who sees what)
//   the error                — inline, a destructive Alert in the dialog
//   Cancel · Confirm         — in a kit Box, NOT Dialog.Footer: the kit's
//                              footer is `max-sm:flex-col-reverse` and on a
//                              phone it would print Confirm above Cancel
//
// Focus starts on Cancel: Enter alone never publishes or restores.
//
// The body is a component of its own (ConfirmDialogBody) because the kit's
// Dialog content is portalled and renders nothing under react-dom/server —
// the smokes execute the body.

import * as React from "react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";

export interface ConfirmDialogTestIds {
  body?: string;
  cancel?: string;
  confirm?: string;
  error?: string;
}

export interface ConfirmDialogBodyProps {
  /** What the step changes — sentences, a list of changes. */
  children?: React.ReactNode;
  /** The failed attempt, in words. Shown inline. */
  error?: React.ReactNode;
  /** The step is in flight. */
  pending?: boolean;
  /** Keeps Confirm off for a reason of the caller's (a stale read). */
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: React.ReactNode;
  pendingLabel?: React.ReactNode;
  /** An icon before the confirm label. */
  confirmIcon?: React.ReactNode;
  confirmVariant?: "default" | "destructive" | "outline";
  cancelLabel?: React.ReactNode;
  testIds?: ConfirmDialogTestIds;
}

export function ConfirmDialogBody({
  children,
  error,
  pending = false,
  confirmDisabled = false,
  onCancel,
  onConfirm,
  confirmLabel,
  pendingLabel,
  confirmIcon,
  confirmVariant = "default",
  cancelLabel,
  testIds,
}: ConfirmDialogBodyProps) {
  const t = useTranslations("common.confirmDialog");
  const canConfirm = !pending && !confirmDisabled;
  return (
    <UI.Box direction="column" gap={4} className="min-w-0" data-testid={testIds?.body}>
      {children}
      {error ? (
        <UI.Alert variant="destructive" data-testid={testIds?.error}>
          <UI.Text as="span" size="sm" className="break-words">
            {error}
          </UI.Text>
        </UI.Alert>
      ) : null}
      <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
        <UI.Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          data-testid={testIds?.cancel}
          data-confirm-dialog-cancel=""
        >
          {cancelLabel ?? t("cancel")}
        </UI.Button>
        <UI.Button
          type="button"
          variant={confirmVariant}
          onClick={() => {
            if (canConfirm) onConfirm();
          }}
          disabled={!canConfirm}
          data-testid={testIds?.confirm}
        >
          {confirmIcon}
          {pending && pendingLabel ? pendingLabel : confirmLabel}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

/** One line of «what changes»: an icon and a sentence. */
export function ConfirmDialogLine({
  icon,
  children,
  testId,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <UI.Box direction="row" align="start" gap={2} className="min-w-0">
      {icon ? <span className="mt-0.5 shrink-0 opacity-60 [&_svg]:size-4">{icon}</span> : null}
      <UI.Text size="sm" className="min-w-0 break-words" data-testid={testId}>
        {children}
      </UI.Text>
    </UI.Box>
  );
}

export interface ConfirmDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** A short line under the title. */
  description?: React.ReactNode;
  /** The step is in flight: Esc and an outside click do not abandon it. */
  pending?: boolean;
  /** data-testid of the dialog card. */
  testId?: string;
  children: React.ReactNode;
}

/** The kit's Dialog around a body; the body is mounted only while open. */
export function ConfirmDialogShell({
  open,
  onOpenChange,
  title,
  description,
  pending = false,
  testId,
  children,
}: ConfirmDialogShellProps) {
  return (
    <UI.Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      {/* 100dvh, not vh: on a phone the browser bar would push the buttons
          under the fold; the card scrolls instead. */}
      <UI.Dialog.Content
        maxWidth={520}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-testid={testId}
        {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(e) => {
          const cancel = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            "[data-confirm-dialog-cancel]"
          );
          if (!cancel) return;
          e.preventDefault();
          cancel.focus();
        }}
      >
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>
            <span className="min-w-0 break-words">{title}</span>
          </UI.Dialog.Title>
          {description ? <UI.Dialog.Description>{description}</UI.Dialog.Description> : null}
        </UI.Dialog.Header>
        {open ? children : null}
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

export interface ConfirmDialogProps
  extends ConfirmDialogBodyProps,
    Omit<ConfirmDialogShellProps, "children" | "pending"> {}

export function ConfirmDialog({ open, onOpenChange, title, description, testId, ...body }: ConfirmDialogProps) {
  return (
    <ConfirmDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      pending={body.pending}
      testId={testId}
    >
      <ConfirmDialogBody
        {...body}
        onCancel={() => {
          if (!body.pending) body.onCancel();
        }}
      />
    </ConfirmDialogShell>
  );
}
