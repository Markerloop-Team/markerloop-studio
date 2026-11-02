"use client";

// DeleteDialog — the admin's ONE question before a delete (EP-186, layer 3,
// pattern 4). Every delete of the product asks it the same way:
//
//   title                      — what is about to go
//   consequence                — what deleting does (a PolicyLine where the
//                                rule's own sentence exists)
//   "where used", up front     — the places that still reference the item,
//                                read BEFORE the first DELETE; a loading line
//                                while they are read
//   the checkbox               — when places > 0, «I understand it will be
//                                removed from N places» must be ticked before
//                                Delete enables; a new list asks again
//   the error                  — inline, a destructive Alert in the dialog,
//                                never a toast: the person is still looking
//                                at the question, not at the corner
//   Cancel · [extra] · Delete  — in a kit Box, NOT Dialog.Footer: the kit's
//                                footer is `max-sm:flex-col-reverse` and on a
//                                phone it would print Delete above Cancel
//
// Focus starts on Cancel: Enter must neither delete nor follow a place link.
//
// The body is a component of its own (DeleteDialogBody) because the kit's
// Dialog content is portalled and renders nothing under react-dom/server —
// the smokes execute the body.

import * as React from "react";
import NextLink from "next/link";
import { AlertTriangle, Trash2 } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";

/** One place that still uses the item — a page, a record, another block. */
export interface DeletePlace {
  key: string;
  label: React.ReactNode;
  href?: string;
  /** A second, muted line (a page title under its path, a field name). */
  hint?: React.ReactNode;
}

export interface DeleteDialogUsage {
  /** How many live places use the item. > 0 asks for the checkbox. */
  count: number;
  /** The places are still being read — Delete waits for the answer. */
  loading?: boolean;
  /** The default rendering of the places. */
  places?: readonly DeletePlace[];
  /** A section-specific list instead of `places` (files keep their rows). */
  list?: React.ReactNode;
  /** Heading over the list; default «Used in N places». */
  title?: React.ReactNode;
  /** A line under the list: history, «could not read», «not listed». */
  note?: React.ReactNode;
  /**
   * Identity of the list. When it changes (a 409 brought places the read
   * did not have) the checkbox is unticked and asks again.
   */
  resetKey?: string;
}

export interface DeleteDialogTestIds {
  body?: string;
  cancel?: string;
  confirm?: string;
  error?: string;
  ack?: string;
  ackLabel?: string;
  usage?: string;
  usageTitle?: string;
  usageLoading?: string;
}

const DEFAULT_TEST_IDS: Required<DeleteDialogTestIds> = {
  body: "delete-body",
  cancel: "delete-cancel",
  confirm: "delete-confirm",
  error: "delete-error",
  ack: "delete-ack",
  ackLabel: "delete-ack-label",
  usage: "delete-usage",
  usageTitle: "delete-usage-title",
  usageLoading: "delete-usage-loading",
};

export interface DeleteDialogBodyProps {
  /** What deleting does — a PolicyLine, a sentence, or several lines. */
  consequence?: React.ReactNode;
  /** «Where used». Absent = the item has no places to speak of. */
  usage?: DeleteDialogUsage;
  /** Anything else the question needs (type the name, warnings). */
  children?: React.ReactNode;
  /** The failed attempt, in words. Shown inline. */
  error?: React.ReactNode;
  /** The delete is in flight. */
  pending?: boolean;
  /** Keeps Delete off for a reason of the caller's (the name not typed). */
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  /** Drawn quieter when a stronger action sits next to it («Delete forever»). */
  confirmVariant?: "destructive" | "outline";
  /** Secondary actions between Cancel and Delete («Unpublish instead»). */
  extraActions?: React.ReactNode;
  /** The checkbox's words, when the host says it its own way («Remove it from N pages», EP-175). */
  ackLabel?: React.ReactNode;
  testIds?: DeleteDialogTestIds;
}

/** Whether Delete may be pressed — exported so the smokes run the rule itself. */
export function deleteDialogCanConfirm({
  pending = false,
  confirmDisabled = false,
  usage,
  acknowledged,
}: {
  pending?: boolean;
  confirmDisabled?: boolean;
  usage?: Pick<DeleteDialogUsage, "count" | "loading">;
  acknowledged: boolean;
}): boolean {
  if (pending || confirmDisabled) return false;
  if (usage?.loading) return false;
  if (usage && usage.count > 0 && !acknowledged) return false;
  return true;
}

