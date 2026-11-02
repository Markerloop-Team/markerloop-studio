// A local stand for the workspace site (SDL-685): a fake pages-service public
// plane, a fake Sentry ingest and the BUILT site (`next start`, never `next
// dev` — the CSP/nonce behaviour under test only exists in a production build).
//
//   pnpm --filter site build && pnpm --filter site stand   # serves until killed
//
// Used by test/ssr.test.ts (in-process) and by the Playwright `site` project
// (as its webServer). Nothing here talks to a real service or to Sentry.

import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { SITE_THEME_DEFAULT, SITE_THEME_DEFAULT_FONTS } from "@markerloop/studio/catalog/server";

export const SITE_HOST = "acme.sites.test";
export const UNPUBLISHED_HOST = "draft.sites.test";
export const BROKEN_HOST = "broken.sites.test";
export const HANGING_HOST = "hanging.sites.test";

export function pageBody(text: string): unknown {
  return {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", props: {}, children: ["sec"] },
      sec: { type: "Section", props: { padding: "lg" }, children: ["h"] },
      h: { type: "Text", props: { level: "h1", text } },
    },
    parents: { root: null, sec: "root", h: "sec" },
  };
}

/** The route of SITE_HOST whose page references Components (SDL-722). */
export const COMPONENTS_PATH = "/components";
export const BLOCK_CARD = "aaaaaaaa-1111-4222-8333-444444444444";
export const BLOCK_BADGE = "bbbbbbbb-1111-4222-8333-444444444444";
export const BLOCK_GONE = "cccccccc-1111-4222-8333-444444444444";

/** A page with a Ref (page's params), a Ref to a nested-Ref Component, and a Ref to a Component the answer lacks. */
export function componentsPage(): { body: unknown; blocks: unknown } {
  return {
    body: {
      version: 2,
      rootId: "root",
      nodes: {
        root: { type: "Page", props: {}, children: ["sec"] },
        sec: { type: "Section", props: {}, children: ["card", "gone"] },
        card: { type: "Ref", props: { blockId: BLOCK_CARD, params: { title: "Card title from the page" } } },
        gone: { type: "Ref", props: { blockId: BLOCK_GONE } },
      },
      parents: { root: null, sec: "root", card: "sec", gone: "sec" },
    },
    // Flat, as pages-service sends it: the nested Component on the top level.
    blocks: {
      [BLOCK_CARD]: {
        version: 2,
        schema: {
          version: 2,
          rootId: "c1",
          nodes: {
            c1: { type: "Section", props: {}, children: ["c2", "c3"] },
            c2: { type: "Text", props: { level: "h2", text: "Card default" } },
            c3: { type: "Ref", props: { blockId: BLOCK_BADGE, params: { label: "Badge from the card" } } },
          },
          parents: { c1: null, c2: "c1", c3: "c1" },
          params: [{ name: "title", nodeId: "c2", prop: "text", type: "text", default: "Card default" }],
        },
      },
      [BLOCK_BADGE]: {
        version: 1,
        schema: {
          version: 2,
          rootId: "b1",
          nodes: { b1: { type: "Text", props: { text: "Badge default" } } },
          parents: { b1: null },
          params: [{ name: "label", nodeId: "b1", prop: "text", type: "text", default: "Badge default" }],
        },
      },
    },
  };
}

/**
 * SDL-722 review: Refs whose blockId names an `Object.prototype` member, next
 * to a real Component's Ref and a Text. Served with `blocks` absent, `{}` and
 * the card + badge map — each must answer 200 with those Refs as placeholders.
 */
export const PROTO_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty"] as const;
export const PROTO_KEYS_PATHS = { bare: "/proto-keys-bare", empty: "/proto-keys-empty", full: "/proto-keys" } as const;

