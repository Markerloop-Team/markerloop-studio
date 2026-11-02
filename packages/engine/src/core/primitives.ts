// The four primitives of the pages catalog (SDL-630): Text, Image, Box, Link.
// The architecture decision names them; advanced components come later and are built from
// these. This file is the catalog half — type, editable props and the props a
// NEW node starts with. The components are `../react/primitives`.
//
// Server-safe (no React, no DOM), like the rest of `core`.
//
// Defaults are self-contained: a new node must render the same in the admin's
// canvas, on a published site and in any other host. The reference's image
// placeholder was `/sauna-assets/placeholder.png` — a route of the reference
// Studio app, 404 for every other consumer. So `Image` has NO default `src`
// (the component draws its own empty state) and `Link` starts at `#`.
// `findRouteBoundDefaults` is the guard; the engine tests and the admin's
// `smoke:pages` run it over the catalogs they ship.

import { z } from "zod";

import type { SaunaSchema } from "../schema/types";
import { defineBlock, type BlockDefinition } from "./define-block";

export const TEXT_LEVELS = ["display", "h1", "h2", "h3", "lead", "body", "caption"] as const;
export type TextLevel = (typeof TEXT_LEVELS)[number];

// Style props of the first-wave Elements (SDL-775, EP-160). Enumerations
// only, never free CSS; the values are the canvas's
// (`apps/admin/src/app/design-system/_canvas/site-preview-parts.tsx`) and
// pages-service's catalog copy must carry the same ones. Every prop is
// optional and a node without it renders exactly as before.
export const TEXT_COLORS = ["default", "muted", "primary", "inverse"] as const;
/** A built-in Text colour, or the key of a custom colour of the site theme (SDL-950). */
export type TextColor = (typeof TEXT_COLORS)[number] | ThemeColorKey;
// Theme colour keys (SDL-950, EP-189). Beyond its eight roles the site theme
// carries up to 24 custom colours `{key, label, light, dark}` (pages-service
// `ThemeCustomColor`). A colour prop of an Element (Section.background, Text.color, Box.background)
// takes its built-in values OR the key of a custom colour — never a colour
// value. The key is the service's rule (`ThemeCustomColorKeyRe`) and is never
// one of the reserved words (`ThemeReservedColorKeys`: the roles, the built-in
// values of every colour prop, CSS keywords), so a stored value always reads
// one way. Whether the key is IN the theme is not checked on a write or a read
// (the theme is edited separately and later): the renderer paints
// `var(--pages-color-<key>, <the prop's default>)`, and a key the published
// theme no longer has falls back to the default — no error, no 4xx.

/** pages-service `ThemeCustomColorKeyRe`. */
export const THEME_COLOR_KEY_PATTERN = /^[a-z][A-Za-z0-9_-]{0,31}$/;
/** pages-service `ThemeReservedColorKeys` (compared without case). */
export const THEME_RESERVED_COLOR_KEYS = [
  "background",
  "surface",
  "muted",
  "text",
  "textMuted",
  "primary",
  "primaryForeground",
  "border",
  "default",
  "none",
  "dark",
  "light",
  "inverse",
  "transparent",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "currentColor",
] as const;
/** pages-service `MaxThemeCustomColors`. */
export const THEME_MAX_CUSTOM_COLORS = 24;
/** pages-service `MaxThemeCustomColorLabel`, characters. */
export const THEME_MAX_CUSTOM_COLOR_LABEL = 64;
/** The CSS variable a custom colour is written to: `--pages-color-<key>`. */
export const THEME_COLOR_VARIABLE_PREFIX = "--pages-color-";

/** The key of a custom theme colour (a string of `THEME_COLOR_KEY_PATTERN`, not reserved). */
export type ThemeColorKey = string & { readonly __themeColorKey?: never };

const RESERVED_LOWER = new Set(THEME_RESERVED_COLOR_KEYS.map((k) => k.toLowerCase()));

/** pages-service `IsCustomColorKey`: right shape and not reserved. Says nothing about a given theme. */
export function isThemeColorKey(value: unknown): value is ThemeColorKey {
  return typeof value === "string" && THEME_COLOR_KEY_PATTERN.test(value) && !RESERVED_LOWER.has(value.toLowerCase());
}

/**
 * `var(--pages-color-<key>, <fallback>)` for a valid key, `undefined`
 * otherwise. Without `fallback` a missing variable makes the declaration
 * invalid at computed-value time, i.e. `unset`: an inherited property (color)
 * inherits, any other (background) gets its initial value — the prop's default.
 */
export function themeColorVar(key: unknown, fallback?: string): string | undefined {
  if (!isThemeColorKey(key)) return undefined;
  return fallback ? `var(${THEME_COLOR_VARIABLE_PREFIX}${key}, ${fallback})` : `var(${THEME_COLOR_VARIABLE_PREFIX}${key})`;
}

/**
 * The zod type of a custom colour key. The shape is a `regex` check, so the
 * JSON Schema of the Element catalog carries it as `pattern`; only the
 * reserved words stay a refinement (the catalog's validation note names them).
 */
