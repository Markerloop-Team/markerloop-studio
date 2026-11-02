"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDeleteUser } from "@/entities/user/hooks";
import type { User } from "@/entities/user/model";
import { useTranslations } from "@/shared/hooks";
import { DeleteDialog } from "@/shared/components/delete-dialog";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

/** The admin's one delete question (EP-186): the error stays in the dialog. */
export function DeleteUserDialog({ open, onOpenChange, user }: DeleteUserDialogProps) {
  const tDialogs = useTranslations("common.dialogs.users");
  const remove = useDeleteUser();
  const { reset } = remove;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  if (!user) return null;

  return (
    <DeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tDialogs("deleteUserTitle")}
      consequence={tDialogs("deleteUserDescription", { username: user.username })}
      pending={remove.isPending}
      error={
        remove.error
          ? remove.error instanceof Error && remove.error.message
            ? remove.error.message
            : tDialogs("deleteUserError")
          : null
      }
      onCancel={() => onOpenChange(false)}
      onConfirm={() =>
        remove.mutate(user.id, {
          onSuccess: () => {
            toast.success(tDialogs("deleteUserSuccess"));
            onOpenChange(false);
          },
        })
      }
    />
  );
}
