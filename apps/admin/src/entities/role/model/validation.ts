import { z } from "zod";

/**
 * Создает схему валидации для создания роли с переводами
 */
export const createRoleSchema = (t: (key: string) => string) => z.object({
  name: z
    .string()
    .min(2, t("validation.roleNameMinLength"))
    .max(50, t("validation.roleNameMaxLength"))
    .regex(/^[a-zA-Z0-9_-]+$/, t("validation.roleNameInvalidChars")),
  description: z.string().optional().or(z.literal("")),
});

/**
 * Создает схему валидации для обновления роли с переводами
 */
export const updateRoleSchema = (t: (key: string) => string) => z.object({
  name: z
    .string()
    .min(2, t("validation.roleNameMinLength"))
    .max(50, t("validation.roleNameMaxLength"))
    .regex(/^[a-zA-Z0-9_-]+$/, t("validation.roleNameInvalidChars"))
    .optional(),
  description: z.string().optional().or(z.literal("")),
});

export type CreateRoleFormValues = z.infer<ReturnType<typeof createRoleSchema>>;
export type UpdateRoleFormValues = z.infer<ReturnType<typeof updateRoleSchema>>;