export function DeleteDialogBody({
  consequence,
  usage,
  children,
  error,
  pending = false,
  confirmDisabled = false,
  onCancel,
  onConfirm,
  confirmLabel,
  pendingLabel,
  confirmVariant = "destructive",
  extraActions,
  ackLabel,
  testIds,
}: DeleteDialogBodyProps) {
  const t = useTranslations("common.deleteDialog");
  const ids = { ...DEFAULT_TEST_IDS, ...testIds };
  const [ack, setAck] = React.useState(false);
  const count = usage?.count ?? 0;
  const needsAck = !!usage && !usage.loading && count > 0;
  // A different list asks again: the person agreed to the places they saw.
  const resetKey = usage ? `${count}|${usage.resetKey ?? ""}` : "";
  React.useEffect(() => setAck(false), [resetKey]);
  const canConfirm = deleteDialogCanConfirm({ pending, confirmDisabled, usage, acknowledged: ack });

  return (
    <UI.Box
      direction="column"
      gap={4}
      className="min-w-0"
      data-testid={ids.body}
      data-needs-ack={needsAck ? "true" : "false"}
    >
      {consequence ? (
        <UI.Box direction="column" gap={2} className="min-w-0" data-testid="delete-dialog-consequence">
          {typeof consequence === "string" ? (
            <UI.Text size="sm" className="break-words">
              {consequence}
            </UI.Text>
          ) : (
            consequence
          )}
        </UI.Box>
      ) : null}

      {usage?.loading ? (
        <UI.Text size="sm" variant="muted" data-testid={ids.usageLoading}>
          {t("placesLoading")}
        </UI.Text>
      ) : null}

      {usage && !usage.loading && count > 0 ? (
        <UI.Box direction="column" gap={1} className="min-w-0" data-testid={ids.usage} data-count={count}>
          <UI.Text as="h3" size="sm" weight="medium" data-testid={ids.usageTitle}>
            {usage.title ?? t("placesTitle", { count })}
          </UI.Text>
          <div className="max-h-56 min-w-0 overflow-y-auto">
            {usage.list ?? (usage.places ? <DeletePlaceList places={usage.places} /> : null)}
          </div>
        </UI.Box>
      ) : null}
      {usage && !usage.loading && usage.note ? usage.note : null}

      {children}

      {needsAck ? (
        <label className="flex cursor-pointer items-start gap-2 text-sm" data-testid={ids.ackLabel}>
          <UI.FormControl.Checkbox
            className="mt-0.5"
            checked={ack}
            onCheckedChange={(next) => setAck(next === true)}
            disabled={pending}
            data-testid={ids.ack}
          />
          <span>{ackLabel ?? t("ack", { count })}</span>
        </label>
      ) : null}

      {error ? (
        <UI.Alert variant="destructive" data-testid={ids.error}>
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
          data-testid={ids.cancel}
          data-delete-dialog-cancel=""
        >
          {t("cancel")}
        </UI.Button>
        {extraActions}
        <UI.Button
          type="button"
          variant={confirmVariant}
          onClick={() => {
            if (canConfirm) onConfirm();
          }}
          disabled={!canConfirm}
          data-testid={ids.confirm}
        >
          <Trash2 size={16} aria-hidden="true" />
          {pending ? pendingLabel ?? t("deleting") : confirmLabel ?? t("confirm")}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

/** The default «where used» rows: a label (a link when it leads somewhere) and a hint. */
export function DeletePlaceList({ places }: { places: readonly DeletePlace[] }) {
  return (
    <UI.Box direction="column" gap={0} className="min-w-0" data-testid="delete-places">
      {places.map((p, index) => (
        <UI.Box
          key={p.key}
          direction="column"
          gap={0}
          className={`min-w-0 py-2 ${index > 0 ? "border-t border-border" : ""}`}
          data-testid="delete-place"
        >
          {p.href ? (
            <NextLink
              href={p.href}
              className="truncate text-sm font-medium underline underline-offset-4 hover:no-underline"
              data-testid="delete-place-link"
            >
              {p.label}
            </NextLink>
          ) : (
            <UI.Text as="span" size="sm" className="truncate">
              {p.label}
            </UI.Text>
          )}
          {p.hint ? (
            <UI.Text as="span" size="xs" variant="muted" className="truncate">
              {p.hint}
            </UI.Text>
          ) : null}
        </UI.Box>
      ))}
    </UI.Box>
  );
}

export interface DeleteDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** A short line under the title. */
  description?: React.ReactNode;
  /** A delete in flight: Esc and an outside click do not abandon it. */
  pending?: boolean;
  /** data-testid of the dialog card. */
  testId?: string;
  /** Extra attributes for the card (a step marker the e2e reads). */
  contentProps?: Record<`data-${string}`, string | undefined>;
  /** The body — DeleteDialogBody, or a section's body built on it. */
  children: React.ReactNode;
}

/**
 * The dialog around the body: the kit's Dialog (not AlertDialog, not a
 * footer), the warning title, focus on Cancel. A section whose body needs
 * its own hooks (an address, a file, a block) renders its body inside it;
 * the body is mounted only while open, so its checkbox starts unticked.
 */
export function DeleteDialogShell({
  open,
  onOpenChange,
  title,
  description,
  pending = false,
  testId = "delete-dialog",
  contentProps,
  children,
}: DeleteDialogShellProps) {
  return (
    <UI.Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      {/* 100dvh, not vh: on a phone the browser bar would push the buttons
          under the fold; the card scrolls instead. role=alertdialog: the card
          interrupts with a destructive question (WAI-ARIA). */}
      <UI.Dialog.Content
        maxWidth={520}
        role="alertdialog"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-testid={testId}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...contentProps}
        onOpenAutoFocus={(e) => {
          const cancel = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            "[data-delete-dialog-cancel]"
          );
          if (!cancel) return;
          e.preventDefault();
          cancel.focus();
        }}
      >
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>
            <UI.Box direction="row" align="center" gap={2} className="min-w-0">
              <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 break-words">{title}</span>
            </UI.Box>
          </UI.Dialog.Title>
          {description ? <UI.Dialog.Description>{description}</UI.Dialog.Description> : null}
        </UI.Dialog.Header>
        {open ? children : null}
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

export interface DeleteDialogProps
  extends DeleteDialogBodyProps,
    Omit<DeleteDialogShellProps, "children"> {
  children?: React.ReactNode;
}

export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  testId,
  contentProps,
  ...body
}: DeleteDialogProps) {
  return (
    <DeleteDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      pending={body.pending}
      testId={testId}
      contentProps={contentProps}
    >
      <DeleteDialogBody
        {...body}
        onCancel={() => {
          if (!body.pending) body.onCancel();
        }}
      />
    </DeleteDialogShell>
  );
}
