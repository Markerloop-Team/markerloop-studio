/**
 * Утилиты для валидации и санитизации данных справочников
 */

/**
 * Валидация кода страны
 * Код страны должен быть 2 заглавными буквами (ISO 3166-1 alpha-2)
 */
export function validateCountryCode(code: string): boolean {
  const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
  return COUNTRY_CODE_REGEX.test(code);
}

/**
 * Валидация кода города
 * Код города может содержать буквы, цифры и точки
 */
export function validateCityCode(code: string): boolean {
  const CITY_CODE_REGEX = /^[A-Za-z0-9.]+$/;
  return CITY_CODE_REGEX.test(code);
}

/**
 * Санитизация кода для использования в translationCode
 * Удаляет все символы, кроме букв, цифр и точек
 */
export function sanitizeCode(code: string): string {
  return code.replace(/[^A-Za-z0-9.]/g, "");
}

/**
 * Валидация translationCode
 * Формат: country.XX или city.XXX.XX
 */
export function validateTranslationCode(code: string): boolean {
  const TRANSLATION_CODE_REGEX = /^(country|city)\.[A-Za-z0-9.]+$/;
  return TRANSLATION_CODE_REGEX.test(code);
}

/**
 * Создание безопасного translationCode
 */
export function createTranslationCode(
  type: "country" | "city",
  code: string
): string {
  const sanitized = sanitizeCode(code);
  return type === "country" ? `country.${sanitized}` : `city.${sanitized}`;
}

