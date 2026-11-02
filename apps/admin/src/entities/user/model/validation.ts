import { z } from "zod";

/**
 * Создает схему валидации для создания пользователя с переводами
 */
export const createUserSchema = (t: (key: string) => string) => z.object({
  username: z
    .string()
    .min(3, t("validation.usernameMinLength"))
    .max(50, t("validation.usernameMaxLength"))
    .regex(/^[a-zA-Z0-9_]+$/, t("validation.usernameInvalidChars")),
  email: z
    .string()
    .email(t("validation.emailInvalid"))
    .or(z.literal(""))
    .optional(),
  password: z
    .string()
    .min(8, t("validation.passwordMinLength"))
    .max(100, t("validation.passwordMaxLength")),
});

/**
 * Создает схему валидации для обновления пользователя с переводами
 */
export const updateUserSchema = (t: (key: string) => string) => z.object({
  username: z
    .string()
    .min(3, t("validation.usernameMinLength"))
    .max(50, t("validation.usernameMaxLength"))
    .regex(/^[a-zA-Z0-9_]+$/, t("validation.usernameInvalidChars")),
  email: z
    .string()
    .email(t("validation.emailInvalid"))
    .or(z.literal(""))
    .optional(),
  email_verified: z.boolean(),
});

export type CreateUserFormValues = z.infer<ReturnType<typeof createUserSchema>>;
export type UpdateUserFormValues = z.infer<ReturnType<typeof updateUserSchema>>;

