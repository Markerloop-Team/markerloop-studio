"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useUpdateRole } from "@/entities/role/hooks";
import type { Role, UpdateRoleRequest } from "@/entities/role/model";
import {
  updateRoleSchema,
  type UpdateRoleFormValues,
} from "@/entities/role/model";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";


interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

export function EditRoleDialog({ open, onOpenChange, role }: EditRoleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common.dialogs.roles");
  const tCommon = useTranslations("common");

  const form = useForm<UpdateRoleFormValues>({
    resolver: zodResolver(updateRoleSchema(tCommon)),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Обновляем форму при изменении роли
  useEffect(() => {
    if (role) {
      form.reset({
        name: role.name,
        description: role.description || "",
      });
    }
  }, [role, form]);

  const updateRoleMutation = useUpdateRole();

  const onSubmit = async (values: UpdateRoleFormValues) => {
    if (!role) return;

    setIsSubmitting(true);
    updateRoleMutation.mutate(
      {
        id: role.id,
        data: {
          name: values.name,
          description: values.description || undefined,
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

  if (!role) return null;

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
          <Box as="form" onSubmit={form.handleSubmit(onSubmit)} gap={4}>
            <UI.Field.Field
              control={form.control as any}
              name="name"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tCommon("name") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={tCommon("name") as string}
                      {...field}
                      autoComplete="off"
                    />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="description"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tCommon("description") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Textarea
                      placeholder={t("descriptionPlaceholder") as string}
                      {...field}
                      rows={3}
                    />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Dialog.Footer>
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
          </Box>
          </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

