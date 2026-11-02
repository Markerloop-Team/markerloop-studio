import { useTranslations } from "./use-translations";
import { handleApiError as handleApiErrorBase } from "../lib/error-handler";

/**
 * Хук для обработки ошибок API с поддержкой переводов
 * @returns Функция для обработки ошибок API
 */
export function useHandleApiError() {
  const t = useTranslations("common");

  return (error: unknown, defaultMessage?: string) => {
    handleApiErrorBase(error, defaultMessage, t);
  };
}

