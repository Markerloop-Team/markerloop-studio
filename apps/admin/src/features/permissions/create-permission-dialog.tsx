"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCreatePermission } from "@/entities/permission/hooks";
import type { CreatePermissionRequest } from "@/entities/permission/model";
import {
  createPermissionSchema,
  type CreatePermissionFormValues,
} from "@/entities/permission/model";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";


interface CreatePermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePermissionDialog({
  open,
  onOpenChange,
}: CreatePermissionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common.dialogs.permissions");
  const tCommon = useTranslations("common");

  const form = useForm<CreatePermissionFormValues>({
    resolver: zodResolver(createPermissionSchema(tCommon)),
    defaultValues: {
      code: "",
      method: undefined,
      path: "",
      description: "",
    },
  });

  const createPermissionMutation = useCreatePermission();

  const onSubmit = async (values: CreatePermissionFormValues) => {
    setIsSubmitting(true);
    createPermissionMutation.mutate(
      {
        code: values.code,
        method: values.method,
        path: values.path,
        description: values.description || undefined,
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
      <UI.Dialog.Content maxWidth={500}>
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("createTitle") as string}</UI.Dialog.Title>
          <UI.Dialog.Description>
            {t("createDescription") as string}
          </UI.Dialog.Description>
        </UI.Dialog.Header>
          <UI.Field.Root {...form}>
          <Box as="form" onSubmit={form.handleSubmit(onSubmit)} gap={4}>
            <UI.Field.Field
              control={form.control as any}
              name="code"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("codeRequired") as string}</UI.Field.Label>
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
                  <UI.Field.Label>{t("methodRequired") as string}</UI.Field.Label>
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
                  <UI.Field.Label>{t("pathRequired") as string}</UI.Field.Label>
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
                {isSubmitting ? (tCommon("creating") as string) : (tCommon("create") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </Box>
          </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

