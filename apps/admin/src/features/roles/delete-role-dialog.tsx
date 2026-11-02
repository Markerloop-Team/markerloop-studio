"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDeleteRole } from "@/entities/role/hooks";
import type { Role } from "@/entities/role/model";
import { useTranslations } from "@/shared/hooks";
import { DeleteDialog } from "@/shared/components/delete-dialog";

interface DeleteRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

/** The admin's one delete question (EP-186): the error stays in the dialog. */
export function DeleteRoleDialog({ open, onOpenChange, role }: DeleteRoleDialogProps) {
  const tDialogs = useTranslations("common.dialogs.roles");
  const remove = useDeleteRole();
  const { reset } = remove;

  // A reopened dialog does not carry the previous attempt's error.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  if (!role) return null;

  return (
    <DeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tDialogs("deleteRoleTitle")}
      consequence={tDialogs("deleteRoleDescription", { name: role.name })}
      pending={remove.isPending}
      error={
        remove.error
          ? remove.error instanceof Error && remove.error.message
            ? remove.error.message
            : tDialogs("deleteRoleError")
          : null
      }
      onCancel={() => onOpenChange(false)}
      onConfirm={() =>
        remove.mutate(role.id, {
          onSuccess: () => {
            toast.success(tDialogs("deleteRoleSuccess"));
            onOpenChange(false);
          },
        })
      }
    />
  );
}
