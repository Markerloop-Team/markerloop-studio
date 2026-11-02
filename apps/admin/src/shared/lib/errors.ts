/**
 * Базовый класс для ошибок API
 */
export class ApiError extends Error {
  /** The gateway's X-Request-Id of the failed call, when the response carried one. */
  requestId?: string;

  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Ошибка авторизации (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", data?: unknown) {
    super(message, 401, "UNAUTHORIZED", data);
    this.name = "UnauthorizedError";
  }
}

/**
 * Ошибка доступа (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", data?: unknown) {
    super(message, 403, "FORBIDDEN", data);
    this.name = "ForbiddenError";
  }
}

/**
 * Ошибка не найдено (404)
 */
export class NotFoundError extends ApiError {
  constructor(message = "Not Found", data?: unknown) {
    super(message, 404, "NOT_FOUND", data);
    this.name = "NotFoundError";
  }
}

/**
 * Ошибка валидации (400)
 */
export class ValidationError extends ApiError {
  constructor(message = "Validation Error", data?: unknown) {
    super(message, 400, "VALIDATION_ERROR", data);
    this.name = "ValidationError";
  }
}

/**
 * Ошибка конфликта (409)
 */
export class ConflictError extends ApiError {
  constructor(message = "Conflict", data?: unknown) {
    super(message, 409, "CONFLICT", data);
    this.name = "ConflictError";
  }
}

/**
 * Ошибка сервера (500)
 */
export class ServerError extends ApiError {
  constructor(message = "Internal Server Error", data?: unknown) {
    super(message, 500, "SERVER_ERROR", data);
    this.name = "ServerError";
  }
}

/**
 * Ошибка сети
 */
export class NetworkError extends ApiError {
  constructor(message = "Network Error", data?: unknown) {
    super(message, 0, "NETWORK_ERROR", data);
    this.name = "NetworkError";
  }
}

