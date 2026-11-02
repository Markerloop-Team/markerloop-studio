// `renderPublishedPage` (SDL-678): the server-side entry of the workspace
// site (SDL-685). No "use client" and no client-only imports: the engine core
// (validation, migration) runs here, and the page itself is drawn by
// `PublishedPage`, a client module — from a server component it is a client
// reference that receives plain, serializable props (the schema and a
// file id → URL map), never a function or the registry.
//
// Never editable: the output carries no `data-sauna-node-id`. `DataView` reads
// through the engine's public provider when the host passes `data`
// (`loadPublishedPageData`, SDL-679); without it, it is the engine's frame.

import * as React from "react";
import { DataViewPropsSchema, migrateSaunaSchema, publicDataViewKey, publicDataViewRequest, validateSaunaSchema } from "@markerloop/engine";
import type { SaunaBlockMap, SaunaSchema } from "@markerloop/engine";
import { loadPublicDataViewPage, type PublicDataViewPage } from "@markerloop/engine/providers/data";
import { PublishedPage, type PublishedPageData, type PublishedPageFiles, type PublishedPageProps } from "./published-page";
import { SiteThemeStyle, siteThemeCss } from "../site-theme";

export type { PublishedPageData, PublishedPageFiles } from "./published-page";

/**
 * A server-side cache of the DataViews' first pages (SDL-679 review): every
 * page view would otherwise hit `/data` from the one IP of the site's pod,
 * and collections-service limits that plane per workspace + IP
 * (`DATA_RATE_LIMIT_IP_PER_MIN`, 60) — past it every visitor gets the stub.
 * One entry per (base, list key): a success lives `okTtlMs`, an
 * "unavailable" `failTtlMs`; concurrent asks for the same list share ONE
 * request while it is in flight; at most `maxEntries` lists, the least
 * recently used one goes first.
 */
export type PublicDataCache = {
  get(key: string, load: () => Promise<PublicDataViewPage>): Promise<PublicDataViewPage>;
  readonly size: number;
};

export type PublicDataCacheOptions = {
  okTtlMs?: number;
  failTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
};

export function createPublicDataCache(options: PublicDataCacheOptions = {}): PublicDataCache {
  const okTtl = options.okTtlMs ?? 30_000;
  const failTtl = options.failTtlMs ?? 10_000;
  const max = Math.max(1, options.maxEntries ?? 500);
  const now = options.now ?? Date.now;
  // Map keeps insertion order: re-inserting on a hit makes the first key the least recently used.
  const entries = new Map<string, { page: Promise<PublicDataViewPage>; expiresAt: number }>();
  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) {
        entries.delete(key);
        entries.set(key, hit);
        return hit.page;
      }
      // In flight: never expires until it settles, so a burst shares it.
      const entry = { page: load(), expiresAt: Number.POSITIVE_INFINITY };
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > max) entries.delete(entries.keys().next().value as string);
      void entry.page.then(
        (page) => {
          entry.expiresAt = now() + (page.status === "list" ? okTtl : failTtl);
        },
        () => {
          // loadPublicDataViewPage never rejects; a custom loader that does is not cached.
          if (entries.get(key) === entry) entries.delete(key);
        }
      );
      return entry.page;
    },
    get size() {
      return entries.size;
    },
  };
}

/** The process-wide cache the site uses unless a caller hands its own (tests do). */
const SHARED_PUBLIC_DATA_CACHE = createPublicDataCache();

export type LoadPublishedPageDataOptions = {
  /**
   * Where the SERVER reads, with the version prefix — in-cluster
   * `http://gateway-service/api/v1` (the site's `PAGES_PUBLIC_API_URL`), so
   * page views do not go out through the public ingress.
   */
  apiBase: string;
  /**
   * Where the BROWSER re-reads on a tab switch, with the version prefix —
   * `https://api.<base>/v1`, the CSP's `connect-src` origin. Absent → tabs
   * other than the first draw the stub (nothing to re-read from).
   */
  browserApiBase?: string;
  fetch?: typeof fetch;
  /** Per DataView request; the site's server must not hang on a slow upstream. */
  timeoutMs?: number;
  cache?: PublicDataCache;
};

/**
 * The first page of every DataView on the page (its first tab), read the way
 * an anonymous visitor reads — the server half of the public provider
 * (SDL-679), through the cache above. Never throws for data: a list the
 * visitor may not see is `unavailable` and draws the stub.
 */
export async function loadPublishedPageData(body: unknown, options: LoadPublishedPageDataOptions): Promise<PublishedPageData> {
  const out: PublishedPageData = { apiBase: options.browserApiBase, pages: {} };
  const validated = validateSaunaSchema(body);
  if (!validated.ok) return out;
  const schema = migrateSaunaSchema(validated.value);
  const cache = options.cache ?? SHARED_PUBLIC_DATA_CACHE;
  const wanted = new Map<string, Promise<PublicDataViewPage>>();
  for (const node of Object.values(schema.nodes)) {
    if (node?.type !== "DataView") continue;
    const parsed = DataViewPropsSchema.safeParse(node.props ?? {});
    if (!parsed.success) continue;
    const props = parsed.data;
    const presetId = props.presets[0]?.id;
    let request;
    try {
      request = publicDataViewRequest(props, presetId);
    } catch {
      continue;
    }
    if (request === null) continue;
    const key = publicDataViewKey(request);
    if (wanted.has(key)) continue;
    wanted.set(
      key,
      cache.get(`${options.apiBase}\u0000${key}`, () =>
        loadPublicDataViewPage(props, {
          apiBase: options.apiBase,
          presetId,
          fetch: options.fetch,
          signal: AbortSignal.timeout(options.timeoutMs ?? 2_500),
        })
      )
    );
  }
  for (const [key, page] of wanted) out.pages = { ...out.pages, [key]: await page };
  return out;
}

