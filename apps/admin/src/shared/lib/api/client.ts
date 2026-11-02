import { authService } from "./auth";
import { limitRefusalMessage, limitRefusalOf } from "./limit-refusal";
import { defaultLocale, locales, type Locale } from "@/i18n";
import { logger } from "../logger";
import { toApiError } from "../error-handler";
import type { ApiResponseWithMeta, Meta } from "./types";
import { getApiBaseUrl } from "./base-url";
import { legacySessionCookieName, sessionCookieName } from "../session-cookies";
import { WorkspaceTokenStore, type WorkspaceTokenResponse } from "./workspace-token";

type RequestConfig = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  cache?: RequestCache;
  next?: { revalidate?: number };
  skipAuth?: boolean; // Пропустить добавление токена (для login, refresh)
  /**
   * Не разворачивать стандартный конверт {success, data, meta}: вернуть
   * {data, meta} как есть. Нужен списочным endpoint'ам с пагинацией —
   * обычный путь выбрасывает meta вместе с конвертом.
   */
  keepEnvelope?: boolean;
  /**
   * The workspace this call works in (SDL-613 S6b). Set → the call carries
   * this tab's workspace token for it (`wsid` = this id) instead of the
   * session token, and a 401 gets exactly one retry with a freshly
   * exchanged token. pages and files clients set it on every call.
   */
  workspaceId?: string;
};

/**
 * Получает текущую локаль из localStorage или cookie
 * Используется для отправки заголовка Accept-Language в API запросах
 */
function getCurrentLocale(): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  // Сначала проверяем localStorage
  const storedLocale = localStorage.getItem("locale");
  if (storedLocale && locales.includes(storedLocale as Locale)) {
    return storedLocale as Locale;
  }

  // Затем проверяем cookie
  // `__Host-NEXT_LOCALE` first, the legacy name as a fallback (SDL-680).
  const jar = new Map(
    document.cookie.split(";").map((cookie) => {
      const [name, value] = cookie.trim().split("=");
      return [name, value] as const;
    })
  );
  for (const name of [sessionCookieName("locale"), legacySessionCookieName("locale")]) {
    const value = jar.get(name);
    if (value && locales.includes(value as Locale)) {
      return value as Locale;
    }
  }

  // Возвращаем локаль по умолчанию
  return defaultLocale;
}

type ApiError = {
  message: string;
  status: number;
  data?: unknown;
};

/**
 * Читает тело ошибочного ответа РОВНО ОДИН раз.
 *
 * `response.json()` потребляет поток. Прежний вариант ловил его отказ и
 * звал `response.text()` вторым чтением — на non-JSON теле (HTML-страница
 * 404/502 от шлюза или nginx) это давало `TypeError: body stream already
 * read`, который улетал наружу вместо `ApiClientError`. Ошибка теряла
 * `status`, и вызывающий код видел не «шлюз не проксирует маршрут», а
 * внутреннее сообщение браузера (прецедент: вкладка API коллекции,
 * пайплайн 2754311864).
 *
 * Форма результата прежняя: JSON-тело → разобранный объект, любое
 * другое → строка. `isGatewayRouteMissing` рассчитывает именно на это.
 */
export async function readErrorBody(response: Response): Promise<unknown> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * 404 пришёл от САМОГО ШЛЮЗА, а не от сервиса за ним.
 *
 * Сервис всегда отвечает своим конвертом (`{success:false, error:…}`) — тело
 * разбирается в объект. Gin на незарегистрированный маршрут отвечает голым
 * текстом `404 page not found`, а ingress или прокси впереди — HTML-страницей;
 * `readErrorBody` в обоих случаях оставляет строку. Код, который не отличает
 * одно от другого, принимает «шлюз не знает такого маршрута» за «объект уже
 * удалён».
 */
export function isGatewayRouteMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { status?: unknown }).status !== 404) return false;
  const data = (error as { data?: unknown }).data;
  return typeof data === "string" || data === undefined;
}

/**
 * The gateway's `X-Request-Id` of a failed call (go-sdk `requestid`, SDL-87),
 * or undefined when the error never had a response (network) or the response
 * carried none. For "tell support this id" lines: never invent one.
 */
export function requestIdOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const id = (error as { requestId?: unknown }).requestId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function responseRequestId(response: Response): string | undefined {
  return response.headers.get("x-request-id") || undefined;
}