export function protoKeysPage(variant: keyof typeof PROTO_KEYS_PATHS): { body: unknown; blocks?: unknown } {
  const refs = Object.fromEntries(PROTO_KEYS.map((blockId, i) => [`p${i}`, { type: "Ref", props: { blockId } }]));
  const body = {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", props: {}, children: ["sec"] },
      sec: { type: "Section", props: {}, children: [...Object.keys(refs), "card", "after"] },
      ...refs,
      card: { type: "Ref", props: { blockId: BLOCK_CARD, params: { title: "Card title from the page" } } },
      after: { type: "Text", props: { text: "After the refs" } },
    },
    parents: { root: null, sec: "root", ...Object.fromEntries(Object.keys(refs).map((id) => [id, "sec"])), card: "sec", after: "sec" },
  };
  if (variant === "bare") return { body };
  return { body, blocks: variant === "empty" ? {} : componentsPage().blocks };
}

/**
 * SDL-769: a page whose picture is far wider than any screen — 4000px, next to
 * text in a row Box, the shape of the owner's /zerno-3 — plus three square
 * frames of one strip picture with fit cover / contain / fill. The site must
 * not scroll sideways at any width, and the three frames must look different.
 * `preserveAspectRatio="none"` makes the SVG behave like a raster picture: with
 * the default (`meet`) an SVG letterboxes itself inside any box, so `fill`
 * would draw the same pixels as `contain`. Blue is the first quarter only, so a
 * square `cover` (the middle quarter: all orange) differs from `fill` (blue at
 * the left) — with halves both would split blue | orange down the middle.
 * Then the review's cases (SDL-769 r1/r2): a 200px logo beside a long
 * paragraph, a 400px photo beside a text column, and a row of three 1600px
 * pictures (the owner's /zerno-3 had several) — each must stay whole; and
 * (r3) a picture beside a column of buttons, and a picture beside a short
 * heading and a button — the buttons keep their width and their place.
 */
