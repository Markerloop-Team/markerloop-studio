import { NextRequest, NextResponse } from "next/server";
import {
  type MiddlewareContext,
  type MiddlewareLayer,
} from "../types";
import { applyLocaleCookieIfNeeded } from "../helpers";
import {
  PRODUCT_SECTIONS,
  SIGNED_IN_STANDALONE_PATHS,
} from "@/shared/config/product-routes";

/**
 * Список защищенных роутов, которые требуют авторизации
 * Все остальные пути по умолчанию публичные (catch-all роуты)
 *
 * SDL-607: продукт переехал из `/admin/*` в корень домена, поэтому
 * защищается каждый раздел `app/(product)` по отдельности — список берётся
 * из PRODUCT_SECTIONS, а smoke:sidebar-active сверяет его с каталогом.
 * `/admin` здесь не нужен: next.config.ts отвечает на него 308 раньше, чем
 * запрос доходит до proxy. `/api` тоже не нужен — matcher proxy исключает
 * `api` целиком, до этого слоя такие запросы не доходят.
 */
export const PROTECTED_ROUTES: readonly string[] = [
  ...PRODUCT_SECTIONS.map((section) => `/${section}`),
  // SDL-693: signed-in pages outside the product shell (/oauth/consent).
  ...SIGNED_IN_STANDALONE_PATHS,
];

/**
 * Проверяет, является ли роут публичным
 */
function isPublicRoute(pathname: string): boolean {
  // Нормализуем pathname (убираем trailing slash)
  const normalizedPathname = pathname.endsWith("/") && pathname !== "/" 
    ? pathname.slice(0, -1) 
    : pathname;
  
  // Если путь начинается с защищенного роута - требует авторизации (не публичный)
  const isProtected = PROTECTED_ROUTES.some((route) => 
    normalizedPathname === route || normalizedPathname.startsWith(`${route}/`)
  );
  
  // Все пути, которые не защищенные - публичные (включая catch-all роуты)
  return !isProtected;
}

/**
 * Слой проверки публичных роутов
 * Если роут публичный - возвращаем дефолтный response (пропускаем authCheckLayer)
 * Если роут защищенный - продолжаем к следующему слою (authCheckLayer)
 */
export const publicRoutesLayer: MiddlewareLayer = (
  request: NextRequest,
  context: MiddlewareContext
) => {
  // Если роут публичный - возвращаем дефолтный response сразу
  // Это предотвращает выполнение authCheckLayer для публичных роутов
  if (isPublicRoute(context.pathname)) {
    const response = NextResponse.next();
    applyLocaleCookieIfNeeded(response, context);
    return response;
  }

  // Если роут защищенный - продолжаем к следующему слою (authCheckLayer)
  // Возвращаем null, чтобы продолжить выполнение
  return null;
};

