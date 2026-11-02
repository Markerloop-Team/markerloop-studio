import { toast } from "sonner";
import {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ServerError,
  NetworkError,
} from "./errors";
import { authService } from "./api/auth";

/**
 * Тип функции перевода
 */
type TranslateFunction = (key: string) => string;

/**
 * Дефолтные сообщения об ошибках (fallback на английский)
 */
const defaultErrorMessages: Record<string, string> = {
  sessionExpired: "Session expired. Please log in again.",
  accessDenied: "You do not have access to this resource.",
  resourceNotFound: "Resource not found.",
  dataConflict: "Data conflict. The resource may already exist.",
  serverError: "Server error. Please try again later.",
  networkError: "Network error. Check your internet connection.",
  errorOccurred: "An error occurred",
  unknownErrorOccurred: "An unknown error occurred",
};

/**
 * Получает переведенное сообщение об ошибке или использует дефолтное
 */
function getErrorMessage(
  key: string,
  t?: TranslateFunction
): string {
  if (t) {
    try {
      return t(`errors.${key}`) || defaultErrorMessages[key] || key;
    } catch {
      return defaultErrorMessages[key] || key;
    }
  }
  return defaultErrorMessages[key] || key;
}

/**
 * Обрабатывает ошибку API и показывает соответствующее уведомление
 * @param error - Ошибка для обработки
 * @param defaultMessage - Сообщение по умолчанию
 * @param t - Функция перевода (опционально)
 */
export function handleApiError(
  error: unknown,
  defaultMessage?: string,
  t?: TranslateFunction
): void {
  // Если это уже ApiError, используем его
  if (error instanceof ApiError) {
    handleSpecificError(error, t);
    return;
  }

  // Если это Error с полем status (например, из ApiClient)
  if (error instanceof Error && "status" in error) {
    const status = (error as Error & { status: number }).status;
    const message =
      error.message ||
      defaultMessage ||
      getErrorMessage("errorOccurred", t);

    switch (status) {
      case 401:
        handleSpecificError(new UnauthorizedError(message), t);
        break;
      case 403:
        handleSpecificError(new ForbiddenError(message), t);
        break;
      case 404:
        handleSpecificError(new NotFoundError(message), t);
        break;
      case 400:
        handleSpecificError(new ValidationError(message), t);
        break;
      case 409:
        handleSpecificError(new ConflictError(message), t);
        break;
      case 500:
      case 502:
      case 503:
        handleSpecificError(new ServerError(message), t);
        break;
      default:
        toast.error(message);
    }
    return;
  }

  // Обычная ошибка
  const message =
    error instanceof Error
      ? error.message
      : defaultMessage || getErrorMessage("unknownErrorOccurred", t);
  toast.error(message);
}

/**
 * Обрабатывает специфичные типы ошибок
 */
function handleSpecificError(
  error: ApiError,
  t?: TranslateFunction
): void {
  switch (error.status) {
    case 401:
      // Разлогинить пользователя при 401
      toast.error(getErrorMessage("sessionExpired", t));
      // Можно добавить редирект на страницу логина
      // window.location.href = '/login';
      break;

    case 403:
      toast.error(getErrorMessage("accessDenied", t));
      break;

    case 404:
      toast.error(getErrorMessage("resourceNotFound", t));
      break;

    case 400:
      // Для ошибок валидации показываем более детальное сообщение
      const validationMessage =
        (error.data as { message?: string })?.message || error.message;
      toast.error(validationMessage);
      break;

    case 409:
      toast.error(getErrorMessage("dataConflict", t));
      break;

    case 500:
    case 502:
    case 503:
      toast.error(getErrorMessage("serverError", t));
      break;

    case 0:
      // Network error
      toast.error(getErrorMessage("networkError", t));
      break;

    default:
      toast.error(
        error.message || getErrorMessage("errorOccurred", t)
      );
  }
}

/**
 * Преобразует ошибку в ApiError
 * @param error - Ошибка для преобразования
 * @param t - Функция перевода (опционально)
 */
export function toApiError(
  error: unknown,
  t?: TranslateFunction
): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error && "status" in error) {
    const status = (error as Error & { status: number }).status;
    const message =
      error.message || getErrorMessage("errorOccurred", t);
    // Тело ошибки (конверт бэка {success:false, message, error, data})
    // обязано доехать до вызывающего кода: например, 409
    // record_version_conflict несёт актуальную запись в data.
    const data =
      "data" in error ? (error as Error & { data?: unknown }).data : undefined;
    // X-Request-Id ответа — тоже: экран ошибки показывает его для поддержки.
    const requestId =
      "requestId" in error ? (error as Error & { requestId?: unknown }).requestId : undefined;

    const mapped = ((): ApiError => {
      switch (status) {
        case 401:
          return new UnauthorizedError(message, data);
        case 403:
          return new ForbiddenError(message, data);
        case 404:
          return new NotFoundError(message, data);
        case 400:
          return new ValidationError(message, data);
        case 409:
          return new ConflictError(message, data);
        case 500:
        case 502:
        case 503:
          return new ServerError(message, data);
        default:
          return new ApiError(message, status, undefined, data);
      }
    })();
    if (typeof requestId === "string" && requestId) mapped.requestId = requestId;
    return mapped;
  }

  return new NetworkError(
    error instanceof Error
      ? error.message
      : getErrorMessage("unknownErrorOccurred", t)
  );
}

