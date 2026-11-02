"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useCreateExternalAccount } from "@/entities/user/hooks";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

type CreateExternalAccountFormValues = {
  provider: "telegram" | "google" | "github" | "facebook";
  external_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  provider_data?: string;
};

interface CreateExternalAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function CreateExternalAccountDialog({
  open,
  onOpenChange,
  userId,
}: CreateExternalAccountDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("common");
  const tDialogs = useTranslations("common.dialogs.users");

  // Создаем схему валидации с переводами
  const createExternalAccountSchemaWithTranslations = z.object({
    provider: z.enum(["telegram", "google", "github", "facebook"]),
    external_id: z
      .string()
      .min(1, tDialogs("externalIdRequired") as string)
      .max(255, tDialogs("externalIdMaxLength") as string),
    username: z.string().optional().or(z.literal("")),
    display_name: z.string().optional().or(z.literal("")),
    avatar_url: z.string().url(tDialogs("invalidUrl") as string).optional().or(z.literal("")),
    provider_data: z.string().optional().or(z.literal("")),
  });

  const form = useForm<CreateExternalAccountFormValues>({
    resolver: zodResolver(createExternalAccountSchemaWithTranslations),
    defaultValues: {
      provider: "telegram" as const,
      external_id: "",
      username: "",
      display_name: "",
      avatar_url: "",
      provider_data: "",
    },
  });

  const createExternalAccountMutation = useCreateExternalAccount();

  const onSubmit = async (values: CreateExternalAccountFormValues) => {
    setIsSubmitting(true);
    createExternalAccountMutation.mutate(
      {
        user_id: userId,
        provider: values.provider,
        external_id: values.external_id,
        username: values.username || null,
        display_name: values.display_name || null,
        avatar_url: values.avatar_url || null,
        provider_data: values.provider_data || "",
      },
      {
        onSuccess: () => {
          toast.success(tDialogs("externalAccountCreatedSuccess") as string);
          form.reset();
          onOpenChange(false);
          setIsSubmitting(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : (tDialogs("createExternalAccountError") as string));
          setIsSubmitting(false);
        },
      }
    );
  };

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={500}>
        <UI.Dialog.Header>
          <UI.Dialog.Title>{tDialogs("createExternalAccountTitle") as string}</UI.Dialog.Title>
          <UI.Dialog.Description>
            {tDialogs("createExternalAccountDescription") as string}
          </UI.Dialog.Description>
        </UI.Dialog.Header>
          <UI.Field.Root {...form}>
          <Box as="form" onSubmit={form.handleSubmit(onSubmit)} gap={4}>
            <UI.Field.Field
              control={form.control as any}
              name="provider"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tDialogs("providerRequired") as string}</UI.Field.Label>
                  <UI.FormControl.Select.Root onValueChange={field.onChange} defaultValue={field.value}>
                    <UI.Field.Control>
                      <UI.FormControl.Select.Trigger>
                        <UI.FormControl.Select.Value placeholder={tDialogs("selectProviderPlaceholder") as string} />
                      </UI.FormControl.Select.Trigger>
                    </UI.Field.Control>
                    <UI.FormControl.Select.Content>
                      <UI.FormControl.Select.Item value="telegram">Telegram</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="google">Google</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="github">GitHub</UI.FormControl.Select.Item>
                      <UI.FormControl.Select.Item value="facebook">Facebook</UI.FormControl.Select.Item>
                    </UI.FormControl.Select.Content>
                  </UI.FormControl.Select.Root>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="external_id"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>External ID *</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={tDialogs("externalIdPlaceholder") as string}
                      {...field}
                    />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="username"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tDialogs("usernameOptional") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={tDialogs("usernamePlaceholder") as string}
                      {...field}
                    />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="display_name"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tDialogs("displayNameOptional") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={tDialogs("displayNamePlaceholder") as string}
                      {...field}
                    />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="avatar_url"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tDialogs("avatarUrlOptional") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      type="url"
                      placeholder={tDialogs("avatarUrlPlaceholder") as string}
                      {...field}
                    />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field
              control={form.control as any}
              name="provider_data"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{tDialogs("providerDataOptional") as string}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input
                      placeholder={tDialogs("providerDataPlaceholder") as string}
                      {...field}
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
                {t("cancel") as string}
              </UI.Button>
              <UI.Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (tDialogs("creating") as string) : (tDialogs("create") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </Box>
          </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

