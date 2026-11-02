// The site theme's fonts (SDL-774, EP-160): a whitelist of Google Fonts
// families served from the site's own host, never from Google.
//
// The list is pages-service `models.ThemeFonts` — the validation source of the
// theme's `fonts.heading` / `fonts.body` — and the files are committed under
// apps/site/public/fonts/<id>/<subset>-<weight>.woff2 by the one-off
// scripts/fetch-site-fonts.mjs (which also regenerates ./site-fonts-data.ts).
// Every family has weights 400 and 700, style normal, subset latin, and
// cyrillic / cyrillic-ext where the family has them (cyrillic-ext carries the
// Kazakh letters Ә Ғ Қ Ң Ө Ү Һ; Ұ and І are in cyrillic); a cyrillic-ext file
// with no Kazakh letter (Plus Jakarta Sans, Unbounded) is not shipped. Kazakh
// is NOT complete everywhere — `kazakhMissing` lists, from the files' own cmap,
// the letters a family lacks (they draw in the fallback stack): Manrope,
// JetBrains Mono, Unbounded, Playfair Display partly; Work Sans, DM Sans,
// Plus Jakarta Sans, Lato, Poppins have no Cyrillic at all. The license sits
// next to the files.
//
// Visitors' browsers fetch only what the page uses: each subset is its own
// @font-face with the Google Fonts `unicode-range`, so a Latin page never
// downloads the Cyrillic file, a Russian page never the cyrillic-ext one (only
// a page with Kazakh letters does), and a weight no text uses is never fetched.

import { SITE_FONT_ROWS, SITE_FONT_WEIGHTS } from "./site-fonts-data";

export { SITE_FONT_WEIGHTS };

export type SiteFontCategory = "sans" | "serif" | "display" | "mono";
export type SiteFontSubset = "latin" | "cyrillic" | "cyrillic-ext";
export type SiteFontWeight = (typeof SITE_FONT_WEIGHTS)[number];

export type SiteFont = {
  /** The family name, exactly as the theme JSON and Google Fonts spell it. */
  family: string;
  /** The folder under the fonts base: `/fonts/<id>/…`. */
  id: string;
  category: SiteFontCategory;
  /** The family has the Cyrillic subset. */
  cyrillic: boolean;
  /** The family ships the cyrillic-ext subset (Kazakh Ә Ғ Қ Ң Ө Ү Һ). */
  cyrillicExt: boolean;
  /** Kazakh letters (upper and lower case) none of its files has; "" = full Kazakh. */
  kazakhMissing: string;
  license: string;
};

/** The whitelist, in pages-service's order. */
export const SITE_FONTS: readonly SiteFont[] = SITE_FONT_ROWS;

/** pages-service `DefaultSiteTheme().Fonts` — heading and body alike. */
export const SITE_FONT_DEFAULT = "Geist";

/** Where the site serves the files (apps/site/public/fonts). */
export const SITE_FONTS_BASE = "/fonts";

/** Google Fonts' `unicode-range` of each subset (the same for every family). */
export const SITE_FONT_SUBSET_RANGES: Readonly<Record<SiteFontSubset, string>> = {
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  "cyrillic-ext": "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
};

/** The stack after the family: what draws while it loads (`swap`) or a glyph it lacks. */
export const SITE_FONT_FALLBACKS: Readonly<Record<SiteFontCategory, string>> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  display: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};

/** The whitelisted family of that exact name, or `undefined`. */
export function siteFont(family: unknown): SiteFont | undefined {
  return typeof family === "string" ? SITE_FONTS.find((f) => f.family === family) : undefined;
}

/**
 * The family's subsets in Google's order — cyrillic-ext, cyrillic, latin: where
 * two faces' ranges overlap the browser takes the LAST declared one, so the
 * base subsets come after the extension, as in Google's own CSS.
 */
export function siteFontSubsets(font: SiteFont): SiteFontSubset[] {
  const out: SiteFontSubset[] = [];
  if (font.cyrillicExt) out.push("cyrillic-ext");
  if (font.cyrillic) out.push("cyrillic");
  out.push("latin");
  return out;
}

/** The file's URL path: `<base>/<id>/<subset>-<weight>.woff2`. */
export function siteFontFile(font: SiteFont, subset: SiteFontSubset, weight: SiteFontWeight, base: string = SITE_FONTS_BASE): string {
  return `${base}/${font.id}/${subset}-${weight}.woff2`;
}

/** `"Family", <fallback stack>` — the value of a `font-family`. */
export function siteFontStack(font: SiteFont): string {
  return `"${font.family}", ${SITE_FONT_FALLBACKS[font.category]}`;
}

/** Every @font-face of the family: one per subset × weight, `font-display: swap`. */
export function siteFontFaces(font: SiteFont, base: string = SITE_FONTS_BASE): string[] {
  const out: string[] = [];
  for (const subset of siteFontSubsets(font)) {
    for (const weight of SITE_FONT_WEIGHTS) {
      out.push(
        `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${weight};font-display:swap;` +
          `src:url(${siteFontFile(font, subset, weight, base)}) format("woff2");unicode-range:${SITE_FONT_SUBSET_RANGES[subset]}}`
      );
    }
  }
  return out;
}
