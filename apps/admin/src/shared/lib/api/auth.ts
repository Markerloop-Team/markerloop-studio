import { decodeJwt } from "jose";
import { withBasePath } from "@/demo/config";
import { apiClient, workspaceTokens } from "./client";
import { logger } from "../logger";
import { useAuthStore } from "../../store/auth-store";
import { withRefreshLock } from "./refresh-lock";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
}

export interface TelegramLoginData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  /** Seconds the refresh token lives (auth-service SDL-613 S2). */
  refresh_expires_in?: number;
}

/** What auth-service said about a pair's lifetimes; set-tokens turns it into Max-Age. */
export interface TokenLifetimes {
  expires_in?: unknown;
  refresh_expires_in?: unknown;
}

/** The single browser-side caller of the BFF refresh (SDL-613 S6a). */
export const REFRESH_ROUTE = "/api/auth/refresh";
export const LOGOUT_ROUTE = "/api/auth/logout";

// Browser-side ceiling for a fetch made while holding the refresh lock: longer
// than the server's own upstream timeout (AUTH_UPSTREAM_TIMEOUT_MS, 10 s), so
// the BFF answers first, yet a hung request cannot hold every tab's lock.
const LOCKED_FETCH_TIMEOUT_MS = 15_000;

interface JWTPayload {
  exp: number;
  user_id: string;
  username?: string;
  email?: string;
}

function userIdOf(token: string): string | null {
  try {
    return decodeJwt<JWTPayload>(token).user_id ?? null;
  } catch {
    return null;
  }
}

export class AuthService {
  private readonly TOKEN_BUFFER_TIME = 5 * 60 * 1000; // 5 минут в миллисекундах
  private accessTokenCache: string | null = null; // Кэш токена в памяти
  /** The refresh this tab is running; every caller in the tab joins it. */
  private refreshInFlight: Promise<string> | null = null;

  /**
   * Проверяет, истек ли токен
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = decodeJwt<JWTPayload>(token);
      if (!decoded.exp) {
        return true;
      }

      const expiresAt = decoded.exp * 1000; // Конвертируем в миллисекунды
      const now = Date.now();
      const bufferTime = this.TOKEN_BUFFER_TIME;

      return expiresAt - now < bufferTime;
    } catch (error) {
      // Если не удалось декодировать токен, считаем его истекшим
      return true;
    }
  }

  /**
   * Take an access token a refresh produced — re-read from the cookie another
   * tab wrote, or answered by the BFF refresh. If it belongs to another user
   * (a sign-in as someone else in another tab), the workspace tokens of this
   * tab are the old user's — drop them (SDL-613 S6b).
   */
  private adoptCookieToken(token: string, previous: string | null): void {
    if (previous && userIdOf(previous) !== userIdOf(token)) {
      workspaceTokens.clear();
    }
    this.accessTokenCache = token;
  }

