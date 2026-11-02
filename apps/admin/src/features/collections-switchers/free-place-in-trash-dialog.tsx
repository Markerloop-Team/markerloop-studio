"use client";

// «The free workspace is in the trash» (SDL-758, owner's decision 16 Oct
// 2026). A workspace in the trash keeps holding the account's one free place
// (no create–delete loop), so a create refused with 409 free_workspaces and
// `data.blocking_trashed` opens this window instead of a bare refusal: which
// workspace holds the place, when it was deleted, when it will be erased, and
// the two ways out — restore it, or erase it now and create the new one with
// what the person typed. Works whatever the trash flag says: on a contour
// where the trash UI is hidden this window is the only way out.
//
// A later third button («Create as Pro», with real payments) is not here yet.

import { useId } from "react";
import { useFormatter } from "next-intl";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { daysSince, type BlockingTrashed } from "@/shared/lib/api/limit-refusal";

export type FreePlaceAction = "restore" | "erase";

export type FreePlaceInTrashBodyProps = {
  trashed: BlockingTrashed;
  /** The account's free workspaces (the refusal's `limit`), if sent. */
  limit?: number;
  /** Which action is running, if any. */
  busy: FreePlaceAction | null;
  /** A sentence of what went wrong with the last action. */
  error?: string | null;
  onRestore: () => void;
  onEraseAndCreate: () => void;
  /** For tests: the moment «N days ago» is counted from. */
  now?: number;
  /** id of the sentence, so the dialog can name it as its description. */
  textId?: string;
};

/** The window's text and buttons — rendered by smoke:trash-window without the portal. */
export function FreePlaceInTrashBody({
  trashed,
  limit,
  busy,
  error,
  onRestore,
  onEraseAndCreate,
  now,
  textId,
}: FreePlaceInTrashBodyProps) {
  const t = useTranslations("limits.freePlace");
  const format = useFormatter();
  const days = daysSince(trashed.deleted_at, now);
  const purge = new Date(trashed.purge_after);
  const date = Number.isFinite(purge.getTime())
    ? format.dateTime(purge, { day: "numeric", month: "long", year: "numeric" })
    : trashed.purge_after;

  return (
    <UI.Box direction="column" gap={4}>
      <UI.Text as="p" size="sm" id={textId} data-testid="free-place-text">
        {t("text", {
          limit: limit ?? 1,
          name: trashed.name,
          ago: t("deletedAgo", { days }),
          date,
        })}
      </UI.Text>
      <UI.Text as="p" size="sm" variant="muted">
        {t("eraseWarning")}
      </UI.Text>
      {error ? (
        <UI.Alert variant="destructive" data-testid="free-place-error">
          {error}
        </UI.Alert>
      ) : null}
      <UI.Box direction="column" gap={2}>
        <UI.Button
          type="button"
          variant="outline"
          fullWidth
          className="h-auto whitespace-normal"
          disabled={busy !== null}
          data-testid="free-place-restore"
          onClick={onRestore}
        >
          {busy === "restore" ? t("restoring") : t("restore", { name: trashed.name })}
        </UI.Button>
        <UI.Button
          type="button"
          variant="destructive"
          fullWidth
          className="h-auto whitespace-normal"
          disabled={busy !== null}
          data-testid="free-place-erase-create"
          onClick={onEraseAndCreate}
        >
          {busy === "erase" ? t("erasing") : t("eraseAndCreate", { name: trashed.name })}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

export function FreePlaceInTrashDialog({
  open,
  onOpenChange,
  ...body
}: FreePlaceInTrashBodyProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("limits.freePlace");
  // The window's own sentence is its description (no duplicate of the title).
  const textId = useId();
  return (
    <UI.Dialog.Root open={open} onOpenChange={(next) => (body.busy ? undefined : onOpenChange(next))}>
      <UI.Dialog.Content
        maxWidth={460}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        aria-describedby={textId}
        data-testid="free-place-dialog"
      >
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("title")}</UI.Dialog.Title>
        </UI.Dialog.Header>
        <FreePlaceInTrashBody {...body} textId={textId} />
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
