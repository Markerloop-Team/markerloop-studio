"use client";

// «Deleted workspaces» (SDL-666): the trash of collections-service (SDL-660),
// GET /v1/workspaces?state=deleted — each with the days left before it is
// erased and a «Restore» button (POST /v1/workspaces/:id/restore).

import { toast } from "sonner";
import * as UI from "@markerloop/ui/ui";
import { Box, Text } from "@markerloop/ui/ui";

import {
  useDeletedWorkspaces,
  useRestoreWorkspace,
  type DeletedWorkspace,
  type Workspace,
} from "@/entities/collections/workspace";
import { useTranslations } from "@/shared/hooks";

export function DeletedWorkspacesDialog({
  open,
  onOpenChange,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored?: (workspace: Workspace) => void;
}) {
  const t = useTranslations("limits.trash");
  const query = useDeletedWorkspaces({ enabled: open });
  const restore = useRestoreWorkspace();

  const onRestore = async (w: DeletedWorkspace) => {
    try {
      const restored = await restore.mutateAsync(w.id);
      toast.success(t("restored"));
      onRestored?.(restored && restored.id ? restored : w);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("restoreError"));
    }
  };

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* The trash can hold hundreds of workspaces: the dialog is capped at
          the screen (100dvh, not vh — the phone's browser bar) and only the
          list scrolls, so the title and «Close» stay on screen. A column
          flex, not the kit's grid: a grid track grows to the widest
          unbreakable name and pushed «Restore» past the right edge. */}
      <UI.Dialog.Content
        maxWidth={480}
        className="flex max-h-[calc(100dvh-2rem)] flex-col"
        data-testid="trash-dialog"
      >
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("title")}</UI.Dialog.Title>
          <UI.Dialog.Description>{t("description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <Box direction="column" className="min-h-0 flex-1 overflow-y-auto" data-testid="trash-scroll">
          <DeletedWorkspacesList
            items={query.data ?? []}
            loading={query.isLoading}
            error={query.isError}
            restoringId={restore.isPending ? (restore.variables ?? null) : null}
            onRestore={(w) => void onRestore(w)}
          />
        </Box>
        <Box direction="row" className="justify-end">
          <UI.Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </UI.Button>
        </Box>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/** The list itself — rendered by smoke:usage-limits without the portal. */
export function DeletedWorkspacesList({
  items,
  loading,
  error,
  restoringId,
  onRestore,
}: {
  items: readonly DeletedWorkspace[];
  loading?: boolean;
  error?: boolean;
  restoringId: string | null;
  onRestore: (w: DeletedWorkspace) => void;
}) {
  const t = useTranslations("limits.trash");
  if (loading) return <Text size="sm" variant="muted">{t("loading")}</Text>;
  if (error) return <Text size="sm" variant="destructive">{t("loadError")}</Text>;
  if (items.length === 0) {
    return (
      <Text size="sm" variant="muted" data-testid="trash-empty">
        {t("empty")}
      </Text>
    );
  }
  return (
    <Box as="ul" direction="column" gap={2} data-testid="trash-list">
      {items.map((w) => (
        <Box
          as="li"
          key={w.id}
          direction="row"
          align="center"
          gap={3}
          className="justify-between rounded-md border border-border p-3"
          data-testid="trash-item"
        >
          {/* flex-1 + min-w-0: a long name truncates instead of pushing
              «Restore» off the row. */}
          <Box direction="column" gap={1} className="min-w-0 flex-1">
            <Text size="sm" weight="medium" className="truncate">
              {w.name}
            </Text>
            <Text size="xs" variant="muted" data-testid="trash-days-left">
              {t("daysLeft", { days: w.days_left })}
            </Text>
          </Box>
          <UI.Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="trash-restore"
            className="shrink-0"
            disabled={restoringId !== null}
            onClick={() => onRestore(w)}
          >
            {restoringId === w.id ? t("restoring") : t("restore")}
          </UI.Button>
        </Box>
      ))}
    </Box>
  );
}