class ApiClientError extends Error {
  status: number;
  data?: unknown;
  requestId?: string;

  constructor(message: string, status: number, data?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.data = data;
    this.requestId = requestId;
  }
}

export class ApiClient {
  private baseURL: string;

  constructor(baseURL?: string) {
    // Базовый адрес — один на всё приложение, см. ./base-url.
    this.baseURL = (baseURL ?? getApiBaseUrl()).replace(/\/+$/, "");
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {},
    retryCount = 0
  ): Promise<T> {
    const {
      method = "GET",
      headers = {},
      body,
      cache = "no-store",
      next,
      skipAuth = false,
      keepEnvelope = false,
      workspaceId,
    } = config;

    const url = `${this.baseURL}${endpoint}`;

    const requestHeaders: HeadersInit = {
      "Content-Type": "application/json",
      ...headers,
    };

    // Добавляем заголовок Accept-Language на основе текущей локали пользователя
    // Если заголовок уже указан в headers, используем его, иначе устанавливаем текущую локаль
    if (!headers["Accept-Language"] && !headers["accept-language"]) {
      const currentLocale = getCurrentLocale();
      requestHeaders["Accept-Language"] = currentLocale;
    }

    // Добавляем токен в заголовки (если не skipAuth). Proactive refresh —
    // внутри ensureAccessToken, через единственную точку (SDL-613 S6a).
    let sentToken: string | null = null;
    const scopeWs = !skipAuth && typeof document !== "undefined" ? workspaceId || null : null;
    if (scopeWs) {
      // The workspace token of this tab. A refused exchange (not a member →
      // 403, collections down → 503) is the call's answer: no fallback to the
      // session token, the gateway would refuse it once S9 is on anyway.
      sentToken = await workspaceTokens.get(scopeWs);
      requestHeaders.Authorization = `Bearer ${sentToken}`;
    } else if (!skipAuth && typeof document !== "undefined") {
      try {
        sentToken = await authService.ensureAccessToken();
      } catch {
        // Игнорируем ошибку, продолжаем без токена
      }
      if (sentToken) {
        requestHeaders.Authorization = `Bearer ${sentToken}`;
      }
    }

    // Нормализуем URL: убираем двойные слеши
    let normalizedUrl = url.replace(/([^:]\/)\/+/g, "$1");
    
    // Для POST/PUT/DELETE на коллекции без ID, убеждаемся что нет trailing slash
    if ((method === "POST" || method === "PUT" || method === "DELETE") && 
        !endpoint.match(/\/v1\/users\/[^/]+/)) {
      // Убираем trailing slash для коллекций (например, /api/v1/users/)
      normalizedUrl = normalizedUrl.replace(/\/+$/, "");
    }


    const requestConfig: RequestInit = {
      method,
      headers: requestHeaders,
      cache,
      ...(next && { next }),
    };

    if (body) {
      requestConfig.body = JSON.stringify(body);
    }

    try {
      // Используем обычный redirect: "follow" (по умолчанию)
      // Браузер автоматически обработает редирект, а мы обработаем результат
      let response = await fetch(normalizedUrl, requestConfig);
      
      // Логируем начальный ответ для отладки
      if (method === "POST" && endpoint.includes("/users")) {
        const allHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          allHeaders[key] = value;
        });
        
        logger.debug(`[API Client] Response:`, {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          redirected: response.redirected,
          type: response.type,
          ok: response.ok,
          headers: allHeaders,
        });
      }
      
      // Если произошел автоматический редирект браузером на URL с trailing slash
      // и получили 404, логируем для отладки (но не повторяем запрос, так как проблема должна быть исправлена на сервере)
      if (response.redirected && response.url.endsWith("/") && !normalizedUrl.endsWith("/") && response.status === 404) {
        logger.warn(`[API Client] Server redirected to URL with trailing slash but returned 404. This should be fixed on server side.`);
      }
      
      // Если получили opaqueredirect или статус 0, это проблема с CORS
      if (response.type === "opaqueredirect" || response.status === 0) {
        logger.error(`[API Client] CORS or redirect issue:`, {
          type: response.type,
          status: response.status,
          url: normalizedUrl,
          method,
        });
        throw new ApiClientError(
          "CORS error or redirect blocked. Check server CORS configuration.",
          0
        );
      }
      
