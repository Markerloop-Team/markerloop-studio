"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useUpdateUser } from "@/entities/user/hooks";
import type { User } from "@/entities/user/model";
import {
  updateUserSchema,
  type UpdateUserFormValues,
} from "@/entities/user/model";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { UserFormFields } from "./ui/user-form";


interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function EditUserDialog({ open, onOpenChange, user }: EditUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common.dialogs.users");
  const tCommon = useTranslations("common");

  const form = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema(tCommon)),
    defaultValues: {
      username: "",
      email: "",
      email_verified: false,
    },
  });

  // Обновляем форму при изменении пользователя
  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username,
        email: user.email || "",
        email_verified: user.email_verified,
      });
    }
  }, [user, form]);

  const updateUserMutation = useUpdateUser();

  const onSubmit = async (values: UpdateUserFormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    updateUserMutation.mutate(
      {
        id: user.id,
        data: {
          username: values.username,
          email: values.email || null,
          email_verified: values.email_verified,
        },
      },
      {
        onSuccess: () => {
          toast.success(t("updatedSuccess") as string);
          onOpenChange(false);
          setIsSubmitting(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : (t("updateError") as string));
          setIsSubmitting(false);
        },
      }
    );
  };

  if (!user) return null;

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
            <UserFormFields mode="edit" form={form as any} />
            <UI.Dialog.Footer marginTop={4}>
              <UI.Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {tCommon("cancel") as string}
              </UI.Button>
              <UI.Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (tCommon("saving") as string) : (tCommon("save") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </form>
          </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

