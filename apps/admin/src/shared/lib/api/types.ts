/**
 * Типы для работы с API ответами и метаданными пагинации
 */

/**
 * Метаданные пагинации
 */
export interface Meta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/**
 * Ответ API с метаданными
 */
export interface ApiResponseWithMeta<T, M = Meta> {
  data: T;
  meta?: M;
}

/**
 * Стандартный формат ответа API
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: Meta;
}

