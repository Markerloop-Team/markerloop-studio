import { NextRequest, NextResponse } from "next/server";
import {
  type MiddlewareContext,
  type MiddlewareLayer,
} from "../types";
import { appUrl, applyLocaleCookieIfNeeded } from "../helpers";
import { loginRedirectTarget } from "@/shared/config/product-routes";

/**
 * Слой проверки авторизации
 * Проверяет наличие токена для защищенных роутов
 * Если токена нет - редирект на /login с сохранением redirect параметра
 */
export const authCheckLayer: MiddlewareLayer = (
  request: NextRequest,
  context: MiddlewareContext
) => {
  // Если токен есть - пропускаем дальше (роут защищенный и пользователь авторизован).
  // Только refresh (access-кука истекла раньше) — тоже сессия (SDL-613 S6a):
  // страница открывается, браузер обновит токен через единственную точку
  // (authService.refreshAccessToken под Web Lock). Обновлять здесь, на
  // сервере, нельзя: три вкладки, открытые разом, дали бы три refresh одним
  // и тем же токеном, а второй из них auth-service читает как reuse и гасит
  // всю семью.
  if (context.accessToken || context.hasRefresh) {
    // Возвращаем null, чтобы продолжить к дефолтному response
    // Дефолтный response установит cookie локали
    return null;
  }

  // Если нет токена - перенаправляем на логин с сохранением redirect
  // Используем абсолютный URL для избежания проблем с редиректами
  const loginUrl = appUrl(request, "/login");
  
  // Сохраняем ВЕСЬ адрес — путь И query (SDL-643): раньше сюда шёл только
  // pathname, и `?ws=…&record=…` терялся на логине. Когда redirect не нужен
  // (корень, /login, главная без query), решает loginRedirectTarget.
  const target = loginRedirectTarget(context.pathname, request.nextUrl.search);
  if (target !== null) {
    loginUrl.searchParams.set("redirect", target);
  }

  const response = NextResponse.redirect(loginUrl);
  applyLocaleCookieIfNeeded(response, context);
  return response;
};

