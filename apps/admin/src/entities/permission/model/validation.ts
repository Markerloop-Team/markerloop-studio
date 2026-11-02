import { z } from "zod";

/**
 * Создает схему валидации для создания разрешения с переводами
 */
export const createPermissionSchema = (t: (key: string) => string) => z.object({
  code: z
    .string()
    .min(3, t("validation.codeMinLength"))
    .max(100, t("validation.codeMaxLength"))
    .regex(/^[a-zA-Z0-9:_-]+$/, t("validation.codeInvalidChars")),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"], {
    message: t("validation.methodRequired"),
  }),
  path: z
    .string()
    .min(1, t("validation.pathRequired"))
    .max(255, t("validation.pathMaxLength")),
  description: z.string().optional().or(z.literal("")),
});

/**
 * Создает схему валидации для обновления разрешения с переводами
 */
export const updatePermissionSchema = (t: (key: string) => string) => z.object({
  code: z
    .string()
    .min(3, t("validation.codeMinLength"))
    .max(100, t("validation.codeMaxLength"))
    .regex(/^[a-zA-Z0-9:_-]+$/, t("validation.codeInvalidChars"))
    .optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"], {
    message: t("validation.methodRequired"),
  }).optional(),
  path: z
    .string()
    .min(1, t("validation.pathRequired"))
    .max(255, t("validation.pathMaxLength"))
    .optional(),
  description: z.string().optional().or(z.literal("")),
});

export type CreatePermissionFormValues = z.infer<ReturnType<typeof createPermissionSchema>>;
export type UpdatePermissionFormValues = z.infer<ReturnType<typeof updatePermissionSchema>>;

