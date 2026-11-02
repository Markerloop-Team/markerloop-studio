import { NextRequest, NextResponse } from "next/server";
import {
  type MiddlewareContext,
  type MiddlewareLayer,
} from "../types";
import { appUrl, applyLocaleCookieIfNeeded } from "../helpers";
import { PRODUCT_HOME } from "@/shared/config/product-routes";

/**
 * Слой корневого маршрута (SDL-254)
 *
 * У админки нет собственной страницы на `/`: после прежнего переезда с
 * markerloop.com на admin-поддомен корень остался за лендингом,
 * а в app-роутере корневой page.tsx так и не появился — и оба контура
 * отвечали на `/` честным 404.
 *
 * Корень не рендерит ничего сам, а разводит по состоянию сессии:
 * гость видит форму входа, вошедший — продукт. Это сделано слоем, а не
 * корневым page.tsx с redirect(), чтобы вся маршрутизация по признаку
 * «есть токен» жила в одном месте: authCheckLayer уже уводит на /login
 * защищённые пути, и второй, независимый источник той же логики
 * разъезжается при первой же правке.
 *
 * Слой стоит до publicRoutesLayer: тот считает `/` публичным (в
 * PROTECTED_ROUTES его нет) и вернул бы дефолтный response, то есть
 * пропустил бы запрос в роутер — обратно к 404.
 *
 * SDL-607: продукт переехал в корень домена (markerloop.com), а `/` на
 * проде отдаёт лендингу ingress — туда этот слой просто не дотягивается.
 * Он нужен контурам без лендинга (markerloop-test): там `/` по-прежнему
 * приходит в приложение и уводит вошедшего на главную продукта
 * (PRODUCT_HOME). До 24 Sep 2026 он работал и на прежнем прод-хосте
 * admin-поддомена; с тех пор тот отвечает только 301 на апекс (dev-infra
 * !594) и до приложения не доходит.
 */
export const rootRedirectLayer: MiddlewareLayer = (
  request: NextRequest,
  context: MiddlewareContext
) => {
  if (context.pathname !== "/") {
    return null;
  }

  // Токен здесь только признак «сессия есть»: его подлинность проверяет
  // gateway на первом же запросе данных. Протухший токен приведёт на
  // главную продукта, откуда обычный путь разлогина вернёт на /login — то
  // же самое, что происходит с любой другой страницей продукта.
  // Одного refresh-токена достаточно (SDL-613 S6a): access обновит браузер.
  const destination = context.accessToken || context.hasRefresh ? PRODUCT_HOME : "/login";

  const response = NextResponse.redirect(appUrl(request, destination));
  applyLocaleCookieIfNeeded(response, context);
  return response;
};
