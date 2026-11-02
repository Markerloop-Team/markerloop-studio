"use client";

// The «Trash» group of the workspace switcher (SDL-758, owner's decision 16 Oct
// 2026): a deleted workspace keeps holding the free place, so the person sees
// it right where the workspaces are — name, when it was deleted, when it will
// be erased — and decides: «Restore» or «Delete forever» (confirmed). Drawn
// only where the trash promise is in force (the shell header passes it the
// same flag as «Delete forever»); the full list stays in DeletedWorkspacesDialog.

import { useFormatter } from "next-intl";
import { ArchiveRestore, Trash2 } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { Box, Text } from "@markerloop/ui/ui";

import type { DeletedWorkspace } from "@/entities/collections/workspace";
import { useTranslations } from "@/shared/hooks";
import { daysSince } from "@/shared/lib/api/limit-refusal";

/** How many trashed workspaces the switcher shows before «Show all». */
export const TRASH_MENU_ROWS = 3;

/** The «Deleted N days ago · erased on DATE» line of one trashed workspace. */
export function useTrashedLine(): (w: DeletedWorkspace, now?: number) => string {
  const t = useTranslations("limits.freePlace");
  const tTrash = useTranslations("limits.trash");
  const format = useFormatter();
  return (w, now) => {
    const purge = w.purge_after ? new Date(w.purge_after) : null;
    const erased =
      purge && Number.isFinite(purge.getTime())
        ? tTrash("erasedOn", {
            date: format.dateTime(purge, { day: "numeric", month: "long", year: "numeric" }),
          })
        : tTrash("daysLeft", { days: w.days_left });
    if (!w.deleted_at) return erased;
    return `${tTrash("deletedAgo", { ago: t("deletedAgo", { days: daysSince(w.deleted_at, now) }) })} · ${erased}`;
  };
}

/** The rows themselves, inside an open UI.Menu.Content. */
export function TrashMenuRows({
  items,
  busyId,
  onRestore,
  onDeleteForever,
  onShowAll,
  now,
}: {
  items: readonly DeletedWorkspace[];
  busyId: string | null;
  onRestore: (w: DeletedWorkspace) => void;
  onDeleteForever: (w: DeletedWorkspace) => void;
  onShowAll: () => void;
  now?: number;
}) {
  const t = useTranslations("limits.trash");
  const line = useTrashedLine();
  if (items.length === 0) return null;
  const shown = items.slice(0, TRASH_MENU_ROWS);
  return (
    <>
      <UI.Menu.Separator />
      <UI.Menu.Label data-testid="switcher-trash-label">{t("group")}</UI.Menu.Label>
      {shown.map((w) => (
        <Box
          key={w.id}
          direction="column"
          gap={1}
          className="px-2 py-1.5"
          data-testid="switcher-trash-item"
        >
          <Text as="span" size="sm" className="max-w-full truncate">
            {w.name}
          </Text>
          <Text as="span" size="xs" variant="muted" data-testid="switcher-trash-when">
            {line(w, now)}
          </Text>
          <Box direction="row" gap={1}>
            <UI.Menu.Item
              className="h-7 gap-1 rounded-md border border-border px-2 text-xs"
              disabled={busyId !== null}
              data-testid="switcher-trash-restore"
              onSelect={() => onRestore(w)}
            >
              <ArchiveRestore size={14} aria-hidden="true" />
              {busyId === w.id ? t("restoring") : t("restore")}
            </UI.Menu.Item>
            <UI.Menu.Item
              className="h-7 gap-1 rounded-md border border-border px-2 text-xs text-destructive"
              disabled={busyId !== null}
              data-testid="switcher-trash-delete-forever"
              onSelect={() => onDeleteForever(w)}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t("deleteForever")}
            </UI.Menu.Item>
          </Box>
        </Box>
      ))}
      {items.length > shown.length ? (
        <UI.Menu.Item data-testid="switcher-trash-all" onSelect={onShowAll}>
          <Text size="sm">{t("showAll", { count: items.length })}</Text>
        </UI.Menu.Item>
      ) : null}
    </>
  );
}
