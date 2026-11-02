"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useUpdatePermission } from "@/entities/permission/hooks";
import type { Permission, UpdatePermissionRequest } from "@/entities/permission/model";
import {
  updatePermissionSchema,
  type UpdatePermissionFormValues,
} from "@/entities/permission/model";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";


interface EditPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission: Permission | null;
}

export function EditPermissionDialog({
  open,
  onOpenChange,
  permission,
}: EditPermissionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common.dialogs.permissions");
  const tCommon = useTranslations("common");

  const form = useForm<UpdatePermissionFormValues>({
    resolver: zodResolver(updatePermissionSchema(tCommon)),
    defaultValues: {
      code: "",
      method: "GET",
      path: "",
      description: "",
    },
  });

  // Обновляем форму при изменении разрешения
  useEffect(() => {
    if (permission) {
      form.reset({
        code: permission.code,
        method: permission.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
        path: permission.path,
        description: permission.description || "",
      });
    }
  }, [permission, form]);

  const updatePermissionMutation = useUpdatePermission();

  const onSubmit = async (values: UpdatePermissionFormValues) => {
    if (!permission) return;

    setIsSubmitting(true);
    updatePermissionMutation.mutate(
      {
        id: permission.id,
        data: {
          code: values.code,
          method: values.method,
          path: values.path,
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

  if (!permission) return null;

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={500}>
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
              name="code"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tCommon("code") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={tCommon("code") as string}
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
              name="method"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tCommon("method") as string}</UI.Field.Label>
                  <UI.FormControl.Select.Root onValueChange={field.onChange} defaultValue={field.value}>
                    <UI.Field.Control>
                      <UI.FormControl.Select.Trigger>
                        <UI.FormControl.Select.Value placeholder={tCommon("selectMethod") as string} />
                      </UI.FormControl.Select.Trigger>
                    </UI.Field.Control>
                    <UI.FormControl.Select.Content>
                      <UI.FormControl.Select.Item value="GET">GET</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="POST">POST</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="PUT">PUT</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="DELETE">DELETE</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="PATCH">PATCH</UI.FormControl.Select.Item>
                    </UI.FormControl.Select.Content>
                  </UI.FormControl.Select.Root>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="path"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tCommon("path") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={t("pathPlaceholder") as string}
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

