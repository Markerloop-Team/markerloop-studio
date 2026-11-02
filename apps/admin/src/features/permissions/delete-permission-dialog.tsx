"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDeletePermission } from "@/entities/permission/hooks";
import type { Permission } from "@/entities/permission/model";
import { useTranslations } from "@/shared/hooks";
import { DeleteDialog } from "@/shared/components/delete-dialog";

interface DeletePermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission: Permission | null;
}

/** The admin's one delete question (EP-186): the error stays in the dialog. */
export function DeletePermissionDialog({
  open,
  onOpenChange,
  permission,
}: DeletePermissionDialogProps) {
  const tDialogs = useTranslations("common.dialogs.permissions");
  const remove = useDeletePermission();
  const { reset } = remove;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  if (!permission) return null;

  return (
    <DeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tDialogs("deletePermissionTitle")}
      consequence={tDialogs("deletePermissionDescription", {
        code: permission.code,
        method: permission.method,
        path: permission.path,
      })}
      pending={remove.isPending}
      error={
        remove.error
          ? remove.error instanceof Error && remove.error.message
            ? remove.error.message
            : tDialogs("deletePermissionError")
          : null
      }
      onCancel={() => onOpenChange(false)}
      onConfirm={() =>
        remove.mutate(permission.id, {
          onSuccess: () => {
            toast.success(tDialogs("deletePermissionSuccess"));
            onOpenChange(false);
          },
        })
      }
    />
  );
}
