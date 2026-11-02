"use client";

import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCreateUser } from "@/entities/user/hooks";
import {
  createUserSchema,
  type CreateUserFormValues,
} from "@/entities/user/model";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { UserFormFields } from "./ui/user-form";


interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common.dialogs.users");
  const tCommon = useTranslations("common");

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema(tCommon)),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  const createUserMutation = useCreateUser();

  const onSubmit = async (values: CreateUserFormValues) => {
    setIsSubmitting(true);
    createUserMutation.mutate(
      {
        username: values.username,
        email: values.email || null,
        password: values.password,
      },
      {
        onSuccess: () => {
          toast.success(t("createdSuccess") as string);
          form.reset();
          onOpenChange(false);
          setIsSubmitting(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : (t("createError") as string));
          setIsSubmitting(false);
        },
      }
    );
  };

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={425}>
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("createTitle") as string}</UI.Dialog.Title>
          <UI.Dialog.Description>
            {t("createDescription") as string}
          </UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Field.Root {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <UserFormFields mode="create" form={form as any} />
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
                {isSubmitting ? (tCommon("creating") as string) : (tCommon("create") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </form>
        </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

