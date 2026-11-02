"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { useTranslations } from "@/shared/hooks";
import {
  useUpdateWorkspace,
  type Workspace,
} from "@/entities/collections/workspace";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

interface EditWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace | null;
}

const formSchema = z.object({
  name: z.string().min(1).max(120),
});
type FormValues = z.infer<typeof formSchema>;

export function EditWorkspaceDialog({
  open,
  onOpenChange,
  workspace,
}: EditWorkspaceDialogProps) {
  const t = useTranslations("common.dialogs.collectionsWorkspace");
  const tCommon = useTranslations("common");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: workspace?.name ?? "" },
  });

  // Re-prime the form whenever the dialog opens against a different
  // workspace — same pattern as edit-user-dialog.
  useEffect(() => {
    if (open && workspace) form.reset({ name: workspace.name });
  }, [open, workspace, form]);

  const updateMutation = useUpdateWorkspace();

  const onSubmit = (values: FormValues) => {
    if (!workspace) return;
    updateMutation.mutate(
      { id: workspace.id, payload: { name: values.name.trim() } },
      {
        onSuccess: () => {
          toast.success(t("updatedSuccess") as string);
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : (t("updateError") as string)
          );
        },
      }
    );
  };

  if (!workspace) return null;

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={425}>
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("editTitle") as string}</UI.Dialog.Title>
          <UI.Dialog.Description>
            {t("editDescription") as string}
          </UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Field.Root {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Box gap={4}>
              <UI.Field.Field
                control={form.control as never}
                name="name"
                render={({ field }) => (
                  <UI.Field.Item>
                    <UI.Field.Label>
                      {t("nameLabel") as string}
                    </UI.Field.Label>
                    <UI.Field.Control>
                      <UI.FormControl.Input
                        placeholder={t("namePlaceholder") as string}
                        autoFocus
                        {...field}
                      />
                    </UI.Field.Control>
                    <UI.Field.Message />
                  </UI.Field.Item>
                )}
              />
            </Box>
            <UI.Dialog.Footer marginTop={4}>
              <UI.Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
              >
                {tCommon("cancel") as string}
              </UI.Button>
              <UI.Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending
                  ? (tCommon("saving") as string)
                  : (tCommon("save") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </form>
        </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
