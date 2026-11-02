import { NextRequest } from "next/server";
import {
  type MiddlewareContext,
  type MiddlewareLayer,
} from "../types";

/**
 * Слой обработки локализации
 * Обогащает контекст информацией о локали
 * Не прерывает цепочку (возвращает null)
 */
export const localeLayer: MiddlewareLayer = (
  request: NextRequest,
  context: MiddlewareContext
) => {
  // Локаль уже определена в контексте через detectLocale в prepareContext
  // Этот слой просто обогащает контекст (если нужно)
  // Возвращаем null, чтобы продолжить выполнение следующих слоев
  return null;
};

