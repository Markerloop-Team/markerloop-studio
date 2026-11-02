"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { toast } from "sonner";
import {
  sanitizeCode,
  createTranslationCode,
  validateCountryCode,
  validateCityCode,
} from "@/shared/lib/validation/dictionary";

const createTranslationFormSchema = (t: (key: string) => string) => z.object({
  ru: z.string().min(1, t("russianRequired")),
  kk: z.string().optional(),
  en: z.string().optional(),
});

type TranslationFormValues = z.infer<ReturnType<typeof createTranslationFormSchema>>;

interface EditTranslationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "country" | "city";
  code: string; // Например: "KZ" для страны или "ALA.KZ" для города
  translations: {
    ru?: string;
    kk?: string;
    en?: string;
  };
}

export function EditTranslationDialog({
  open,
  onOpenChange,
  type,
  code,
  translations,
}: EditTranslationDialogProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("common");
  const tDialog = useTranslations("common.dialogs.dictionary");
  const [isSaving, setIsSaving] = useState(false);

  // Валидация кода
  const isValidCode = type === "country" 
    ? validateCountryCode(code) 
    : validateCityCode(code);

  // Создаем схему валидации с переводами
  const translationFormSchema = createTranslationFormSchema(t);

  const form = useForm<TranslationFormValues>({
    resolver: zodResolver(translationFormSchema),
    defaultValues: {
      ru: translations.ru || "",
      kk: translations.kk || "",
      en: translations.en || "",
    },
  });

  // Обновляем форму при изменении translations
  useEffect(() => {
    form.reset({
      ru: translations.ru || "",
      kk: translations.kk || "",
      en: translations.en || "",
    });
  }, [translations, form]);

  const onSubmit = async (values: TranslationFormValues) => {
    // Валидация кода перед отправкой
    if (!isValidCode) {
      toast.error(tDialog("invalidCode"));
      return;
    }

    setIsSaving(true);
    try {
      // Санитизируем код и создаем безопасный translationCode
      const sanitizedCode = sanitizeCode(code);
      const translationCode = createTranslationCode(type, sanitizedCode);

      // TODO: Когда backend будет готов, здесь будет вызов API для обновления переводов
      // await dictionaryApi.updateTranslation(translationCode, {
      //   ru: values.ru,
      //   kk: values.kk || null,
      //   en: values.en || null,
      // });

      // Инвалидируем кэш для обновления данных
      queryClient.invalidateQueries({ queryKey: ["countries"] });
      queryClient.invalidateQueries({ queryKey: ["cities"] });

      onOpenChange(false);
      toast.success(tDialog("translationsUpdated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tDialog("updateError")
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isValidCode) {
    return (
      <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
        <UI.Dialog.Content maxWidth={500}>
          <UI.Dialog.Header>
            <UI.Dialog.Title>{tDialog("editTranslationTitle")}</UI.Dialog.Title>
            <UI.Dialog.Description tone="destructive">
              {type === "country" 
                ? tDialog("invalidCountryCode")
                : tDialog("invalidCode")}
            </UI.Dialog.Description>
          </UI.Dialog.Header>
          <UI.Dialog.Footer>
            <UI.Button onClick={() => onOpenChange(false)}>{t("close")}</UI.Button>
          </UI.Dialog.Footer>
        </UI.Dialog.Content>
      </UI.Dialog.Root>
    );
  }

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={500}>
        <UI.Dialog.Header>
          <UI.Dialog.Title>
            {type === "country" 
              ? tDialog("editTranslationTitleCountry")
              : tDialog("editTranslationTitleCity")}
          </UI.Dialog.Title>
          <UI.Dialog.Description>
            {tDialog("editTranslationDescription")}:{" "}
            <UI.Text as="span" variant="mono" size="sm" weight="medium">
              {code}
            </UI.Text>
          </UI.Dialog.Description>
        </UI.Dialog.Header>

        <UI.Field.Root {...form}>
        <Box as="form" onSubmit={form.handleSubmit(onSubmit)} gap={4}>
            <UI.Field.Field
              control={form.control as any}
              name="ru"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("russian")} *</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input {...field} placeholder={t("enterRussian")} />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />

            <UI.Field.Field
              control={form.control as any}
              name="kk"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("kazakh")}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input {...field} placeholder={t("enterKazakh")} />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />

            <UI.Field.Field
              control={form.control as any}
              name="en"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("english")}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input {...field} placeholder={t("enterEnglish")} />
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
                disabled={isSaving}
              >
                {t("cancel")}
              </UI.Button>
              <UI.Button type="submit" disabled={isSaving}>
                {isSaving ? t("saving") : t("save")}
              </UI.Button>
            </UI.Dialog.Footer>
          </Box>
        </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