      // Обработка явных редиректов (307, 308)
      if (response.status === 307 || response.status === 308) {
        const location = response.headers.get("location") || response.headers.get("Location");
        
        // Логируем все заголовки для отладки
        if (method === "POST" && endpoint.includes("/users")) {
          const allHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            allHeaders[key] = value;
          });
          logger.debug(`[API Client] Redirect ${response.status} headers:`, allHeaders);
        }
        
        if (location) {
          // Преобразуем относительный URL в абсолютный, если нужно
          let redirectUrl: string;
          if (location.startsWith("http")) {
            redirectUrl = location;
          } else if (normalizedUrl.startsWith("http")) {
            // Если исходный URL абсолютный, используем его как базу
            const baseUrl = new URL(normalizedUrl);
            redirectUrl = new URL(location, baseUrl).href;
          } else {
            // Если оба относительные, используем window.location.origin
            redirectUrl = new URL(location, window.location.origin).href;
          }
          
          // Убираем trailing slash из redirect URL для POST/PUT/DELETE запросов
          if ((method === "POST" || method === "PUT" || method === "DELETE") && redirectUrl.endsWith("/")) {
            redirectUrl = redirectUrl.slice(0, -1);
            logger.debug(`[API Client] Removed trailing slash from redirect URL:`, redirectUrl);
          }
          
          logger.debug(`[API Client] Handling redirect ${response.status}:`, {
            from: normalizedUrl,
            to: redirectUrl,
            location,
            method,
            hasBody: !!requestConfig.body,
          });
          
          // Повторяем запрос на новый URL с теми же параметрами
          const redirectConfig: RequestInit = {
            method,
            headers: requestHeaders,
            cache,
            body: requestConfig.body, // Сохраняем тело запроса
            ...(next && { next }),
          };
          
          response = await fetch(redirectUrl, redirectConfig);
          
          // Логируем результат редиректа
          logger.debug(`[API Client] Redirect result:`, {
            status: response.status,
            statusText: response.statusText,
            url: redirectUrl,
            ok: response.ok,
          });
        } else {
          logger.error(`[API Client] Redirect ${response.status} without location header`);
          throw new ApiClientError(`Redirect ${response.status} without location header`, response.status);
        }
      }

      // Workspace token refused as revoked/expired (401): drop it, exchange
      // again, retry ONCE. The exchange is a session call, so an expired
      // session is refreshed there, through the single refresh point. A
      // member who was removed gets 403 not_a_member from the exchange — that
      // is the answer, no second retry. 403 is NOT retried: the gateway gives
      // one FORBIDDEN for a foreign wsid and for a role refusal alike, and a
      // foreign wsid cannot happen here (the map is keyed by the workspace),
      // so a retry on 403 would only burn an exchange.
      if (scopeWs && response.status === 401 && retryCount === 0) {
        workspaceTokens.invalidate(scopeWs, sentToken);
        return this.request<T>(endpoint, config, retryCount + 1);
      }

      // Обработка 401 - пытаемся обновить токен (reactive refresh)
      if (response.status === 401 && !skipAuth && !scopeWs && retryCount === 0) {
        try {
          await authService.refreshAccessToken(sentToken);
          // Повторяем запрос с новым токеном
          return this.request<T>(endpoint, config, retryCount + 1);
        } catch {
          // Refresh не удался, выбрасываем ошибку
          throw new ApiClientError("Unauthorized", 401);
        }
      }

      if (!response.ok) {
        const errorData = await readErrorBody(response);

        const rawMessage =
          (errorData as { message?: string })?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        // A limit refusal (409/507 quota_exceeded, 413 record_too_large)
        // carries the policy sentence where the promise is in force (SDL-666).
        const refusal = limitRefusalOf({ status: response.status, data: errorData });
        const errorMessage = refusal ? limitRefusalMessage(refusal, rawMessage) : rawMessage;

        throw new ApiClientError(errorMessage, response.status, errorData, responseRequestId(response));
      }

      // Handle empty responses. The header alone does not say there is a
      // body: the gateway answers 204 with `Content-Type: application/json`
      // and nothing after it (DELETE /v1/users/my, SDL-743), and
      // `response.json()` on that throws. 204/205 never carry a body; any
      // other status is read as text once and an empty one is empty.
      const contentType = response.headers.get("content-type");
      if (
        response.status === 204 ||
        response.status === 205 ||
        !contentType ||
        !contentType.includes("application/json")
      ) {
        return {} as T;
      }

      const raw = await response.text();
      if (raw.trim() === "") {
        return {} as T;
      }
      const jsonResponse = JSON.parse(raw);

      // Проверяем стандартный формат ответа API: { success: boolean, data: T, message?: string }
      if (jsonResponse && typeof jsonResponse === "object" && "success" in jsonResponse) {
        // Если success: false, выбрасываем ошибку
        if (jsonResponse.success === false) {
          const errorMessage =
            jsonResponse.message ||
            (jsonResponse.data as { message?: string })?.message ||
            "Request failed";
          throw new ApiClientError(errorMessage, response.status, jsonResponse.data, responseRequestId(response));
        }

        // keepEnvelope: списочные endpoint'ы с пагинацией получают
        // {data, meta} без разворачивания — meta иначе теряется.
        if (keepEnvelope) {
          return {
            data: "data" in jsonResponse ? jsonResponse.data : undefined,
            meta: "meta" in jsonResponse ? jsonResponse.meta : undefined,
          } as T;
        }

        // Если success: true, возвращаем data (если она есть), иначе весь jsonResponse
        if ("data" in jsonResponse && jsonResponse.data !== undefined && jsonResponse.data !== null) {
          return jsonResponse.data as T;
        }

        // Если data отсутствует, но success: true, возвращаем весь jsonResponse
        return jsonResponse as T;
      }

      // Если формат нестандартный, возвращаем как есть
      if (keepEnvelope) {
        return { data: jsonResponse, meta: undefined } as T;
      }
      return jsonResponse as T;
    } catch (error) {
      if (error instanceof ApiClientError) {
        // Преобразуем ApiClientError в ApiError для единообразной обработки
        throw toApiError(error);
      }

      // Преобразуем любую другую ошибку в ApiError
      throw toApiError(error);
    }
  }

  async get<T>(endpoint: string, config?: Omit<RequestConfig, "method" | "body">): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "GET" });
  }

  /**
   * Получить ответ с метаданными пагинации
   * Возвращает объект с data и meta
   */
  async getWithMeta<T>(
    endpoint: string,
    config?: Omit<RequestConfig, "method" | "body">
  ): Promise<ApiResponseWithMeta<T>> {
    const response = await this.request<{ data: T; meta?: Meta }>(endpoint, {
      ...config,
      method: "GET",
    });

    // Если ответ уже содержит data и meta, возвращаем как есть
    if (response && typeof response === "object" && "data" in response) {
      return {
        data: response.data,
        meta: "meta" in response ? response.meta : undefined,
      };
    }

    // Иначе оборачиваем ответ в data
    return {
      data: response as T,
      meta: undefined,
    };
  }

  /**
   * GET, сохраняющий конверт бэка: {success, message, data,
   * meta:{page,limit,total,total_pages}} → {data, meta}. В отличие от
   * getWithMeta (который получает уже развёрнутый data и потому meta
   * никогда не видит), этот метод не разворачивает конверт вовсе.
   * Существующие методы не трогает.
   */
  async getEnvelope<T>(
    endpoint: string,
    config?: Omit<RequestConfig, "method" | "body" | "keepEnvelope">
  ): Promise<ApiResponseWithMeta<T>> {
    return this.request<ApiResponseWithMeta<T>>(endpoint, {
      ...config,
      method: "GET",
      keepEnvelope: true,
    });
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    config?: Omit<RequestConfig, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: "POST",
      body,
      skipAuth: config?.skipAuth,
    });
  }

  async put<T>(
    endpoint: string,
    body?: unknown,
    config?: Omit<RequestConfig, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "PUT", body });
  }

  async delete<T>(
    endpoint: string,
    config?: Omit<RequestConfig, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "DELETE" });
  }

  async patch<T>(
    endpoint: string,
    body?: unknown,
    config?: Omit<RequestConfig, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "PATCH", body });
  }
}

export const apiClient = new ApiClient();

/**
 * This tab's workspace tokens (SDL-613 S6b). The exchange is a plain session
 * call (no `workspaceId`): session token in, workspace token out.
 */
export const workspaceTokens = new WorkspaceTokenStore((workspaceId) =>
  apiClient.post<WorkspaceTokenResponse>("/v1/auth/token/workspace", { workspace_id: workspaceId })
);

