import { NextRequest, NextResponse } from "next/server";
import {
  type MiddlewareContext,
  type MiddlewareLayer,
} from "@/proxy/types";
import {
  detectLocale,
  needsLocaleCookieUpdate,
  applyLocaleCookieIfNeeded,
} from "@/proxy/helpers";
import { localeLayer } from "@/proxy/layers/locale-layer";
import { rootRedirectLayer } from "@/proxy/layers/root-redirect-layer";
import { sectionGateLayer } from "@/proxy/layers/section-gate-layer";
import { publicRoutesLayer } from "@/proxy/layers/public-routes-layer";
import { authCheckLayer } from "@/proxy/layers/auth-check-layer";
import { originGuardLayer } from "@/proxy/layers/origin-guard-layer";
import { welcomeCheckHeaders } from "@/proxy/layers/welcome-check";
import {
  migrateLegacyCookies,
  readSessionPair,
} from "@/shared/lib/session-cookies";

/**
 * Route handlers that write the session themselves (SDL-613 S6a). The
 * transition copy must not run in front of them: the proxy would set the OLD
 * pair under the `__Host-` names on the same response the handler writes the
 * rotated (or expired) one to, and whichever Set-Cookie the browser applies
 * last wins — a revoked refresh token coming back is the next refresh's reuse.
 * Both handlers read the legacy pair themselves and expire the old names.
 */
const SESSION_WRITING_ROUTES = new Set(["/api/auth/refresh", "/api/auth/logout"]);

/**
 * Public, shared-cacheable route handlers (SDL-696, SDL-778): the same bytes for every
 * visitor, served with `Cache-Control: public`. The cookie transition must not
 * run in front of them — it would put a visitor's session tokens (Set-Cookie)
 * on a response a shared cache may store and hand to the next visitor.
 */
const PUBLIC_CACHEABLE_ROUTES = new Set(["/api/element-catalog", "/api/site-theme-presets"]);

/**
 * Подготавливает контекст для middleware слоев
 */
function prepareContext(request: NextRequest): MiddlewareContext {
  const pathname = request.nextUrl.pathname;
  // `__Host-access_token` in production, the legacy name as a fallback (SDL-680).
  const session = readSessionPair(request.cookies);
  const accessToken = session.access;
  const hasRefresh = Boolean(session.refresh);
  const detectedLocale = detectLocale(request);
  const needsCookieUpdate = needsLocaleCookieUpdate(request, detectedLocale);

  return {
    detectedLocale,
    needsCookieUpdate,
    accessToken,
    hasRefresh,
    pathname,
  };
}

/**
 * Создает дефолтный response с установленной локалью.
 * Полная загрузка раздела workspace получает заголовок проверки «нет
 * пространства → /welcome» (SDL-759): сам запрос к шлюзу и редирект делает
 * корневой серверный layout (app/layout.tsx), прокси остаётся синхронным.
 */
function createDefaultResponse(
  request: NextRequest,
  context: MiddlewareContext
): NextResponse {
  const headers = welcomeCheckHeaders(request, context);
  const response = headers ? NextResponse.next({ request: { headers } }) : NextResponse.next();
  applyLocaleCookieIfNeeded(response, context);
  return response;
}

/**
 * Массив слоев middleware в порядке выполнения
 * Порядок важен: каждый слой может прервать цепочку, вернув NextResponse
 */
const layers: MiddlewareLayer[] = [
  localeLayer,        // 1. Обработка локализации (обогащает контекст)
  rootRedirectLayer,  // 2. Корень: гость → /login, с сессией → /dashboard (SDL-254, SDL-607)
  sectionGateLayer,   // 3. Раздел, выключенный флагом контура, → 404 (SDL-635)
  publicRoutesLayer,  // 4. Проверка публичных роутов
  authCheckLayer,     // 5. Проверка авторизации для защищенных роутов
];

/**
 * Основная функция proxy middleware
 * Выполняет слои по порядку до тех пор, пока один из них не вернет ответ
 */
export function proxy(request: NextRequest): NextResponse {
  // Собственные route handlers (/api/*): только CSRF-проверка и перенос кук,
  // страничные слои (локаль, редиректы, auth) к ним не относятся (SDL-680).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rejected = originGuardLayer(request);
    if (rejected) return rejected;
    const response = NextResponse.next();
    if (
      !SESSION_WRITING_ROUTES.has(request.nextUrl.pathname) &&
      !PUBLIC_CACHEABLE_ROUTES.has(request.nextUrl.pathname)
    ) {
      migrateLegacyCookies(request, response);
    }
    return response;
  }

  // Подготавливаем контекст с базовой информацией
  const context = prepareContext(request);

  // Проходим по слоям в порядке приоритета; первый вернувший ответ прерывает
  // цепочку, иначе — дефолтный response
  let response: NextResponse | null = null;
  for (const layer of layers) {
    response = layer(request, context);
    if (response) break;
  }
  response ??= createDefaultResponse(request, context);

  // Переходный период SDL-680: сессия со старыми именами кук переезжает на
  // `__Host-` на первом же запросе — без разлогина.
  migrateLegacyCookies(request, response);
  return response;
}

export const config = {
  matcher: [
    // The bare root: with a basePath the catch-all below does not match
    // `/<basePath>` itself (no trailing slash), so it is listed explicitly.
    "/",
    // SDL-680: the admin's own route handlers, for originGuardLayer and the
    // cookie transition. /api/v1/* is routed to the gateway by the ingress.
    "/api/:path*",
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};