export const WIDE_IMAGE_PATH = "/wide-image";
const svg = (w: number, h: number): string =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<rect width="${w / 4}" height="${h}" fill="#2563eb"/><rect x="${w / 4}" width="${(w * 3) / 4}" height="${h}" fill="#f97316"/></svg>`
  );
export const WIDE_IMAGE_SRC = svg(4000, 1000);
export const STRIP_IMAGE_SRC = svg(400, 100);
export const FIT_FRAMES = ["cover", "contain", "fill"] as const;
/** SDL-769 review: pictures that fit keep their size beside long text. */
export const LOGO_SRC = svg(200, 200);
export const PHOTO_SRC = svg(400, 300);
export const LONG_TEXT = "Lorem ipsum dolor sit amet ".repeat(60).trim();
/** SDL-769 review r2: three pictures each wider than the row share it — none is clipped. */
export const TRIPLE_SRC = svg(1600, 900);
export const TRIPLE_ALTS = ["Triple 1", "Triple 2", "Triple 3"] as const;
/** SDL-769 review r3: buttons beside a picture keep their own width and place. */
export const BUTTON_ROW_ALTS = ["Logo beside buttons", "Logo beside heading"] as const;
/** A block wider than any screen that is not a picture: one unbreakable word. */
export const UNBREAKABLE = "W".repeat(400);

export function wideImagePage(): unknown {
  const frames = Object.fromEntries(
    FIT_FRAMES.map((fit) => [`fit_${fit}`, { type: "Image", props: { src: STRIP_IMAGE_SRC, alt: `Strip ${fit}`, fit, aspect: "1 / 1" } }])
  );
  return {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", props: {}, children: ["hero", "fits", "logoRow", "photoRow", "tripleRow", "btnRow", "headRow", "wideText"] },
      hero: { type: "Section", props: { padding: "md" }, children: ["row"] },
      row: { type: "Box", props: { direction: "row", align: "center", gap: 10, padding: 0 }, children: ["col", "wide"] },
      col: { type: "Box", props: { direction: "column", gap: 3, padding: 0 }, children: ["h", "p"] },
      h: { type: "Text", props: { level: "h1", text: "A very wide picture" } },
      p: { type: "Text", props: { level: "body", text: "The picture next to this text is 4000 pixels wide." } },
      wide: { type: "Image", props: { src: WIDE_IMAGE_SRC, alt: "Wide screenshot", fit: "contain" } },
      fits: { type: "Section", props: { padding: "md" }, children: ["frames"] },
      frames: { type: "Box", props: { direction: "row", align: "start", gap: 4, padding: 0 }, children: Object.keys(frames) },
      ...frames,
      logoRow: { type: "Box", props: { direction: "row", align: "center", gap: 4, padding: 0 }, children: ["logo", "longP"] },
      logo: { type: "Image", props: { src: LOGO_SRC, alt: "Logo 200", fit: "cover" } },
      longP: { type: "Text", props: { level: "body", text: LONG_TEXT } },
      photoRow: { type: "Box", props: { direction: "row", align: "center", gap: 4, padding: 0 }, children: ["photoCol", "photo"] },
      photoCol: { type: "Box", props: { direction: "column", gap: 2, padding: 0 }, children: ["photoH", "photoP"] },
      photoH: { type: "Text", props: { level: "h2", text: "Short" } },
      photoP: { type: "Text", props: { level: "body", text: LONG_TEXT } },
      photo: { type: "Image", props: { src: PHOTO_SRC, alt: "Photo 400", fit: "cover" } },
      tripleRow: { type: "Box", props: { direction: "row", align: "center", gap: 4, padding: 0 }, children: ["triple1", "triple2", "triple3"] },
      ...Object.fromEntries(TRIPLE_ALTS.map((alt, i) => [`triple${i + 1}`, { type: "Image", props: { src: TRIPLE_SRC, alt, fit: "cover" } }])),
      btnRow: { type: "Box", props: { direction: "row", align: "center", gap: 4, padding: 0 }, children: ["btnLogo", "btnCol"] },
      btnLogo: { type: "Image", props: { src: LOGO_SRC, alt: BUTTON_ROW_ALTS[0], fit: "cover" } },
      btnCol: { type: "Box", props: { direction: "column", gap: 2, padding: 0 }, children: ["buy", "more"] },
      buy: { type: "Button", props: { children: "Buy" } },
      more: { type: "Button", props: { children: "More info", variant: "outline" } },
      headRow: { type: "Box", props: { direction: "row", align: "center", gap: 4, padding: 0 }, children: ["headLogo", "headH", "headBtn"] },
      headLogo: { type: "Image", props: { src: LOGO_SRC, alt: BUTTON_ROW_ALTS[1], fit: "cover" } },
      headH: { type: "Text", props: { level: "h2", text: "Offer" } },
      headBtn: { type: "Button", props: { children: "Buy now" } },
      wideText: { type: "Text", props: { level: "body", text: UNBREAKABLE } },
    },
    parents: {
      root: null,
      hero: "root",
      row: "hero",
      col: "row",
      h: "col",
      p: "col",
      wide: "row",
      fits: "root",
      frames: "fits",
      ...Object.fromEntries(Object.keys(frames).map((id) => [id, "frames"])),
      logoRow: "root",
      logo: "logoRow",
      longP: "logoRow",
      photoRow: "root",
      photoCol: "photoRow",
      photoH: "photoCol",
      photoP: "photoCol",
      photo: "photoRow",
      tripleRow: "root",
      triple1: "tripleRow",
      triple2: "tripleRow",
      triple3: "tripleRow",
      btnRow: "root",
      btnLogo: "btnRow",
      btnCol: "btnRow",
      buy: "btnCol",
      more: "btnCol",
      headRow: "root",
      headLogo: "headRow",
      headH: "headRow",
      headBtn: "headRow",
      wideText: "root",
    },
  };
}

/**
 * SDL-773: one showcase page served four ways — without a theme (what every
 * site gets until a theme is published), with a "kit parity" theme (the
 * default theme with the kit's own textMuted #8f8f8f instead of pages-service's
 * AA-passing #767676 — must draw pixel for pixel what no theme draws), with the
 * real default theme (differs only where the muted text is) and with a custom
 * theme (every token moved, plus a dark band).
 */
export const THEME_PATHS = {
  none: "/theme-showcase",
  parity: "/theme-showcase-parity",
  default: "/theme-showcase-default",
  custom: "/theme-showcase-custom",
} as const;
export type ThemeVariant = keyof typeof THEME_PATHS;

export const THEME_CUSTOM = {
  ...SITE_THEME_DEFAULT,
  colors: {
    ...SITE_THEME_DEFAULT.colors,
    background: { light: "#faf7f2", dark: "#0b1020" },
    surface: { light: "#ffffff", dark: "#151b2e" },
    muted: { light: "#efe8dc", dark: "#1c2440" },
    text: { light: "#1f1a14", dark: "#f4f1ea" },
    textMuted: { light: "#5f564a", dark: "#b8c0d8" },
    primary: { light: "#9a3412", dark: "#fdba74" },
    primaryForeground: { light: "#ffffff", dark: "#1f1a14" },
    border: { light: "#d9cfbf", dark: "#2c365a" },
  },
  typeScale: "large",
  radius: "lg",
  density: "airy",
  shadow: "strong",
  preset: "",
};

/**
 * SDL-775: one page with every style prop of the first-wave Elements, in the
 * custom theme, so a value is checked as the colour / size the theme gives it.
 */
export const ELEMENT_STYLES_PATH = "/element-styles";
export const ELEMENT_STYLES_PLAIN_PATH = "/element-styles-plain";

export function elementStylesPage(): unknown {
  const nodes: Record<string, { type: string; props?: Record<string, unknown>; children?: string[] }> = {
    root: { type: "Page", props: {}, children: ["sDefault", "sMuted", "sPrimary", "sDark", "wNarrow", "wDefault", "wWide", "wFull", "texts", "boxes", "images", "tables"] },
    sDefault: { type: "Section", props: { background: "default" }, children: ["tDefault"] },
    tDefault: { type: "Text", props: { level: "body", text: "Default band" } },
    sMuted: { type: "Section", props: { background: "muted" }, children: ["tMuted"] },
    tMuted: { type: "Text", props: { level: "body", text: "Muted band" } },
    sPrimary: { type: "Section", props: { background: "primary" }, children: ["tPrimary", "tPrimaryMuted", "bPrimary"] },
    tPrimary: { type: "Text", props: { level: "body", text: "Primary band" } },
    tPrimaryMuted: { type: "Text", props: { level: "body", text: "Muted on primary", color: "muted" } },
    bPrimary: { type: "Button", props: { children: "Primary button on primary" } },
    sDark: { type: "Section", props: { background: "dark" }, children: ["tDark"] },
    tDark: { type: "Text", props: { level: "body", text: "Dark band" } },
    wNarrow: { type: "Section", props: { width: "narrow" }, children: ["twNarrow"] },
    twNarrow: { type: "Text", props: { level: "body", text: "Narrow width" } },
    wDefault: { type: "Section", props: { width: "default" }, children: ["twDefault"] },
    twDefault: { type: "Text", props: { level: "body", text: "Default width" } },
    wWide: { type: "Section", props: { width: "wide" }, children: ["twWide"] },
    twWide: { type: "Text", props: { level: "body", text: "Wide width" } },
    wFull: { type: "Section", props: { width: "full" }, children: ["twFull"] },
    twFull: { type: "Text", props: { level: "body", text: "Full width" } },
    texts: { type: "Section", props: {}, children: ["xDisplay", "xDisplayLong", "xH1", "xMuted", "xPrimary", "xInverse", "xCenter", "xRight", "xNormal", "xMedium", "xBold"] },
    xDisplay: { type: "Text", props: { level: "display", text: "Display text" } },
    // SDL-775 verify: one long word in display — at 390 it ran 407px in a 342px column.
    xDisplayLong: { type: "Text", props: { level: "display", text: "Бронирование" } },
    xH1: { type: "Text", props: { level: "h1", text: "H1 text" } },
    xMuted: { type: "Text", props: { text: "Muted text", color: "muted" } },
    xPrimary: { type: "Text", props: { text: "Primary text", color: "primary" } },
    xInverse: { type: "Text", props: { text: "Inverse text", color: "inverse" } },
    xCenter: { type: "Text", props: { text: "Centered text", align: "center" } },
    xRight: { type: "Text", props: { text: "Right text", align: "right" } },
    xNormal: { type: "Text", props: { level: "h2", text: "Normal heading", weight: "normal" } },
    xMedium: { type: "Text", props: { text: "Medium text", weight: "medium" } },
    xBold: { type: "Text", props: { text: "Bold text", weight: "bold" } },
    boxes: { type: "Section", props: {}, children: ["grid3", "grid4", "bSurface", "bMuted", "bBorder", "bFlat"] },
    grid3: { type: "Box", props: { columns: 3, gap: 4, padding: 0, "data-test": "grid3" }, children: ["g1", "g2", "g3"] },
    grid4: { type: "Box", props: { columns: 4, gap: 4, padding: 0, "data-test": "grid4" }, children: ["h1c", "h2c", "h3c", "h4c"] },
    bSurface: { type: "Box", props: { background: "surface", "data-test": "bSurface" }, children: ["ts"] },
    bMuted: { type: "Box", props: { background: "muted", "data-test": "bMuted" }, children: ["tm"] },
    bBorder: { type: "Box", props: { border: true, "data-test": "bBorder" }, children: ["tb"] },
    bFlat: { type: "Box", props: { border: true, radius: "none", "data-test": "bFlat" }, children: ["tf"] },
    ts: { type: "Text", props: { text: "Surface box" } },
    tm: { type: "Text", props: { text: "Muted box" } },
    tb: { type: "Text", props: { text: "Bordered box" } },
    tf: { type: "Text", props: { text: "Square box" } },
    images: { type: "Section", props: {}, children: ["iTheme", "iNone", "iFull", "iSquare", "iWide"] },
    iTheme: { type: "Image", props: { alt: "Theme corner", src: STRIP_IMAGE_SRC, radius: "theme", aspect: "4 / 3" } },
    iNone: { type: "Image", props: { alt: "Square corner", src: STRIP_IMAGE_SRC, radius: "none", aspect: "4 / 3" } },
    iFull: { type: "Image", props: { alt: "Round", src: STRIP_IMAGE_SRC, radius: "full", aspect: "1 / 1" } },
    iSquare: { type: "Image", props: { alt: "One to one", src: STRIP_IMAGE_SRC, aspect: "1 / 1" } },
    iWide: { type: "Image", props: { alt: "Sixteen to nine", src: STRIP_IMAGE_SRC, aspect: "16 / 9" } },
    tables: { type: "Section", props: {}, children: ["tPlain", "tStyled"] },
    tPlain: { type: "TableView", props: { header: true, rows: [["Plan", "Price"], ["Basic", "$10"], ["Pro", "$20"], ["Team", "$30"]], "data-test": "tPlain" } },
    tStyled: { type: "TableView", props: { header: true, rows: [["Plan", "Price"], ["Basic", "$10"], ["Pro", "$20"], ["Team", "$30"]], bordered: true, striped: true, compact: true, "data-test": "tStyled" } },
  };
  for (const [i, k] of ["g1", "g2", "g3"].entries()) nodes[k] = { type: "Text", props: { text: `Column ${i + 1}` } };
  for (const [i, k] of ["h1c", "h2c", "h3c", "h4c"].entries()) nodes[k] = { type: "Text", props: { text: `Quarter ${i + 1}` } };
  const parents: Record<string, string | null> = { root: null };
  for (const [id, n] of Object.entries(nodes)) for (const c of n.children ?? []) parents[c] = id;
  return { version: 2, rootId: "root", nodes, parents };
}

export function themeFor(variant: ThemeVariant): unknown {
  if (variant === "none") return undefined;
  if (variant === "custom") return THEME_CUSTOM;
  if (variant === "parity") {
    return { ...SITE_THEME_DEFAULT, colors: { ...SITE_THEME_DEFAULT.colors, textMuted: { ...SITE_THEME_DEFAULT.colors.textMuted, light: "#8f8f8f" } } };
  }
  return SITE_THEME_DEFAULT;
}

/**
 * SDL-774: the showcase page with a theme that names two whitelisted families
 * — headings in Playfair Display, text in Inter — and a Russian paragraph, so
 * the Cyrillic subset is exercised too.
 */
export const FONTS_PATH = "/theme-fonts";
export const FONTS_THEME = { ...SITE_THEME_DEFAULT, fonts: { heading: "Playfair Display", body: "Inter" } };

/**
 * pages-service's REAL default theme: `fonts` is required there and defaults to
 * Geist/Geist, so every site with a published, untouched theme gets this — the
 * switch from the kit's system stack to Geist that SDL-774 brings.
 */
export const FONTS_PAGES_DEFAULT_PATH = "/theme-fonts-pages-default";
export const PAGES_DEFAULT_THEME = { ...SITE_THEME_DEFAULT, fonts: SITE_THEME_DEFAULT_FONTS };

/**
 * The same page plus a Kazakh paragraph: Қ and Ә come from Inter's cyrillic-ext
 * file, Ұ (U+04B0) from its cyrillic one, the rest from cyrillic too.
 */
export const FONTS_KK_PATH = "/theme-fonts-kk";
export const KAZAKH_TEXT = "Қазақстан Әлем Ұлы";

export function fontsShowcasePage(kazakh = false): unknown {
  const page = structuredClone(themeShowcasePage()) as { nodes: Record<string, { type: string; props: Record<string, unknown>; children?: string[] }>; parents: Record<string, string | null> };
  page.nodes.ru = { type: "Text", props: { level: "body", text: "Съешь же ещё этих мягких французских булок, да выпей чаю." } };
  page.nodes.hero.children = [...(page.nodes.hero.children ?? []), "ru"];
  page.parents.ru = "hero";
  if (kazakh) {
    page.nodes.kk = { type: "Text", props: { level: "body", text: KAZAKH_TEXT } };
    page.nodes.hero.children.push("kk");
    page.parents.kk = "hero";
  }
  return page;
}

export function themeShowcasePage(): unknown {
  return {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", props: {}, children: ["hero", "band", "night"] },
      hero: { type: "Section", props: { padding: "lg" }, children: ["h1", "lead", "body", "caption", "actions"] },
      h1: { type: "Text", props: { level: "h1", text: "Theme showcase" } },
      lead: { type: "Text", props: { level: "lead", text: "A lead paragraph under the heading." } },
      body: { type: "Text", props: { level: "body", text: "Body text of the page, drawn in the theme's text colour." } },
      caption: { type: "Text", props: { level: "caption", text: "A caption in the muted text colour." } },
      actions: { type: "Box", props: { direction: "row", gap: 3, padding: 2 }, children: ["buy", "more", "link"] },
      buy: { type: "Button", props: { children: "Primary action" } },
      more: { type: "Button", props: { children: "Secondary", variant: "outline" } },
      link: { type: "Link", props: { text: "A link", href: "/" } },
      band: { type: "Section", props: { background: "muted", padding: "md" }, children: ["h2", "cards"] },
      h2: { type: "Text", props: { level: "h2", text: "A muted band" } },
      cards: { type: "Box", props: { direction: "row", gap: 4, padding: 4 }, children: ["card1", "card2"] },
      card1: { type: "Box", props: { direction: "column", gap: 2, padding: 4 }, children: ["h3a", "pa"] },
      h3a: { type: "Text", props: { level: "h3", text: "First box" } },
      pa: { type: "Text", props: { level: "body", text: "Spacing follows the theme's density." } },
      card2: { type: "Box", props: { direction: "column", gap: 2, padding: 4 }, children: ["h3b", "pb"] },
      h3b: { type: "Text", props: { level: "h3", text: "Second box" } },
      pb: { type: "Text", props: { level: "caption", text: "Muted caption inside a box." } },
      night: { type: "Section", props: { background: "dark", padding: "md" }, children: ["h2n", "pn", "btnn"] },
      h2n: { type: "Text", props: { level: "h2", text: "A dark band" } },
      pn: { type: "Text", props: { level: "body", text: "The subtree reads the theme's dark set." } },
      btnn: { type: "Button", props: { children: "Dark action" } },
    },
    parents: {
      root: null,
      hero: "root",
      h1: "hero",
      lead: "hero",
      body: "hero",
      caption: "hero",
      actions: "hero",
      buy: "actions",
      more: "actions",
      link: "actions",
      band: "root",
      h2: "band",
      cards: "band",
      card1: "cards",
      h3a: "card1",
      pa: "card1",
      card2: "cards",
      h3b: "card2",
      pb: "card2",
      night: "root",
      h2n: "night",
      pn: "night",
      btnn: "night",
    },
  };
}

export type ApiCall = { host: string; path: string; headers: http.IncomingHttpHeaders };

export type Stand = {
  siteUrl: string;
  apiCalls: ApiCall[];
  sentryEnvelopes: string[];
  /** Replace the published snapshot of SITE_HOST "/" (what "Update publication" does). */
  publish(text: string): void;
  stop(): Promise<void>;
};

function listen(server: http.Server, port = 0): Promise<number> {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

export async function startStand(opts: { port?: number } = {}): Promise<Stand> {
  const apiCalls: ApiCall[] = [];
  const sentryEnvelopes: string[] = [];
  let snapshot = { text: "Hello from Acme", version: 1 };

  const api = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://api.local");
    // pages-service normalises the host (case, port, trailing dot) — so does the fake.
    const host = (url.searchParams.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    const p = url.searchParams.get("path") ?? "";
    apiCalls.push({ host, path: p, headers: req.headers });
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    if (url.pathname !== "/pages/public/site") return send(404, { success: false, message: "not found" });
    if (host === SITE_HOST && p === "/") {
      return send(
        200,
        { success: true, data: { path: "/", title: `Acme v${snapshot.version}`, body: pageBody(snapshot.text), site: { slug: "acme" } } },
        { etag: `"snap-${snapshot.version}"` }
      );
    }
    if (host === SITE_HOST && p === COMPONENTS_PATH) {
      const { body, blocks } = componentsPage();
      return send(200, { success: true, data: { path: COMPONENTS_PATH, title: "Acme components", body, blocks, site: { slug: "acme" } } });
    }
    if (host === SITE_HOST && p === WIDE_IMAGE_PATH) {
      return send(200, { success: true, data: { path: p, title: "Acme wide image", body: wideImagePage(), site: { slug: "acme" } } });
    }
    if (host === SITE_HOST && (p === ELEMENT_STYLES_PATH || p === ELEMENT_STYLES_PLAIN_PATH)) {
      const theme = p === ELEMENT_STYLES_PATH ? { theme: THEME_CUSTOM } : {};
      return send(200, { success: true, data: { path: p, title: "Acme element styles", body: elementStylesPage(), ...theme, site: { slug: "acme" } } });
    }
    const themeVariant = (Object.keys(THEME_PATHS) as ThemeVariant[]).find((v) => THEME_PATHS[v] === p);
    if (host === SITE_HOST && themeVariant) {
      const theme = themeFor(themeVariant);
      return send(200, { success: true, data: { path: p, title: `Acme theme ${themeVariant}`, body: themeShowcasePage(), ...(theme ? { theme } : {}), site: { slug: "acme" } } });
    }
    if (host === SITE_HOST && p === FONTS_PAGES_DEFAULT_PATH) {
      return send(200, { success: true, data: { path: p, title: "Acme pages default", body: themeShowcasePage(), theme: PAGES_DEFAULT_THEME, site: { slug: "acme" } } });
    }
    if (host === SITE_HOST && (p === FONTS_PATH || p === FONTS_KK_PATH)) {
      return send(200, { success: true, data: { path: p, title: "Acme fonts", body: fontsShowcasePage(p === FONTS_KK_PATH), theme: FONTS_THEME, site: { slug: "acme" } } });
    }
    const protoVariant = (Object.keys(PROTO_KEYS_PATHS) as Array<keyof typeof PROTO_KEYS_PATHS>).find((v) => PROTO_KEYS_PATHS[v] === p);
    if (host === SITE_HOST && protoVariant) {
      return send(200, { success: true, data: { path: p, title: "Acme proto keys", ...protoKeysPage(protoVariant), site: { slug: "acme" } } });
    }
    if (host === HANGING_HOST) {
      // Answers far after the site's 5 s timeout — the site must give up first.
      const t = setTimeout(() => send(404, { success: false }), 30_000);
      req.on("close", () => clearTimeout(t));
      return;
    }
    if (host === BROKEN_HOST) {
      return send(200, { success: true, data: { path: "/", title: "Broken", body: { nodes: {} } } });
    }
    // Unknown host and an unpublished route answer the same upstream 404 (SDL-684).
    return send(404, { success: false, message: "not found" });
  });

  const sentry = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += String(c)));
    req.on("end", () => {
      sentryEnvelopes.push(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  const apiPort = await listen(api);
  const sentryPort = await listen(sentry);
  const sitePort = opts.port ?? (await freePort());

  const appDir = path.resolve(__dirname, "..");
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(appDir, "node_modules/next/dist/bin/next"), "start", "-p", String(sitePort), "-H", "127.0.0.1"],
    {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PAGES_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
        SITES_BASE_DOMAIN: "sites.test",
        SENTRY_DSN: `http://publickey@127.0.0.1:${sentryPort}/1`,
        SENTRY_ENVIRONMENT: "local-stand",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let log = "";
  child.stdout?.on("data", (c) => (log += String(c)));
  child.stderr?.on("data", (c) => (log += String(c)));

  const siteUrl = `http://127.0.0.1:${sitePort}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited ${child.exitCode}:\n${log}`);
    try {
      await get(siteUrl, "/", "probe.sites.test");
      break;
    } catch {
      if (Date.now() > deadline) throw new Error(`next start did not come up:\n${log}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    siteUrl,
    apiCalls,
    sentryEnvelopes,
    publish(text) {
      snapshot = { text, version: snapshot.version + 1 };
    },
    async stop() {
      child.kill("SIGTERM");
      await new Promise((r) => api.close(() => sentry.close(() => r(undefined))));
    },
  };
}

export type SiteResponse = { status: number; headers: http.IncomingHttpHeaders; body: string };

/** GET with an explicit Host — what the ingress hands the site. (fetch cannot set Host.) */
export function get(siteUrl: string, pathname: string, host: string, headers: Record<string, string> = {}): Promise<SiteResponse> {
  const target = new URL(pathname, siteUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: "GET", headers: { ...headers, host } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += String(c)));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function freePort(): Promise<number> {
  const s = http.createServer();
  const port = await listen(s);
  await new Promise((r) => s.close(r));
  return port;
}

// CLI: the Playwright webServer.
if (require.main === module) {
  const port = Number(process.env.SITE_PORT ?? 31851);
  startStand({ port }).then((stand) => {
    console.log(`site stand on ${stand.siteUrl} (Host ${SITE_HOST})`);
  });
}