export const themeColorKeySchema = z
  .string()
  .regex(THEME_COLOR_KEY_PATTERN, { message: "Not a theme colour key" })
  .refine(isThemeColorKey, { message: "Not a theme colour key" });

/**
 * A colour prop: one of `builtins`, or a custom theme colour key. The enum is
 * the first option, so the properties panel still finds the built-in values.
 */
export function themeColorProp<const T extends readonly [string, ...string[]]>(builtins: T) {
  return z.union([z.enum(builtins), themeColorKeySchema]);
}

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const TEXT_WEIGHTS = ["normal", "medium", "bold"] as const;
export type TextWeight = (typeof TEXT_WEIGHTS)[number];
export const BOX_COLUMNS_MIN = 1;
export const BOX_COLUMNS_MAX = 4;
export const BOX_BACKGROUNDS = ["none", "surface", "muted"] as const;
/** A built-in Box fill, or the key of a custom colour of the site theme (SDL-950). */
export type BoxBackground = (typeof BOX_BACKGROUNDS)[number] | ThemeColorKey;
export const BOX_RADII = ["theme", "none"] as const;
export type BoxRadius = (typeof BOX_RADII)[number];
export const IMAGE_RADII = ["theme", "none", "full"] as const;
export type ImageRadius = (typeof IMAGE_RADII)[number];

export const IMAGE_FITS = ["cover", "contain", "fill", "none", "scale-down"] as const;
/**
 * The shape of an Image's frame, as a CSS `aspect-ratio` (the kit's `Image`
 * calls the same prop `aspect`). `auto` = the picture's own shape, which is
 * also what a node without the prop gets. `fit` only shows inside a frame of
 * ANOTHER shape: in an `auto` frame the box already has the picture's
 * proportions, so cover, contain and fill draw the same pixels (SDL-769).
 */
export const IMAGE_ASPECTS = ["auto", "16 / 9", "4 / 3", "3 / 2", "1 / 1", "3 / 4", "9 / 16"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];
/**
 * The aspects the inspector OFFERS (owner, 13 Oct 2026): four of the seven.
 * The other three stay valid in a stored page and are shown when a node
 * already has one, they are just not offered for a new choice.
 */
export const IMAGE_OFFERED_ASPECTS = ["auto", "1 / 1", "4 / 3", "16 / 9"] as const satisfies readonly ImageAspect[];
/**
 * Image width (SDL-951, EP-189): `fill` = the container's width, `hug` = the
 * picture's own width (never past the container), `fixed` = `fixedWidth`
 * pixels (never past the container either). Absent = as before: the picture's
 * own width in an `auto` frame, the container's in a framed one.
 */
export const IMAGE_WIDTHS = ["fill", "hug", "fixed"] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
/** Range of `fixedWidth`, px (the prototype's floor is 40). */
export const IMAGE_FIXED_WIDTH_MIN = 40;
export const IMAGE_FIXED_WIDTH_MAX = 4000;
/** What `width: "fixed"` draws when `fixedWidth` is absent (the prototype's start value). */
export const IMAGE_FIXED_WIDTH_DEFAULT = 480;
/** Focus point, % of the picture from its left / top edge (CSS `object-position`). */
export const IMAGE_FOCUS_MIN = 0;
export const IMAGE_FOCUS_MAX = 100;
/**
 * Colour roles an Image border may take: the site theme's eight roles, in
 * pages-service's order (`SITE_THEME_ROLES` of `@markerloop/studio`). A key of
 * the theme, never a colour value (owner, EP-189). The shared "theme colour
 * key" type of SDL-950 replaces this list when it lands; until then this is
 * the one place to widen.
 */
export const IMAGE_BORDER_COLORS = [
  "background",
  "surface",
  "muted",
  "text",
  "textMuted",
  "primary",
  "primaryForeground",
  "border",
] as const;
export type ImageBorderColor = (typeof IMAGE_BORDER_COLORS)[number];
export const BOX_DIRECTIONS = ["column", "row"] as const;
export const BOX_ALIGNS = ["start", "center", "end", "stretch"] as const;
export const LINK_TARGETS = ["_self", "_blank"] as const;

export const TextBlock = defineBlock({
  type: "Text",
  displayName: "Text",
  staticProps: z.object({
    level: z.enum(TEXT_LEVELS).default("body"),
    text: z.string().default("Some text"),
    // Absent or `default` = the colour the text has anyway (inherited, or the level's own).
    color: themeColorProp(TEXT_COLORS).optional(),
    // Absent = inherited from the band / the level's own weight.
    align: z.enum(TEXT_ALIGNS).optional(),
    weight: z.enum(TEXT_WEIGHTS).optional(),
  }),
  meta: {
    category: "Text",
    description: "Text at any level — from h1 down to a caption.",
    initialProps: { level: "body", text: "Some text" },
  },
});