/**
 * The `blocks` field of pages-service's public answer (SDL-722): the
 * Components the page references through `Ref` nodes — nested ones included,
 * flat, on the top level — keyed by block id (= the Ref's `props.blockId`),
 * each frozen at the version the page was published with. The schemas have
 * already been through the public cut of closed nodes upstream.
 */
export type PublishedPageBlocks = Readonly<Record<string, { version?: number; schema?: unknown } | null | undefined>>;

/**
 * The public answer's `blocks` → the engine's `SaunaBlockMap`. A Component
 * whose schema is not a valid schema is left out rather than thrown on: its
 * `Ref` then draws the engine's "missing" placeholder — one broken Component
 * must not take the whole page down. Absent `blocks` (a snapshot taken before
 * SDL-722) → an empty map, which renders exactly as before: every `Ref` is
 * the placeholder.
 *
 * Built with `Object.fromEntries`, not by assignment into `{}`: an id
 * `"__proto__"` becomes an own key instead of replacing the map's prototype.
 * The map stays a PLAIN object on purpose — it crosses into the client
 * `PublishedPage`, and React's server serializer refuses null-prototype
 * objects ("Classes or null prototypes are not supported"), which would
 * answer every page with Components 500. The lookup that must not see
 * `Object.prototype` (a Ref whose blockId is "constructor") is guarded on
 * the other side of that boundary, in `PublishedPage`.
 */
export function publishedBlockMap(blocks: PublishedPageBlocks | null | undefined): SaunaBlockMap {
  const entries: Array<[string, SaunaSchema]> = [];
  if (blocks === null || typeof blocks !== "object") return {};
  for (const [id, block] of Object.entries(blocks)) {
    if (block === null || typeof block !== "object") continue;
    const validated = validateSaunaSchema(block.schema);
    if (validated.ok) entries.push([id, migrateSaunaSchema(validated.value)]);
  }
  return Object.fromEntries(entries);
}

/**
 * The stored page body → the element that renders it for a visitor.
 *
 * Throws when `body` is not a page schema: a published page that silently
 * renders nothing is exactly the failure the registry guards exist for, so
 * the caller decides what a broken body answers (500, a stub), not us.
 *
 * `blocks` is the answer's `blocks` field as it came (SDL-722): a `Ref`
 * draws its Component with the page's parameter values (`applyBlockParams`,
 * in the engine's renderer); a Ref whose Component is not in the map draws
 * the placeholder.
 */
export function renderPublishedPage(
  body: unknown,
  files: PublishedPageFiles = {},
  data?: PublishedPageData,
  blocks?: PublishedPageBlocks | null,
  theme?: unknown
): React.ReactElement {
  const validated = validateSaunaSchema(body);
  if (!validated.ok) {
    throw new Error(`renderPublishedPage: the page body is not a valid schema (${validated.error.message}: ${validated.error.issues.map((i) => `${i.path} ${i.message}`).join("; ")})`);
  }
  const map = publishedBlockMap(blocks);
  // No Components → no `blocks` prop at all: the page's flight payload stays
  // byte-identical to the one before SDL-722.
  const props: PublishedPageProps = { schema: migrateSaunaSchema(validated.value), files, data };
  if (Object.keys(map).length > 0) props.blocks = map;
  const page = React.createElement(PublishedPage, props);
  // The published site theme (SDL-773): one `<style>` ahead of the page, the
  // kit's variables on `:root`. No theme (not published, or not an object) →
  // the element is not emitted and the markup is the one before SDL-773.
  // Its fonts (SDL-774) are @font-face rules inside that sheet; the preloads of
  // the two faces the first paint needs are the caller's (`siteThemeFontPreloads`
  // → react-dom `preload()`, apps/site), so this stays free of react-dom.
  if (siteThemeCss(theme) === null) return page;
  return React.createElement(React.Fragment, null, React.createElement(SiteThemeStyle, { theme }), page);
}

export {
  SITE_THEME_DEFAULT,
  SITE_THEME_DEFAULT_FONTS,
  SITE_THEME_SCALES,
  SITE_THEME_STYLE_ATTR,
  SiteThemeStyle,
  parseSiteTheme,
  siteThemeCss,
  siteThemeFontPreloads,
  type SiteTheme,
  type SiteThemeFonts,
  type SiteThemeScaleStep,
} from "../site-theme";
export { SITE_FONTS, SITE_FONTS_BASE, siteFontFile, type SiteFont } from "../site-fonts";
