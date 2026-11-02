"use client";

import { useLocale as useNextIntlLocale } from "next-intl";
import { useCallback, useContext } from "react";
import { locales, defaultLocale, type Locale } from "@/i18n";
import { LocaleContext as LocaleContextType } from "@/shared/contexts/locale-context";
import {
  hostPrefixEnabled,
  legacySessionCookieName,
  sessionCookieName,
} from "@/shared/lib/session-cookies";

const LOCALE_STORAGE_KEY = "locale";

/**
 * Устанавливает cookie с локалью
 */
function setLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;

  // Устанавливаем cookie на 1 год
  const maxAge = 60 * 60 * 24 * 365; // 1 год в секундах
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  // `__Host-NEXT_LOCALE` in production: Secure, path=/, no Domain (SDL-680).
  const secure = hostPrefixEnabled();
  document.cookie = `${sessionCookieName("locale")}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
  if (secure) {
    // Drop the pre-SDL-680 name so the fallback reader cannot resurrect it.
    document.cookie = `${legacySessionCookieName("locale")}=; path=/; max-age=0; SameSite=Lax; Secure`;
  }
}

/**
 * Хук для работы с локалью
 * Позволяет получить текущую локаль и переключить её без перезагрузки страницы
 */
export function useLocale() {
  const currentLocale = (useNextIntlLocale() as Locale) || defaultLocale;
  
  // Используем контекст, если он доступен
  const localeContext = useContext(LocaleContextType);

  /**
   * Переключение локали без перезагрузки страницы
   * Сохраняет выбор в localStorage и cookie, обновляет состояние через контекст
   */
  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (!locales.includes(newLocale)) {
        console.warn(`Invalid locale: ${newLocale}`);
        return;
      }

      // Сохраняем в localStorage (для совместимости)
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
        // Сохраняем в cookie (для серверного определения)
        setLocaleCookie(newLocale);
      }

      // Обновляем через контекст, если доступен
      if (localeContext?.setLocale) {
        localeContext.setLocale(newLocale);
      } else {
        // Fallback: если контекст не доступен, перезагружаем страницу
        console.warn("LocaleContext not available, reloading page");
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }
    },
    [localeContext]
  );

  /**
   * Получить сохраненную локаль из localStorage
   */
  const getStoredLocale = useCallback((): Locale | null => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored && locales.includes(stored as Locale)
      ? (stored as Locale)
      : null;
  }, []);

  return {
    locale: currentLocale,
    setLocale,
    getStoredLocale,
    locales: locales as readonly Locale[],
    defaultLocale,
  };
}

