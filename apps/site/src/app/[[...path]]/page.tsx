import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { loadPublishedPageData, renderPublishedPage, siteThemeFontPreloads } from "@markerloop/studio/catalog/server";
import { apiBase, fetchGateway, loadSitePage, routePath } from "@/lib/site-api";
import { siteApiOrigin } from "@/lib/csp";
import { requestHost } from "@/lib/request-host";

// Every request reads the live snapshot: a statically rendered or cached page
// would keep showing the previous publication after "Update publication".
// Together with `cache: "no-store"` in loadSitePage (test/ssr.test.ts guards both).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const result = await loadSitePage(await requestHost(), routePath(path));
  if (result.kind !== "page") return {};
  return {
    title: result.page.title || undefined,
    // The snapshot's validator, for whoever debugs what a visitor was served.
    other: result.page.etag ? { "pages-snapshot-etag": result.page.etag } : undefined,
  };
}

export default async function SitePage({ params }: Props) {
  const { path } = await params;
  const result = await loadSitePage(await requestHost(), routePath(path));
  if (result.kind !== "page") notFound();
  // DataView reads the anonymous data plane (SDL-679): the first page here, on
  // the server, in-cluster through the gateway (`PAGES_PUBLIC_API_URL`) and
  // through the shared cache — page views must not spend the plane's per-IP
  // limit; tab switches in the browser against `https://api.<base>/v1`, the
  // CSP's `connect-src`. No base domain → the engine's frame, as before.
  // `fetchGateway`: one retry of a read that died on a reset socket during a
  // gateway rollout (SDL-732) — else the list is the stub for the cache's 10 s.
  const publicApi = siteApiOrigin(process.env.SITES_BASE_DOMAIN);
  const data = publicApi
    ? await loadPublishedPageData(result.page.body, { apiBase: apiBase(), browserApiBase: `${publicApi}/v1`, fetch: fetchGateway })
    : undefined;
  // Components (SDL-722): every `Ref` draws the Component frozen by the
  // publication, with the page's parameter values; one not in the map draws
  // the engine's placeholder.
  // The site theme (SDL-773): the published theme becomes one `<style>` with
  // the kit's variables on `:root`; none published → no `<style>`, as before.
  // The theme's fonts (SDL-774): the sheet's @font-face point at this site's
  // own /fonts (CSP `font-src 'self'`); the two faces the first paint needs —
  // heading 700, body 400 — are preloaded, React puts the <link>s in <head>.
  // `crossOrigin`: fonts are fetched in CORS mode, a preload without it is wasted.
  for (const font of siteThemeFontPreloads(result.page.theme)) preload(font.href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return renderPublishedPage(result.page.body, result.page.files, data, result.page.blocks, result.page.theme);
}
