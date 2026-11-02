"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAssignRoleToUser } from "@/entities/user/hooks";
import { useRoles } from "@/entities/role/hooks";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

const assignRoleSchema = z.object({
  role_id: z.string().min(1, "Выберите роль"),
});

type AssignRoleFormValues = z.infer<typeof assignRoleSchema>;

interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  assignedRoleIds?: string[];
}

export function AssignRoleDialog({
  open,
  onOpenChange,
  userId,
  assignedRoleIds = [],
}: AssignRoleDialogProps) {
  const t = useTranslations("common");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AssignRoleFormValues>({
    resolver: zodResolver(assignRoleSchema),
    defaultValues: {
      role_id: "",
    },
  });

  const assignRoleMutation = useAssignRoleToUser();
  const { data: rolesResponse, isLoading: rolesLoading } = useRoles();

  // Извлекаем массив ролей из ответа (поддержка нового формата RolesResponse)
  const roles = (() => {
    if (!rolesResponse) return [];
    // Если ответ в формате RolesResponse
    if (typeof rolesResponse === "object" && "roles" in rolesResponse) {
      return (rolesResponse as { roles: Array<{ id: string; name: string; description?: string }> }).roles || [];
    }
    // Если ответ - массив (обратная совместимость)
    if (Array.isArray(rolesResponse)) {
      return rolesResponse;
    }
    return [];
  })();

  // Фильтруем роли, которые еще не назначены
  const availableRoles = roles.filter((role) => !assignedRoleIds.includes(role.id));

  const onSubmit = async (values: AssignRoleFormValues) => {
    setIsSubmitting(true);
    assignRoleMutation.mutate(
      {
        userId,
        roleId: values.role_id,
      },
      {
        onSuccess: () => {
          toast.success(t("dialogs.users.roleAssignedSuccess") as string);
          form.reset();
          onOpenChange(false);
          setIsSubmitting(false);
        },
        onError: (error) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : (t("dialogs.users.assignRoleError") as string);
          toast.error(errorMessage);
          setIsSubmitting(false);
        },
      }
    );
  };

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={500}>
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("dialogs.users.assignRoleTitle") as string}</UI.Dialog.Title>
          <UI.Dialog.Description>
            {t("dialogs.users.assignRoleDescription") as string}
          </UI.Dialog.Description>
        </UI.Dialog.Header>
          <UI.Field.Root {...form}>
          <Box as="form" onSubmit={form.handleSubmit(onSubmit)} gap={4}>
            <UI.Field.Field
              control={form.control as any}
              name="role_id"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("dialogs.users.selectRole") as string}</UI.Field.Label>
                  <UI.FormControl.Select.Root
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={rolesLoading || availableRoles.length === 0}
                  >
                    <UI.Field.Control>
                      <UI.FormControl.Select.Trigger>
                        <UI.FormControl.Select.Value
                          placeholder={
                            rolesLoading
                              ? (t("loading") as string)
                              : availableRoles.length === 0
                              ? (t("dialogs.users.noRolesAvailable") as string)
                              : (t("dialogs.users.selectRolePlaceholder") as string)
                          }
                        />
                      </UI.FormControl.Select.Trigger>
                    </UI.Field.Control>
                    <UI.FormControl.Select.Content>
                      {availableRoles.map((role) => (
                        <UI.FormControl.Select.Item key={role.id} value={role.id}>
                          <Box as="span" direction="row" gap={2} align="center">
                            <UI.Text as="span">{role.name}</UI.Text>
                            {role.description ? (
                              <UI.Text as="span" variant="muted" size="sm">
                                - {role.description}
                              </UI.Text>
                            ) : null}
                          </Box>
                        </UI.FormControl.Select.Item>
                      ))}
                    </UI.FormControl.Select.Content>
                  </UI.FormControl.Select.Root>
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
              <UI.Button type="submit" disabled={isSubmitting || availableRoles.length === 0}>
                {isSubmitting
                  ? (t("creating") as string)
                  : (t("dialogs.users.assignRole") as string)}
              </UI.Button>
            </UI.Dialog.Footer>
          </Box>
          </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

