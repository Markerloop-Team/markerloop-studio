/**
 * Утилиты для нормализации ответов API
 * Применяет принцип DRY для обработки различных форматов ответов
 */

/**
 * Нормализует ответ API, который может быть массивом или объектом с полем data
 */
export function normalizeArrayResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return response;
  }
  
  if (response && typeof response === "object") {
    // Проверяем стандартный формат { data: T[] }
    if ("data" in response && Array.isArray((response as { data: unknown }).data)) {
      return (response as { data: T[] }).data;
    }
    
    // Проверяем формат { roles: T[] } для UserRolesResponse
    if ("roles" in response && Array.isArray((response as { roles: unknown }).roles)) {
      return (response as { roles: T[] }).roles;
    }
    
    // Проверяем формат { permissions: T[] } для UserPermissionsResponse
    if ("permissions" in response && Array.isArray((response as { permissions: unknown }).permissions)) {
      return (response as { permissions: T[] }).permissions;
    }
    
    // Проверяем формат { countries: T[] } для CountriesResponse
    if ("countries" in response && Array.isArray((response as { countries: unknown }).countries)) {
      return (response as { countries: T[] }).countries;
    }
    
    // Проверяем формат { cities: T[] } для CitiesResponse
    if ("cities" in response && Array.isArray((response as { cities: unknown }).cities)) {
      return (response as { cities: T[] }).cities;
    }
  }
  
  return [];
}

/**
 * Нормализует ответ API для объекта
 */
export function normalizeObjectResponse<T>(response: unknown): T | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  
  // Если есть поле data, извлекаем его
  if ("data" in response && (response as { data: unknown }).data !== null) {
    return (response as { data: T }).data;
  }
  
  // Иначе возвращаем как есть
  return response as T;
}

