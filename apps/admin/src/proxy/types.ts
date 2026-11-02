import { NextRequest, NextResponse } from "next/server";
import { type Locale } from "@/i18n";

/**
 * Контекст для middleware слоев
 */
export interface MiddlewareContext {
  /**
   * Определенная локаль (из cookie или Accept-Language)
   */
  detectedLocale: Locale;
  
  /**
   * Нужно ли обновить cookie с локалью
   */
  needsCookieUpdate: boolean;
  
  /**
   * Access token из cookie (если есть)
   */
  accessToken: string | undefined;

  /**
   * Есть ли refresh-токен (SDL-613 S6a). Access-кука живёт меньше refresh:
   * без access, но с refresh сессия жива — её обновит браузер через
   * единственную точку refresh, а не страница входа.
   */
  hasRefresh: boolean;
  
  /**
   * Текущий pathname
   */
  pathname: string;
}

/**
 * Тип функции слоя middleware
 * Возвращает NextResponse если нужно прервать цепочку, или null для продолжения
 */
export type MiddlewareLayer = (
  request: NextRequest,
  context: MiddlewareContext
) => NextResponse | null;

