"use client";

import { UseFormReturn } from "react-hook-form";
import { useTranslations } from "@/shared/hooks";
import type {
  CreateUserFormValues,
  UpdateUserFormValues,
} from "@/entities/user/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

type UserFormValues = CreateUserFormValues | UpdateUserFormValues;

interface UserFormFieldsProps {
  mode: "create" | "edit";
  form: UseFormReturn<UserFormValues, any, UserFormValues>;
}

export function UserFormFields({ mode, form }: UserFormFieldsProps) {
  const t = useTranslations("common.dialogs.users");
  const tCommon = useTranslations("common");

  return (
    <Box gap={4}>
      <UI.Field.Field
        control={form.control as any}
        name="username"
        render={({ field }) => (
          <UI.Field.Item>
            <UI.Field.Label>{tCommon("username") as string}</UI.Field.Label>
            <UI.Field.Control>
              <UI.FormControl.Input
                placeholder={tCommon("username") as string}
                {...field}
                autoComplete="username"
              />
            </UI.Field.Control>
            <UI.Field.Message />
          </UI.Field.Item>
        )}
      />
      <UI.Field.Field
        control={form.control as any}
        name="email"
        render={({ field }) => (
          <UI.Field.Item>
            <UI.Field.Label>
              {mode === "create"
                ? (t("emailOptional") as string)
                : (tCommon("email") as string)}
            </UI.Field.Label>
            <UI.Field.Control>
              <UI.FormControl.Input
                type="email"
                placeholder="user@example.com"
                {...field}
                autoComplete="email"
              />
            </UI.Field.Control>
            <UI.Field.Message />
          </UI.Field.Item>
        )}
      />
      {mode === "create" && (
        <UI.Field.Field
          control={form.control as any}
          name="password"
          render={({ field }) => (
            <UI.Field.Item>
              <UI.Field.Label>{t("password") as string}</UI.Field.Label>
              <UI.Field.Control>
                <UI.FormControl.Input
                  type="password"
                  placeholder={t("passwordPlaceholder") as string}
                  {...field}
                  autoComplete="new-password"
                />
              </UI.Field.Control>
              <UI.Field.Message />
            </UI.Field.Item>
          )}
        />
      )}
      {mode === "edit" && (
        <UI.Field.Field
          control={form.control as any}
          name="email_verified"
          render={({ field }) => (
            <UI.Field.Item layout="row" align="start" gap={3}>
              <UI.Field.Control>
                <UI.FormControl.Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </UI.Field.Control>
              <Box gap={1}>
                <UI.Field.Label>{t("emailVerified") as string}</UI.Field.Label>
              </Box>
            </UI.Field.Item>
          )}
        />
      )}
    </Box>
  );
}

