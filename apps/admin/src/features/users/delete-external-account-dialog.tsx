"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDeleteExternalAccount } from "@/entities/user/hooks";
import type { ExternalAccount } from "@/entities/user/api";
import { useTranslations } from "@/shared/hooks";
import { DeleteDialog } from "@/shared/components/delete-dialog";

interface DeleteExternalAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ExternalAccount | null;
  userId: string;
}

/** The admin's one delete question (EP-186): the error stays in the dialog. */
export function DeleteExternalAccountDialog({
  open,
  onOpenChange,
  account,
  userId,
}: DeleteExternalAccountDialogProps) {
  const tDialogs = useTranslations("common.dialogs.users");
  const remove = useDeleteExternalAccount();
  const { reset } = remove;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  if (!account) return null;

  return (
    <DeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tDialogs("deleteExternalAccountTitle")}
      consequence={tDialogs("deleteExternalAccountDescription", {
        provider: account.provider,
        externalId: account.external_id,
      })}
      pending={remove.isPending}
      error={
        remove.error
          ? remove.error instanceof Error && remove.error.message
            ? remove.error.message
            : tDialogs("deleteExternalAccountError")
          : null
      }
      onCancel={() => onOpenChange(false)}
      onConfirm={() =>
        remove.mutate(
          { id: account.id, userId },
          {
            onSuccess: () => {
              toast.success(tDialogs("deleteExternalAccountSuccess"));
              onOpenChange(false);
            },
          }
        )
      }
    />
  );
}
