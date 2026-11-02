"use client";

import { toast } from "sonner";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import type { Workspace } from "@/entities/collections/workspace";

import { WorkspaceCreateForm } from "./workspace-create-form";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (workspace: Pick<Workspace, "id">) => void;
}

/**
 * «+ New workspace». The fields are the onboarding screen's (SDL-759): name and
 * address, the address checked as it is typed. Limit refusals — the owner's
 * ceiling and the one free workspace — stay in the dialog with their rule.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const t = useTranslations("common.dialogs.collectionsWorkspace");
  const tCommon = useTranslations("common");
  const tTrash = useTranslations("limits.trash");

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={425} className="max-h-[100dvh] overflow-y-auto">
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("createTitle")}</UI.Dialog.Title>
          <UI.Dialog.Description>{t("createDescription")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <WorkspaceCreateForm
          autoFocus
          resetKey={open}
          testIdPrefix="create-workspace"
          onCreated={(workspace, outcome) => {
            toast.success(outcome === "restored" ? tTrash("restored") : t("createdSuccess"));
            onOpenChange(false);
            onCreated?.(workspace);
          }}
          renderActions={({ pending, canSubmit }) => (
            <UI.Dialog.Footer marginTop={0}>
              <UI.Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                {tCommon("cancel")}
              </UI.Button>
              <UI.Button
                type="submit"
                disabled={!canSubmit}
                data-testid="create-workspace-submit"
              >
                {pending ? tCommon("creating") : tCommon("create")}
              </UI.Button>
            </UI.Dialog.Footer>
          )}
        />
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
