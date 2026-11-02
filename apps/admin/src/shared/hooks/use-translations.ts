import { useTranslations as useNextIntlTranslations } from "next-intl";

/**
 * Типизированная функция перевода, которая всегда возвращает string
 */
type TypedTFunction = (key: string, values?: Record<string, string | number | Date>) => string;

/**
 * Хук для использования переводов в клиентских компонентах
 * Обертка над useTranslations из next-intl с типизацией
 * Всегда возвращает string, убирая необходимость в `as string` кастах
 */
export function useTranslations(namespace?: string): TypedTFunction {
  const t = useNextIntlTranslations(namespace);
  
  // Обертка, которая всегда возвращает string
  return ((key: string, values?: Record<string, string | number | Date>) => {
    const result = t(key, values);
    // Если результат не строка, преобразуем в строку
    return typeof result === "string" ? result : String(result);
  }) as TypedTFunction;
}

