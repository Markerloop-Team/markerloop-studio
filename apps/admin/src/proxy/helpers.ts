import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale, type Locale } from "@/i18n";
import { DEMO_MODE } from "@/demo/config";
import type { MiddlewareContext } from "./types";
import {
  readSessionCookie,
  sessionCookieName,
  sessionCookieOptions,
} from "@/shared/lib/session-cookies";

/**
 * Парсит заголовок Accept-Language и возвращает предпочтительную локаль
 * @param acceptLanguage - Значение заголовка Accept-Language (например, "en-US,en;q=0.9,ru;q=0.8")
 * @returns Локаль из списка доступных или null
 */
export function getLocaleFromAcceptLanguage(
  acceptLanguage: string | null
): Locale | null {
  if (!acceptLanguage) {
    return null;
  }

  // Парсим Accept-Language заголовок
  // Формат: "en-US,en;q=0.9,ru;q=0.8,kk;q=0.7"
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [locale, qValue] = lang.trim().split(";");
      const quality = qValue ? parseFloat(qValue.replace("q=", "")) : 1.0;
      return {
        locale: locale.toLowerCase().trim(),
        quality,
      };
    })
    .sort((a, b) => b.quality - a.quality); // Сортируем по качеству (q-value)

  // Ищем первую подходящую локаль из нашего списка
  for (const { locale } of languages) {
    // Проверяем точное совпадение (например, "ru", "en", "kk")
    if (locales.includes(locale as Locale)) {
      return locale as Locale;
    }

    // Проверяем по первым двум символам (например, "ru-RU" -> "ru")
    const baseLocale = locale.split("-")[0];
    if (locales.includes(baseLocale as Locale)) {
      return baseLocale as Locale;
    }
  }

  return null;
}

/**
 * Получает локаль из cookie
 */
export function getLocaleFromCookie(request: NextRequest): Locale | null {
  // `__Host-NEXT_LOCALE` in production, the legacy name as a fallback (SDL-680).
  const cookieLocale = readSessionCookie(request.cookies, "locale");
  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }
  return null;
}

/**
 * Определяет локаль в следующем порядке приоритета:
 * 1. Cookie (если пользователь уже выбирал язык)
 * 2. Accept-Language заголовок
 * 3. defaultLocale
 */
export function detectLocale(request: NextRequest): Locale {
  // 1. Проверяем cookie (приоритет пользовательского выбора)
  const cookieLocale = getLocaleFromCookie(request);
  if (cookieLocale) {
    return cookieLocale;
  }

  // 2. Парсим Accept-Language заголовок
  // Showcase: the demo content is English, so the browser language is not followed.
  const acceptLanguage = DEMO_MODE ? null : request.headers.get("accept-language");
  const acceptLanguageLocale = getLocaleFromAcceptLanguage(acceptLanguage);
  if (acceptLanguageLocale) {
    return acceptLanguageLocale;
  }

  // 3. Fallback на дефолтную локаль
  return defaultLocale;
}

/**
 * Проверяет, нужно ли обновить cookie с локалью
 */
export function needsLocaleCookieUpdate(
  request: NextRequest,
  detectedLocale: Locale
): boolean {
  const existingCookie = request.cookies.get(sessionCookieName("locale"));
  return !existingCookie || existingCookie.value !== detectedLocale;
}

/**
 * Устанавливает cookie с локалью в response
 */
export function setLocaleCookie(
  response: NextResponse,
  locale: Locale
): void {
  response.cookies.set(sessionCookieName("locale"), locale, sessionCookieOptions("locale"));
}

/**
 * Устанавливает cookie с локалью в response, если это необходимо
 * Упрощает код, убирая необходимость проверять needsCookieUpdate вручную
 */
export function applyLocaleCookieIfNeeded(
  response: NextResponse,
  needsUpdate: boolean,
  locale: Locale
): void;
export function applyLocaleCookieIfNeeded(
  response: NextResponse,
  context: MiddlewareContext
): void;
export function applyLocaleCookieIfNeeded(
  response: NextResponse,
  needsUpdateOrContext: boolean | MiddlewareContext,
  locale?: Locale
): void {
  if (typeof needsUpdateOrContext === "object") {
    // Передан контекст целиком
    const context = needsUpdateOrContext;
    if (context.needsCookieUpdate) {
      setLocaleCookie(response, context.detectedLocale);
    }
  } else {
    // Переданы отдельные параметры
    if (needsUpdateOrContext && locale) {
      setLocaleCookie(response, locale);
    }
  }
}


/**
 * An app-relative URL for a proxy redirect/rewrite that keeps the deployment's
 * basePath: `new URL("/login", request.url)` would drop it (the showcase runs
 * under `/markerloop-studio`). `target` may carry a query string.
 */
export function appUrl(request: NextRequest, target: string): URL {
  const url = request.nextUrl.clone();
  const [pathname, search = ""] = target.split("?");
  url.pathname = pathname || "/";
  url.search = search ? `?${search}` : "";
  return url;
}