  /**
   * Получает access token из памяти или httpOnly cookies через API route
   */
  async getAccessToken(): Promise<string | null> {
    if (typeof window === "undefined") {
      return null;
    }

    // Сначала проверяем кэш в памяти
    if (this.accessTokenCache) {
      return this.accessTokenCache;
    }

    // Если токена нет в памяти, получаем из httpOnly cookies через API route
    const session = await this.readCookieSession();
    if (session?.access) {
      // The memory cache is empty here (checked above), so there is no
      // previous user to compare with.
      this.accessTokenCache = session.access;
      return session.access;
    }

    // No access cookie but a refresh one (it outlives access): the session is
    // alive, it only needs a refresh — through the one point (SDL-613 S6a).
    if (session?.hasRefresh) {
      try {
        return await this.refreshAccessToken(null);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * A token to put into the Authorization header, refreshed first when it is
   * about to expire. The one entry for every hand-rolled fetch (the pages
   * editor's provider) and for apiClient's proactive refresh: none of them may
   * refresh on their own. On a failed refresh it returns the old token and
   * lets the server's 401 decide.
   */
  async ensureAccessToken(): Promise<string | null> {
    const token = this.getAccessTokenSync() ?? (await this.getAccessToken());
    if (token && this.isTokenExpired(token)) {
      return this.refreshAccessToken(token).catch(() => token);
    }
    return token;
  }

  /**
   * The session a freshly loaded page starts with (AuthProvider), or null
   * when there is none.
   *
   * An access token inside the refresh buffer is not "no session": it is
   * refreshed here, through the one refresh point. Dropping it instead sent
   * every page load in the last 5 minutes of a token's life to /login while
   * the refresh cookie still had days to live — a third of the session with a
   * 15-minute access TTL (SDL-613 S7, the test contour since 1 Oct 2026; the
   * e2e suites hit it 10 minutes after their sign-in, SDL-665 pipeline).
   *
   * A refused refresh (401) has already ended the session (endSession clears
   * the cached token) → null. A transient failure (429, 5xx, network) keeps
   * the old token while it is still valid: the next API call tries again.
   */
  async restoreSession(): Promise<string | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    if (!this.isTokenExpired(token)) return token;
    try {
      return await this.refreshAccessToken(token);
    } catch {
      const cached = this.accessTokenCache;
      return cached && this.isTokenUsable(cached) ? cached : null;
    }
  }

  /**
   * The session as the httpOnly cookies hold it: the access token and whether
   * a refresh token exists (its value never reaches the browser). Null when
   * the bridge could not be read.
   */
  private async readCookieSession(): Promise<{ access: string | null; hasRefresh: boolean } | null> {
    try {
      const response = await fetch(withBasePath("/api/auth/get-tokens"), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(LOCKED_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { access_token?: unknown; has_refresh?: unknown };
      return {
        access: typeof data.access_token === "string" && data.access_token ? data.access_token : null,
        hasRefresh: data.has_refresh === true,
      };
    } catch (error) {
      logger.error("Failed to get access token from API:", error);
      return null;
    }
  }

  /** Not expired yet (no buffer): good enough to take over from another tab. */
  private isTokenUsable(token: string): boolean {
    const payload = this.getTokenPayload(token);
    return typeof payload?.exp === "number" && payload.exp * 1000 > Date.now();
  }

  /**
   * Синхронная версия getAccessToken для обратной совместимости
   * Возвращает токен из кэша или null
   */
  getAccessTokenSync(): string | null {
    return this.accessTokenCache;
  }

  /**
   * Устанавливает токены в httpOnly cookies через API route
   * Также сохраняет access token в памяти для быстрого доступа
   */
  async setTokens(
    accessToken: string,
    refreshToken: string,
    lifetimes?: TokenLifetimes
  ): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    // A new sign-in: no workspace token of an earlier session survives (S6b).
    workspaceTokens.clear();
    // Сохраняем access token в памяти для быстрого доступа
    this.accessTokenCache = accessToken;

    try {
      // Устанавливаем httpOnly cookies через API route для безопасности
      const response = await fetch(withBasePath("/api/auth/set-tokens"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          // Cookie Max-Age follows what auth-service reported (SDL-613 S6a).
          expires_in: lifetimes?.expires_in,
          refresh_expires_in: lifetimes?.refresh_expires_in,
        }),
        credentials: "include", // Важно: включаем credentials для установки cookies
      });

      if (!response.ok) {
        throw new Error(`Failed to set tokens: ${response.status}`);
      }
    } catch (error) {
      logger.error("Failed to set httpOnly tokens:", error);
      // Очищаем кэш при ошибке
      this.accessTokenCache = null;
      throw error;
    }
  }

  /**
   * Очищает токены из httpOnly cookies через API route и из памяти
   */
  async clearTokens(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    // Очищаем кэш в памяти
    this.accessTokenCache = null;
    workspaceTokens.clear();

    try {
      // Очищаем httpOnly cookies через API route. Runs under the refresh lock
      // (endSession, the logout fallback): a hung server must not hold every
      // tab's lock, and a timeout is swallowed below like any other failure.
      await fetch(withBasePath("/api/auth/clear-tokens"), {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(LOCKED_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error("Failed to clear httpOnly tokens:", error);
    }
  }

  /**
   * Выполняет вход
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    // API client автоматически извлекает data из ответа { success: true, data: {...} }
    const response = await apiClient.post<AuthResponse>(
      "/v1/auth/login",
      credentials,
      { skipAuth: true }
    );

    // response теперь уже содержит AuthResponse напрямую (access_token, refresh_token и т.д.)
    await this.setTokens(response.access_token, response.refresh_token, response);
    return response;
  }

  /**
   * Выполняет регистрацию
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(
      "/v1/auth/register",
      data,
      { skipAuth: true }
    );

    await this.setTokens(response.access_token, response.refresh_token, response);
    return response;
  }

  /**
   * Получает URL для Google OAuth
   */
  async getGoogleAuthURL(): Promise<string> {
    const response = await apiClient.get<{ url: string }>(
      "/v1/auth/google",
      { skipAuth: true }
    );
    return response.url;
  }

  /**
   * Обрабатывает callback от Google OAuth
   */
  async googleCallback(code: string, state: string): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(
      "/v1/auth/google/callback",
      { code, state },
      { skipAuth: true }
    );

    await this.setTokens(response.access_token, response.refresh_token, response);
    return response;
  }

  /**
   * Авторизация через Telegram Login Widget (legacy)
   */
  async telegramLogin(data: TelegramLoginData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(
      "/v1/auth/telegram/login",
      data,
      { skipAuth: true }
    );

    await this.setTokens(response.access_token, response.refresh_token, response);
    return response;
  }

  /**
   * Создаёт запрос на авторизацию через Telegram бот
   */
  async createTelegramLoginRequest(): Promise<{ token: string; deeplink: string; qr_code?: string }> {
    return apiClient.post("/v1/auth/telegram/login-request", {}, { skipAuth: true });
  }

  /**
   * Запрашивает повторную отправку email верификации
   */
  async requestEmailVerification(email: string): Promise<void> {
    await apiClient.post("/v1/auth/request-email-verification", { email });
  }

  /**
   * Просит выслать ссылку подтверждения заново, БЕЗ входа в систему (SDL-270).
   *
   * `skipAuth` здесь не оптимизация, а суть: вызывающий — человек на
   * /email-verify, у которого сессии нет и быть не может, пока адрес не
   * подтверждён. Шлюз пропускает этот маршрут без JWT (gw routes.go),
   * в отличие от `requestEmailVerification` выше — та живёт за JWT и
   * зовётся из баннера уже вошедшего пользователя.
   *
   * Ответ намеренно неинформативен: бэкенд отдаёт 200 и одно и то же тело
   * для зарегистрированного адреса, выдуманного, уже подтверждённого и
   * для запроса сверх лимита. Различать эти случаи в UI нечем — и не нужно.
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      "/v1/auth/resend-verification",
      { email },
      { skipAuth: true }
    );
  }

  /**
   * Подтверждает email по токену из письма.
   *
   * Публичный вызов: пользователь идёт по ссылке из почты и ещё не вошёл,
   * поэтому `skipAuth` обязателен — иначе клиент попытается подтянуть и
   * обновить токен, которого нет, и запрос уедет с лишним раундтрипом.
   * Шлюз этот маршрут не закрывает JWT-мидлварью (gw routes.go:86).
   *
   * Бэкенд отвечает 200 и на «подтвердили сейчас», и на «уже было
   * подтверждено» — оба случая для страницы успех. Истёкший, неизвестный
   * или уже использованный токен даёт 400: токен одноразовый, из Redis он
   * удаляется сразу после подтверждения.
   */
  async verifyEmailByToken(token: string): Promise<{ message: string }> {
    return apiClient.get<{ message: string }>(
      `/v1/auth/verify-email?token=${encodeURIComponent(token)}`,
      { skipAuth: true }
    );
  }

  /**
   * Просит письмо со ссылкой восстановления пароля (SDL-462/SDL-475).
   *
   * `skipAuth` обязателен по той же причине, что и у `resendVerification`:
   * зовёт человек, который в систему как раз войти и не может. Шлюз
   * пропускает маршрут без JWT (gw-service routes.go:112).
   *
   * Ответ намеренно неинформативен: бэкенд отдаёт 200 и одно и то же тело
   * зарегистрированному адресу, выдуманному и попавшему под лимит
   * (auth-service password_reset.go, RequestPasswordReset). Различать эти
   * случаи в UI нечем — и нельзя: различие сделало бы страницу
   * перечислителем зарегистрированных адресов.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      "/v1/auth/forgot-password",
      { email },
      { skipAuth: true }
    );
  }

  /**
   * Ставит новый пароль по одноразовому токену из письма (SDL-462/SDL-475).
   *
   * 400 — истёкший, неизвестный или уже применённый токен: три случая
   * снаружи неразличимы намеренно (auth_handler.go, ResetPassword). Токен
   * живёт час и гасится до самой смены пароля, поэтому повторная отправка
   * той же формы даёт тот же 400 — это штатный исход, а не сбой.
   */
  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      "/v1/auth/reset-password",
      { token, password },
      { skipAuth: true }
    );
  }

  /**
   * THE refresh point of the browser (SDL-613 S6a). Everything that needs a
   * new access token ends up here: apiClient (proactive and on 401), the pages
   * editor's provider (through `ensureAccessToken`), the session bootstrap
   * (`getAccessToken`). Nothing else may call `/api/auth/refresh`.
   *
   * - inside a tab, concurrent callers share one promise;
   * - across tabs, the work runs under a Web Lock, and the first thing done
   *   under it is to re-read the cookies: when another tab has refreshed
   *   while this one waited, its token is taken instead of refreshing again.
   *   A second refresh with the already-rotated token is exactly what
   *   auth-service reads as reuse and answers by killing the family;
   * - the refresh itself runs on the Next server (`/api/auth/refresh`, BFF):
   *   the refresh token never reaches JS.
   *
   * `stale` is the token the caller found wanting (null: it had none). A
   * cookie token equal to it does not count as "someone refreshed".
   */
  async refreshAccessToken(stale: string | null = this.accessTokenCache): Promise<string> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const run = withRefreshLock(() => this.refreshUnderLock(stale));
    this.refreshInFlight = run;
    try {
      return await run;
    } finally {
      if (this.refreshInFlight === run) this.refreshInFlight = null;
    }
  }

  private async refreshUnderLock(stale: string | null): Promise<string> {
    const session = await this.readCookieSession();
    if (session?.access && session.access !== stale && this.isTokenUsable(session.access)) {
      this.adoptCookieToken(session.access, stale ?? this.accessTokenCache);
      return session.access;
    }

    if (session && !session.hasRefresh) {
      // Same reset as a refused refresh below: without it a stale access
      // cookie keeps the store "authenticated" and /login bounces straight
      // back into the product (SDL-607 review).
      await this.endSession();
      throw new Error("Refresh token not found");
    }

    let response: Response;
    try {
      response = await fetch(withBasePath(REFRESH_ROUTE), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(LOCKED_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error("Refresh request failed:", error);
      throw error;
    }

    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as { access_token?: unknown };
      if (typeof data.access_token === "string" && data.access_token) {
        this.adoptCookieToken(data.access_token, stale ?? this.accessTokenCache);
        return data.access_token;
      }
      throw new Error("Refresh answered without a token");
    }

    if (response.status === 401) {
      // The session is over (the server has already expired the cookies).
      // The in-memory session must go too: left authenticated, the store would
      // let /login (SDL-607) and the product layout each believe the other is
      // right, and a client-side push to /login would bounce back.
      await this.endSession();
    }
    // 429 / 502: transient — the session stays, the next call tries again.
    throw new Error(`Refresh failed: ${response.status}`);
  }

  private async endSession(): Promise<void> {
    await this.clearTokens();
    useAuthStore.getState().setUnauthenticated();
  }

  /**
   * Выполняет выход: семья refresh-токена гасится на auth-service (SDL-613
   * S5), куки истекают — оба шага на сервере Next (`/api/auth/logout`),
   * потому что refresh-токен JS не видит.
   */
  async logout(): Promise<void> {
    this.accessTokenCache = null;
    workspaceTokens.clear();
    if (typeof window === "undefined") {
      return;
    }
    // Under the refresh lock: a refresh already in flight (this tab or
    // another) finishes first, so its Set-Cookie cannot land after the
    // logout and bring the session back.
    await withRefreshLock(async () => {
      this.accessTokenCache = null;
      try {
        const response = await fetch(withBasePath(LOGOUT_ROUTE), {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(LOCKED_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`Logout failed: ${response.status}`);
        }
        // An exchange that started before the logout may have landed while
        // the logout ran: drop the workspace tokens again, still under the lock.
        workspaceTokens.clear();
      } catch (error) {
        // The route expires the cookies whatever auth-service says; if the
        // route itself failed, fall back to plain cookie removal.
        logger.error("Logout error:", error);
        await this.clearTokens();
      }
    });
  }

  /**
   * Проверяет, авторизован ли пользователь (синхронная проверка по кэшу)
   */
  isAuthenticated(): boolean {
    const accessToken = this.getAccessTokenSync();
    if (!accessToken) {
      return false;
    }

    return !this.isTokenExpired(accessToken);
  }

  /**
   * Асинхронная проверка авторизации с получением токена из cookies
   */
  async checkAuthenticated(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return false;
    }

    return !this.isTokenExpired(accessToken);
  }

  /**
   * Получает данные из токена (без валидации подписи)
   */
  getTokenPayload(token: string): JWTPayload | null {
    try {
      return decodeJwt<JWTPayload>(token);
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();


