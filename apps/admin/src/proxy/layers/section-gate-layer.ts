import { NextRequest, NextResponse } from "next/server";
import { type MiddlewareContext, type MiddlewareLayer } from "../types";
import { appUrl, applyLocaleCookieIfNeeded } from "../helpers";
import { readProductFeatures, type ProductFeatures } from "@/shared/config/product-features";

/**
 * Where a switched-off section is rewritten to. A leading underscore makes the
 * folder private to the app router, so no route can ever exist here — the
 * request always lands on the product's own not-found page, with HTTP 404.
 */
export const SECTION_DISABLED_PATH = "/_section-disabled";

/** Product sections behind a runtime flag, by their URL prefix. */
const GATED_SECTIONS: Array<{ prefix: string; feature: keyof ProductFeatures }> = [
  { prefix: "/pages", feature: "pages" },
  // EP-157: the Components section lives on pages-service too.
  { prefix: "/components", feature: "pages" },
  // EP-187: the site theme editor — the theme lives in pages-service as well.
  { prefix: "/theme", feature: "pages" },
];

/** The flag that gates this path, or null when the path is not gated. */
export function gatedFeature(pathname: string): keyof ProductFeatures | null {
  const hit = GATED_SECTIONS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit.feature : null;
}

/**
 * Section gate (SDL-635): a section switched off on this contour does not
 * exist here — /pages and everything under it answer the product's 404.
 *
 * Why a proxy layer and not only notFound() in (product)/pages/layout.tsx:
 * that layout sits under ProductShell, which on the server renders a loading
 * skeleton until the client restores the session, so its children never reach
 * the HTML render and the 404 thrown there travels only in the RSC stream —
 * the response goes out as 200 with a not-found inside. Measured on a
 * production build: 200 from the layout alone, 404 with this layer. The
 * layout keeps its notFound() as the second line for anything that reaches it.
 *
 * Runs before publicRoutes/authCheck, so a guest gets the same 404 rather than
 * a login screen that leads to one. The flag is read from the pod env on every
 * request (Next 16 runs the proxy on the Node runtime), so flipping it in the
 * contour's overlay takes effect on the next pod start, with no rebuild.
 */
export const sectionGateLayer: MiddlewareLayer = (request: NextRequest, context: MiddlewareContext) => {
  const feature = gatedFeature(context.pathname);
  if (feature === null || readProductFeatures()[feature]) {
    return null;
  }

  const response = NextResponse.rewrite(appUrl(request, SECTION_DISABLED_PATH));
  applyLocaleCookieIfNeeded(response, context);
  return response;
};
