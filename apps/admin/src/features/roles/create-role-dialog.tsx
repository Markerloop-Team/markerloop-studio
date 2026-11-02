"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCreateRole } from "@/entities/role/hooks";
import type { CreateRoleRequest } from "@/entities/role/model";
import {
  createRoleSchema,
  type CreateRoleFormValues,
} from "@/entities/role/model";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";


interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRoleDialog({ open, onOpenChange }: CreateRoleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common.dialogs.roles");
  const tCommon = useTranslations("common");

  const form = useForm<CreateRoleFormValues>({
    resolver: zodResolver(createRoleSchema(tCommon)),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createRoleMutation = useCreateRole();

  const onSubmit = async (values: CreateRoleFormValues) => {
    setIsSubmitting(true);
    createRoleMutation.mutate(
      {
        name: values.name,
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
      <UI.Dialog.Content maxWidth={425}>
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
              name="name"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("nameRequired") as string}</UI.Field.Label>
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
                {isSubmitting ? (tCommon("creating") as string) : (tCommon("create") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </Box>
          </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

