"use client";

import { useState } from "react";
import type * as React from "react";
import { toast } from "sonner";
import { ArchiveRestore, Check, ChevronsUpDown, Pencil, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/shared/hooks";
import {
  useDeleteWorkspace,
  useDeletedWorkspaces,
  useRestoreWorkspace,
  type DeletedWorkspace,
  type Workspace,
} from "@/entities/collections/workspace";
import * as UI from "@markerloop/ui/ui";
import { Box, Text } from "@markerloop/ui/ui";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { EditWorkspaceDialog } from "./edit-workspace-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { DeleteDialog } from "@/shared/components/delete-dialog";
import { DeletedWorkspacesDialog } from "./deleted-workspaces-dialog";
import { TrashMenuRows } from "./trash-menu-group";
import { PolicyLine } from "@/entities/policy/ui/policy-line";
import { usePolicyString } from "@/shared/config/policy-strings-context";
import { useSitesBaseDomain } from "@/shared/config/site-address-context";

interface CollectionsShellHeaderProps {
  workspaces: readonly Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (id: string) => void;
  onCreatedWorkspace: (workspace: Pick<Workspace, "id">) => void;
  /** Called after the selected workspace is deleted so the page can
   * pick a fallback (or clear the URL) without flashing a 404. */
  onDeletedWorkspace: () => void;
  /** Desktop rail collapsed: only the avatar stays visible (SDL-753). */
  collapsed?: boolean;
  /**
   * The line under the name. Absent = the workspace's slug (SDL-753); the
   * shell passes the plan («Free plan») since EP-157, and `null` draws no line
   * (the plan is still loading or failed to load).
   */
  subtitle?: React.ReactNode;
}

export function CollectionsShellHeader({
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onCreatedWorkspace,
  onDeletedWorkspace,
  collapsed = false,
  subtitle,
}: CollectionsShellHeaderProps) {
  const t = useTranslations("collections.switchers");
  const tWsDialog = useTranslations("common.dialogs.collectionsWorkspace");

  const [wsCreateOpen, setWsCreateOpen] = useState(false);
  const [wsEditOpen, setWsEditOpen] = useState(false);
  const [wsDeleteOpen, setWsDeleteOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const tTrash = useTranslations("limits.trash");

  const deleteWorkspace = useDeleteWorkspace();
  // «Delete forever» only where the trash promise is in force on the contour
  // (@markerloop/policy workspace_delete_forever, SDL-666): its sentence is
  // null there otherwise, and so is the button.
  const foreverRule = usePolicyString("workspace_delete_forever");
  const sitesBase = useSitesBaseDomain();
  const hideWhenCollapsed = collapsed ? "md:hidden" : "";

  // The «Trash» group (SDL-758): under the same flag as «Delete forever» —
  // the trash promise in force on the contour. Read when the menu opens.
  const [menuOpen, setMenuOpen] = useState(false);
  const trashOn = !!foreverRule;
  const trashQuery = useDeletedWorkspaces({ enabled: trashOn && menuOpen });
  const restoreTrashed = useRestoreWorkspace();
  const [eraseTarget, setEraseTarget] = useState<DeletedWorkspace | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);

  const onRestoreTrashed = async (w: DeletedWorkspace) => {
    setTrashBusyId(w.id);
    try {
      const restored = await restoreTrashed.mutateAsync(w.id);
      toast.success(tTrash("restored"));
      onSelectWorkspace(restored && restored.id ? restored.id : w.id);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : tTrash("restoreError"));
    } finally {
      setTrashBusyId(null);
    }
  };

  const onConfirmDeleteWorkspace = async (permanent = false) => {
    if (!selectedWorkspace) return;
    await deleteWorkspace.mutateAsync({ id: selectedWorkspace.id, permanent });
    onDeletedWorkspace();
  };

  return (
    // The top-left workspace switcher of the shell (SDL-753), laid out as on
    // the canvas (`design-system/_canvas/chrome.tsx`, WorkspaceSwitcher):
    // avatar, name and address label, a check on the current workspace,
    // then «Create workspace». Rename / delete / trash stay here — they were
    // the collections header's, and the shell is now their only home.
    <Box className="min-w-0">
      <UI.Menu.Root modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <UI.Menu.Trigger asChild>
          <UI.Button
            type="button"
            variant="ghost"
            fullWidth
            className="h-auto justify-start gap-3 px-2 py-2"
            data-testid="workspace-switcher"
            aria-label={t("workspaceTriggerAria") as string}
          >
            {/* No initials avatar: the Markerloop mark next to the switcher
                already marks the place, and the avatar cut the name short. */}
            <Box
              direction="column"
              align="start"
              className={`min-w-0 ${hideWhenCollapsed}`}
            >
              <Text
                as="span"
                size="sm"
                weight="medium"
                className="max-w-full truncate"
                data-testid="workspace-switcher-current"
              >
                {selectedWorkspace
                  ? selectedWorkspace.name
                  : (t("noWorkspace") as string)}
              </Text>
              {subtitle !== undefined ? (
                subtitle ? (
                  <Text
                    as="span"
                    size="xs"
                    variant="muted"
                    className="max-w-full truncate"
                    data-testid="workspace-switcher-subtitle"
                  >
                    {subtitle}
                  </Text>
                ) : null
              ) : selectedWorkspace?.slug ? (
                <Text as="span" size="xs" variant="muted" className="max-w-full truncate">
                  {selectedWorkspace.slug}
                </Text>
              ) : null}
            </Box>
            <ChevronsUpDown
              size={16}
              aria-hidden="true"
              className={`ml-auto shrink-0 opacity-60 ${hideWhenCollapsed}`}
            />
          </UI.Button>
        </UI.Menu.Trigger>
        <UI.Menu.Content
          align="start"
          sideOffset={4}
          className="w-64"
          data-testid="workspace-switcher-menu"
        >
          <UI.Menu.Label>{t("workspacesLabel") as string}</UI.Menu.Label>
          {workspaces.length === 0 ? (
            <UI.Menu.Label>{t("emptyWorkspaces") as string}</UI.Menu.Label>
          ) : (
            workspaces.map((w) => {
              const current = w.id === selectedWorkspace?.id;
              return (
                <UI.Menu.Item
                  key={w.id}
                  className="gap-2"
                  data-testid="workspace-switcher-item"
                  onSelect={() => onSelectWorkspace(w.id)}
                  aria-current={current ? "true" : undefined}
                >
                  <Check
                    size={16}
                    aria-hidden="true"
                    className={current ? undefined : "invisible"}
                  />
                  <Box direction="column" align="start" className="min-w-0">
                    <Text as="span" size="sm" className="max-w-full truncate">
                      {w.name}
                    </Text>
                    {w.slug ? (
                      <Text as="span" size="xs" variant="muted" className="max-w-full truncate">
                        {sitesBase ? `${w.slug}.${sitesBase}` : w.slug}
                      </Text>
                    ) : null}
                  </Box>
                </UI.Menu.Item>
              );
            })
          )}

          {selectedWorkspace ? (
            <>
              <UI.Menu.Separator />
              <UI.Menu.Item onSelect={() => setWsEditOpen(true)}>
                <Pencil size={14} aria-hidden="true" />
                <Text size="sm">{t("renameWorkspace") as string}</Text>
              </UI.Menu.Item>
              <UI.Menu.Item onSelect={() => setWsDeleteOpen(true)}>
                <Trash2 size={14} aria-hidden="true" />
                <Text size="sm">{t("deleteWorkspace") as string}</Text>
              </UI.Menu.Item>
            </>
          ) : null}

          <UI.Menu.Separator />
          <UI.Menu.Item
            onSelect={() => setWsCreateOpen(true)}
            data-testid="workspace-switcher-create"
          >
            <Plus size={14} aria-hidden="true" />
            <Text size="sm">{t("createWorkspace") as string}</Text>
          </UI.Menu.Item>
          <UI.Menu.Item onSelect={() => setTrashOpen(true)} data-testid="open-trash">
            <ArchiveRestore size={14} aria-hidden="true" />
            <Text size="sm">{tTrash("menu")}</Text>
          </UI.Menu.Item>
          {trashOn ? (
            <TrashMenuRows
              items={trashQuery.data ?? []}
              busyId={trashBusyId}
              onRestore={(w) => void onRestoreTrashed(w)}
              onDeleteForever={(w) => setEraseTarget(w)}
              onShowAll={() => setTrashOpen(true)}
            />
          ) : null}
        </UI.Menu.Content>
      </UI.Menu.Root>

      {/* Create */}
      <CreateWorkspaceDialog
        open={wsCreateOpen}
        onOpenChange={setWsCreateOpen}
        onCreated={onCreatedWorkspace}
      />

      {/* Edit */}
      <EditWorkspaceDialog
        open={wsEditOpen}
        onOpenChange={setWsEditOpen}
        workspace={selectedWorkspace}
      />

      {/* Delete — offered to the owner of any workspace: there is no personal
          one any more (EP-155, SDL-760). What happens is the rule's own
          sentence (SDL-666); the name is typed. */}
      {selectedWorkspace ? (
        <DeleteConfirmDialog
          open={wsDeleteOpen}
          onOpenChange={setWsDeleteOpen}
          title={tWsDialog("deleteTitle") as string}
          description={tWsDialog("deleteDescription", { name: selectedWorkspace.name })}
          consequence={
            <>
              <PolicyLine stringKey="workspace_delete_consequence" target="deletion" testId="delete-policy-line" />
              {foreverRule ? (
                <Text size="sm" variant="muted" data-testid="delete-forever-rule">
                  {foreverRule}
                </Text>
              ) : null}
            </>
          }
          confirmName={{
            value: selectedWorkspace.name,
            label: tWsDialog("confirmNameLabel", { name: selectedWorkspace.name }),
            placeholder: tWsDialog("confirmNamePlaceholder"),
          }}
          forever={
            foreverRule
              ? {
                  label: tWsDialog("deleteForever"),
                  busyLabel: tWsDialog("deletingForever"),
                  onConfirm: () => onConfirmDeleteWorkspace(true),
                }
              : undefined
          }
          onConfirm={() => onConfirmDeleteWorkspace(false)}
          isDeleting={deleteWorkspace.isPending}
          successMessage={tWsDialog("deletedSuccess") as string}
          errorMessage={tWsDialog("deleteError") as string}
        />
      ) : null}

      {/* «Delete forever» of a trashed workspace — confirmed, cannot be undone.
          The admin's one delete dialog (EP-186): the failure stays in it. */}
      <DeleteDialog
        open={eraseTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setEraseTarget(null);
            setEraseError(null);
          }
        }}
        testId="trash-erase-confirm"
        title={tTrash("eraseTitle", { name: eraseTarget?.name ?? "" })}
        consequence={foreverRule ?? undefined}
        pending={deleteWorkspace.isPending}
        error={eraseError}
        confirmLabel={tWsDialog("deleteForever")}
        pendingLabel={tWsDialog("deletingForever")}
        testIds={{ confirm: "trash-erase-confirm-button" }}
        onCancel={() => {
          setEraseTarget(null);
          setEraseError(null);
        }}
        onConfirm={async () => {
          if (!eraseTarget) return;
          setEraseError(null);
          try {
            await deleteWorkspace.mutateAsync({ id: eraseTarget.id, permanent: true });
            toast.success(tTrash("erased"));
            setEraseTarget(null);
          } catch (e) {
            setEraseError(e instanceof Error && e.message ? e.message : tTrash("eraseError"));
          }
        }}
      />

      <DeletedWorkspacesDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onRestored={(w) => {
          setTrashOpen(false);
          onSelectWorkspace(w.id);
        }}
      />
    </Box>
  );
}