export const ImageBlock = defineBlock({
  type: "Image",
  displayName: "Image",
  staticProps: z.object({
    src: z.string().optional(),
    alt: z.string().default(""),
    fit: z.enum(IMAGE_FITS).default("cover"),
    aspect: z.enum(IMAGE_ASPECTS).default("auto"),
    // Absent = the corners as before (square picture, theme corner on the empty frame).
    radius: z.enum(IMAGE_RADII).optional(),
    // SDL-951: all optional, absent = the picture exactly as before (no default
    // is written by a parse, so an old node renders byte for byte the same).
    focus: z
      .object({
        x: z.number().min(IMAGE_FOCUS_MIN).max(IMAGE_FOCUS_MAX).describe("Percent from the left edge, 0-100."),
        y: z.number().min(IMAGE_FOCUS_MIN).max(IMAGE_FOCUS_MAX).describe("Percent from the top edge, 0-100."),
      })
      .optional()
      .describe(
        "Focus point: the part of the picture kept in view when it is cropped (fit cover in a frame of another shape). CSS object-position x% y%. Absent = the centre."
      ),
    width: z
      .enum(IMAGE_WIDTHS)
      .optional()
      .describe(
        "Width: fill = the container's width, hug = the picture's own width, fixed = fixedWidth px. Never wider than the container. Absent = the picture's own width, or the container's when aspect is set."
      ),
    fixedWidth: z
      .number()
      .int()
      .min(IMAGE_FIXED_WIDTH_MIN)
      .max(IMAGE_FIXED_WIDTH_MAX)
      .optional()
      .describe(`Width in px when width is fixed (${IMAGE_FIXED_WIDTH_MIN}-${IMAGE_FIXED_WIDTH_MAX}; absent = ${IMAGE_FIXED_WIDTH_DEFAULT}). Ignored otherwise.`),
    border: z.boolean().optional().describe("Border: a 1px line in borderColor. Absent or false = no border."),
    borderColor: z
      .enum(IMAGE_BORDER_COLORS)
      .optional()
      .describe("Colour of the border, a role of the site theme. Absent = border. Ignored without border."),
    shadow: z.boolean().optional().describe("Shadow: the site theme's shadow. Absent or false = no shadow."),
  }),
  meta: {
    category: "Media",
    description: "A picture. Until it has an address it shows an empty frame.",
    // No `src` on purpose — see the header.
    initialProps: { alt: "", fit: "cover", aspect: "auto" },
  },
});

export const BoxBlock = defineBlock({
  type: "Box",
  displayName: "Box",
  staticProps: z.object({
    direction: z.enum(BOX_DIRECTIONS).default("column"),
    gap: z.number().int().min(0).max(12).default(4),
    padding: z.number().int().min(0).max(12).default(4),
    align: z.enum(BOX_ALIGNS).default("stretch"),
    // Equal columns, stacked on a phone; absent = the flex column/row as before.
    columns: z.number().int().min(BOX_COLUMNS_MIN).max(BOX_COLUMNS_MAX).optional(),
    background: themeColorProp(BOX_BACKGROUNDS).optional(),
    border: z.boolean().optional(),
    // Absent = the theme's corner when the box is framed (background or border), none otherwise.
    radius: z.enum(BOX_RADII).optional(),
  }),
  meta: {
    category: "Layout",
    description: "A container that lines its children up in a column or a row.",
    initialProps: { direction: "column", gap: 4, padding: 4, align: "stretch" },
  },
});

export const LinkBlock = defineBlock({
  type: "Link",
  displayName: "Link",
  staticProps: z.object({
    text: z.string().default("Link"),
    href: z.string().default("#"),
    target: z.enum(LINK_TARGETS).default("_self"),
  }),
  meta: {
    category: "Text",
    description: "A link to another page or site.",
    initialProps: { text: "Link", href: "#", target: "_self" },
  },
});

export const PRIMITIVE_BLOCKS = [TextBlock, ImageBlock, BoxBlock, LinkBlock] as const;

export type RouteBoundDefault = { type: string; path: string; value: string };

/**
 * Every default of a block that points at an address of the HOST app — a
 * string starting with a single `/` (`/sauna-assets/x.png`, `/`). Such a
 * value resolves against whatever origin renders the node, so it works in
 * exactly one app and is broken everywhere else. Scheme URLs, `//host`,
 * `#anchor` and plain text pass. Walks `initialProps` and the props of every
 * node of `previewSchema` (what the Insert card draws), nested values too.
 */
export function findRouteBoundDefaults(blocks: readonly BlockDefinition[]): RouteBoundDefault[] {
  const out: RouteBoundDefault[] = [];
  const walk = (type: string, path: string, value: unknown): void => {
    if (typeof value === "string") {
      if (/^\/(?!\/)/.test(value)) out.push({ type, path, value });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(type, `${path}[${i}]`, v));
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(type, `${path}.${k}`, v);
    }
  };
  for (const block of blocks) {
    walk(block.type, "initialProps", block.meta?.initialProps);
    const preview: SaunaSchema | undefined = block.meta?.previewSchema;
    for (const [id, node] of Object.entries(preview?.nodes ?? {})) {
      walk(block.type, `previewSchema.${id}(${node.type}).props`, node.props);
    }
  }
  return out;
}
