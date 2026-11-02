import { useQuery } from "@tanstack/react-query";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { Language } from "@/entities/dictionary/model";

/**
 * Хук для получения списка языков из справочника
 * Использует текущий язык интерфейса для получения переводов названий языков
 */
export function useLanguages(currentLanguage: string = "ru-RU") {
  return useQuery({
    queryKey: ["languages", currentLanguage],
    queryFn: () => dictionaryApi.getLanguages(currentLanguage),
    staleTime: 1000 * 60 * 60, // Кэш на 1 час
    refetchOnWindowFocus: false,
  });
}

/**
 * Получить коды языков из списка языков
 */
export function getLanguageCodes(languages: Language[] | undefined): string[] {
  if (!languages || !Array.isArray(languages)) {
    return ["ru-RU", "kk-KZ", "en-US"]; // Fallback к дефолтным языкам
  }
  return languages.map((lang) => lang.code);
}

/**
 * Получить базовый код языка из полного кода (ru-RU -> ru)
 */
export function getBaseLanguageCode(fullCode: string): string {
  return fullCode.split("-")[0] || fullCode;
}

