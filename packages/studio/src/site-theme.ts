// The site theme → the kit's CSS variables (SDL-773, EP-160).
//
// pages-service owns the theme (SDL-772): one JSON per workspace — 8 colour
// roles as light/dark pairs, a type scale, radius, density, shadow, fonts and
// a preset id — and puts the PUBLISHED one into every public page answer as
// `theme` (absent until a theme is published). This module turns it into ONE
// stylesheet for the page's document: the site renders it as the first thing
// of the page, the Studio canvas inside its frame.
//
// No author CSS, ever (the "no author JavaScript, no raw HTML" guarantee of
// SDL-681): every value written below is either a constant of this module,
// picked by an enumerated token, or a colour that matched `#rrggbb` exactly.
// A token outside its enumeration or a colour of any other shape falls back
// to the default of THAT field — the rest of the theme still applies — and
// the finished sheet is refused outright if it ever contains `<` or `\`, so
// nothing can close the `<style>` it is written into.
//
// The default theme is what the site looked like before themes: the kit's
// public `:root` / `.dark` set (packages/ui/src/ui/internal/styles/globals.css)
// in sRGB hex — the copy of pages-service `models.DefaultSiteTheme`. Two
// declared deviations, both from pages-service: `textMuted.light` is #767676
// (4.54:1 on white, WCAG AA) instead of the kit's #8f8f8f (3.23:1), and
// `border.dark` is the kit's 10% white flattened onto #111111. No theme in the
// answer → no stylesheet at all, the page is byte-for-byte what it was.
//
// Fonts (SDL-774): `fonts.heading` / `fonts.body` name families of the
// whitelist in ./site-fonts.ts, served from the site's own host (`/fonts`,
// CSP `font-src 'self'`). The sheet then opens with the two families'
// @font-face rules (`font-display: swap`, one per subset × weight) and sets
// `body` and h1–h6 in them; the page's `<link rel="preload">` for exactly the
// two faces comes from `siteThemeFontPreloads`. pages-service always sends
// `fonts` (SiteTheme.Fonts is required, default Geist/Geist), so once this
// ships every site WITH a published theme switches from the kit's system stack
// to its theme's families — Geist for an untouched default; that is the
// contract. A theme object without `fonts` (only hand-made ones: the tests'
// SITE_THEME_DEFAULT, older fixtures) writes no font rule at all. A family
// outside the whitelist is that field's default, Geist. `preset` only names where the
// values came from.
//
// Scales (SDL-949): `spacing` and `iconSize` are named steps `[{name, value}]`
// in px — pages-service `ThemeScaleStep`. Spacing is the base value BEFORE
// density: the sheet writes `--pages-space-<name>: calc(<px>px *
// var(--pages-density))`, icons `--pages-icon-<name>: <px>px`. The built-in
// steps are always there (a theme older than the scales reads as the
// defaults); a theme may add its own named steps after them. The step name is
// part of a CSS variable name, so only names of the service's rule
// (`^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$`) ever reach the sheet.
//
// Custom colours (SDL-950): `customColors` is `[{key, label, light, dark}]`,
// up to 24 — pages-service `ThemeCustomColor`. Each one is written as
// `--pages-color-<key>` (light on the root, dark on a dark band); an Element's
// colour prop holding the key paints that variable (`themeColorVar` of
// `@markerloop/engine`), and a key the theme lacks falls back to the prop's
// default. A theme older than custom colours reads `customColors: []`. Only a
// key of the engine's rule (`isThemeColorKey`, the service's) reaches a
// variable name; the label never reaches the sheet.

import * as React from "react";
import { SITE_FONTS_BASE, SITE_FONT_DEFAULT, siteFont, siteFontFaces, siteFontFile, siteFontStack, type SiteFont } from "./site-fonts";

/** The eight colour roles of the theme, in pages-service's order. */
export const SITE_THEME_ROLES = [
  "background",
  "surface",
  "muted",
  "text",
  "textMuted",
  "primary",
  "primaryForeground",
  "border",
] as const;
export type SiteThemeRole = (typeof SITE_THEME_ROLES)[number];

export const SITE_THEME_TYPE_SCALES = ["compact", "default", "large"] as const;
export const SITE_THEME_RADII = ["none", "sm", "md", "lg", "full"] as const;
export const SITE_THEME_DENSITIES = ["compact", "default", "airy"] as const;
export const SITE_THEME_SHADOWS = ["none", "soft", "strong"] as const;

export type SiteThemeTypeScale = (typeof SITE_THEME_TYPE_SCALES)[number];
export type SiteThemeRadius = (typeof SITE_THEME_RADII)[number];
export type SiteThemeDensity = (typeof SITE_THEME_DENSITIES)[number];
export type SiteThemeShadow = (typeof SITE_THEME_SHADOWS)[number];

export type SiteThemeColorPair = { light: string; dark: string };

/** Families of the whitelist (./site-fonts.ts) for headings (h1–h6) and the rest. */
export type SiteThemeFonts = { heading: string; body: string };

// Copies of `@markerloop/engine`'s theme-colour-key rule (THEME_COLOR_KEY_PATTERN,
// THEME_RESERVED_COLOR_KEYS, …): this module is on the server entry, which
// pulls nothing but React. The studio tests pin the copies to the engine's.
export const SITE_THEME_COLOR_KEY = /^[a-z][A-Za-z0-9_-]{0,31}$/;
export const SITE_THEME_RESERVED_COLOR_KEYS: readonly string[] = [
  "background", "surface", "muted", "text", "textMuted", "primary", "primaryForeground", "border",
  "default", "none", "dark", "light", "inverse",
  "transparent", "inherit", "initial", "unset", "revert", "revert-layer", "currentColor",
];
const RESERVED_LOWER = new Set(SITE_THEME_RESERVED_COLOR_KEYS.map((k) => k.toLowerCase()));
const THEME_COLOR_VARIABLE_PREFIX = "--pages-color-";
/** The engine's `isThemeColorKey` (pages-service `IsCustomColorKey`). */
export function isSiteThemeColorKey(value: unknown): value is string {
  return typeof value === "string" && SITE_THEME_COLOR_KEY.test(value) && !RESERVED_LOWER.has(value.toLowerCase());
}
const isThemeColorKey = isSiteThemeColorKey;

/** A custom colour of the theme (pages-service `ThemeCustomColor`, SDL-950). */
export type SiteThemeCustomColor = { key: string; label: string; light: string; dark: string };

/** pages-service `MaxThemeCustomColors` / `MaxThemeCustomColorLabel`. */
export const SITE_THEME_MAX_CUSTOM_COLORS = 24;
export const SITE_THEME_MAX_CUSTOM_COLOR_LABEL = 64;

/** One named step of a theme scale, px (pages-service `ThemeScaleStep`, SDL-949). */
export type SiteThemeScaleStep = { name: string; value: number };

export const SITE_THEME_SCALE_KEYS = ["spacing", "iconSize"] as const;
export type SiteThemeScaleKey = (typeof SITE_THEME_SCALE_KEYS)[number];

/** pages-service `ThemeScaleNameRe`: the name goes into a CSS variable name. */
export const SITE_THEME_SCALE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/;

/** pages-service `MaxThemeScaleSteps`: steps in one scale, built-ins included. */
export const SITE_THEME_MAX_SCALE_STEPS = 32;

export type SiteThemeScaleSpec = {
  /** The built-in steps in their canonical spelling and order; never removed. */
  builtins: readonly Readonly<SiteThemeScaleStep>[];
  /** Integer px, inclusive. */
  min: number;
  max: number;
  /** The CSS variable of a step is `<prefix><name>`. */
  prefix: string;
};

/** pages-service `themeSpacingScale` / `themeIconSizeScale`. */
/** Frozen steps: the built-ins are shared by every reader, nobody may edit them. */
const freezeSteps = (steps: SiteThemeScaleStep[]): readonly Readonly<SiteThemeScaleStep>[] =>
  Object.freeze(steps.map((s) => Object.freeze(s)));

export const SITE_THEME_SCALES: Readonly<Record<SiteThemeScaleKey, Readonly<SiteThemeScaleSpec>>> = Object.freeze({
  spacing: Object.freeze({
    builtins: freezeSteps([
      { name: "0", value: 0 },
      { name: "XS", value: 4 },
      { name: "S", value: 8 },
      { name: "M", value: 16 },
      { name: "L", value: 24 },
      { name: "XL", value: 40 },
      { name: "2XL", value: 64 },
    ]),
    min: 0,
    max: 512,
    prefix: "--pages-space-",
  }),
  iconSize: Object.freeze({
    builtins: freezeSteps([
      { name: "XS", value: 16 },
      { name: "S", value: 20 },
      { name: "M", value: 24 },
      { name: "L", value: 32 },
      { name: "XL", value: 48 },
    ]),
    min: 8,
    max: 256,
    prefix: "--pages-icon-",
  }),
});

/** The built-in steps of a scale, as a fresh copy (pages-service `DefaultSpacingScale` / `DefaultIconSizeScale`). */
export function siteThemeDefaultScale(key: SiteThemeScaleKey): SiteThemeScaleStep[] {
  return SITE_THEME_SCALES[key].builtins.map((s) => ({ name: s.name, value: s.value }));
}

/** The parts of the theme this module applies. */
export type SiteTheme = {
  colors: Record<SiteThemeRole, SiteThemeColorPair>;
  /** Absent → no font rule (the kit's stack, as before SDL-774). */
  fonts?: SiteThemeFonts;
  typeScale: SiteThemeTypeScale;
  radius: SiteThemeRadius;
  density: SiteThemeDensity;
  shadow: SiteThemeShadow;
  /** Spacing steps, px before the density multiplier (SDL-949). */
  spacing: SiteThemeScaleStep[];
  /** Icon size steps, px (SDL-949). */
  iconSize: SiteThemeScaleStep[];
  /** Custom colours (SDL-950); `parseSiteTheme` always gives an array, `[]` for an older theme. */
  customColors?: SiteThemeCustomColor[];
};

/**
 * pages-service `models.DefaultSiteTheme()` — the kit's public set. Without
 * `fonts`: pages-service's default carries Geist/Geist (SITE_THEME_DEFAULT_FONTS),
 * left out here so that this constant still draws exactly the unthemed page.
 */
export const SITE_THEME_DEFAULT: SiteTheme = {
  colors: {
    background: { light: "#ffffff", dark: "#111111" },
    surface: { light: "#ffffff", dark: "#1e1e1e" },
    muted: { light: "#f5f5f5", dark: "#2a2a2a" },
    text: { light: "#111111", dark: "#fefefe" },
    textMuted: { light: "#767676", dark: "#b5b5b5" },
    primary: { light: "#111111", dark: "#f5f5f5" },
    primaryForeground: { light: "#fefefe", dark: "#111111" },
    border: { light: "#e5e5e5", dark: "#292929" },
  },
  typeScale: "default",
  radius: "md",
  density: "default",
  shadow: "soft",
  spacing: siteThemeDefaultScale("spacing"),
  iconSize: siteThemeDefaultScale("iconSize"),
  customColors: [],
};

/**
 * Role → the kit variables it paints. The first one is the role's own; the
 * rest are the kit's derived surfaces that equal it in the kit's public set
 * (card = popover, muted = secondary = accent, border = input, every
 * `*-foreground` on a surface = foreground), so a recoloured site has no
 * leftover kit colour on a popover or a secondary button.
 */
export const SITE_THEME_ROLE_VARIABLES: Readonly<Record<SiteThemeRole, readonly string[]>> = {
  background: ["--background"],
  surface: ["--card", "--popover"],
  muted: ["--muted", "--secondary", "--accent"],
  text: ["--foreground", "--card-foreground", "--popover-foreground", "--secondary-foreground", "--accent-foreground"],
  textMuted: ["--muted-foreground"],
  primary: ["--primary"],
  primaryForeground: ["--primary-foreground"],
  border: ["--border", "--input"],
};

/** Text levels of the engine's `Text` primitive, plus `display` for SDL-775. */
export const SITE_THEME_TEXT_LEVELS = ["display", "h1", "h2", "h3", "lead", "body", "caption"] as const;
export type SiteThemeTextLevel = (typeof SITE_THEME_TEXT_LEVELS)[number];

/** `--pages-text-<level>`; `default` = the engine primitive's own sizes. */
export const SITE_THEME_TYPE_SCALE_SIZES: Readonly<Record<SiteThemeTypeScale, Readonly<Record<SiteThemeTextLevel, string>>>> = {
  compact: { display: "2.75rem", h1: "1.875rem", h2: "1.5rem", h3: "1.125rem", lead: "1.0625rem", body: "0.9375rem", caption: "0.75rem" },
  default: { display: "3.5rem", h1: "2.25rem", h2: "1.75rem", h3: "1.25rem", lead: "1.125rem", body: "1rem", caption: "0.8125rem" },
  large: { display: "4.5rem", h1: "2.75rem", h2: "2.125rem", h3: "1.5rem", lead: "1.25rem", body: "1.125rem", caption: "0.875rem" },
};

/** The kit's radius variables; `md` = the kit's own (`--radius: 0.625rem` and its calc() steps). */
export const SITE_THEME_RADIUS_VALUES: Readonly<Record<SiteThemeRadius, Readonly<Record<string, string>>>> = {
  none: { "--radius": "0px", "--radius-small": "0px", "--radius-medium": "0px", "--radius-large": "0px", "--radius-xlarge": "0px" },
  sm: { "--radius": "0.375rem", "--radius-small": "2px", "--radius-medium": "4px", "--radius-large": "0.375rem", "--radius-xlarge": "10px" },
  md: {
    "--radius": "0.625rem",
    "--radius-small": "calc(0.625rem - 4px)",
    "--radius-medium": "calc(0.625rem - 2px)",
    "--radius-large": "0.625rem",
    "--radius-xlarge": "calc(0.625rem + 4px)",
  },
  lg: { "--radius": "1rem", "--radius-small": "12px", "--radius-medium": "14px", "--radius-large": "1rem", "--radius-xlarge": "20px" },
  // Controls (small/medium) become pills; surfaces stay readable rectangles
  // with a generous radius instead of turning into stadiums.
  full: { "--radius": "1.5rem", "--radius-small": "9999px", "--radius-medium": "9999px", "--radius-large": "1.5rem", "--radius-xlarge": "2rem" },
};

/** `--pages-density`: the multiplier of Box gap/padding and Section vertical padding. */
export const SITE_THEME_DENSITY_FACTOR: Readonly<Record<SiteThemeDensity, string>> = {
  compact: "0.75",
  default: "1",
  airy: "1.5",
};

/** `soft` = the kit's public `--surface-shadow` / `--elevated-shadow`. */
export const SITE_THEME_SHADOW_VALUES: Readonly<Record<SiteThemeShadow, Readonly<Record<string, string>>>> = {
  none: { "--surface-shadow": "none", "--elevated-shadow": "none" },
  soft: {
    "--surface-shadow": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    "--elevated-shadow": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
  strong: {
    "--surface-shadow": "0 4px 12px 0 rgb(0 0 0 / 0.16), 0 2px 4px -1px rgb(0 0 0 / 0.12)",
    "--elevated-shadow": "0 24px 48px -12px rgb(0 0 0 / 0.3), 0 8px 16px -8px rgb(0 0 0 / 0.2)",
  },
};

/** pages-service `DefaultSiteTheme().Fonts`. */
export const SITE_THEME_DEFAULT_FONTS: SiteThemeFonts = { heading: SITE_FONT_DEFAULT, body: SITE_FONT_DEFAULT };

const HEX = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;
}

function font(value: unknown): string {
  return siteFont(value)?.family ?? SITE_FONT_DEFAULT;
}

function scaleValue(spec: SiteThemeScaleSpec, value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= spec.min && value <= spec.max ? value : null;
}

function builtinStep(spec: SiteThemeScaleSpec, name: string): SiteThemeScaleStep | undefined {
  const key = name.toLowerCase();
  return spec.builtins.find((b) => b.name.toLowerCase() === key);
}

/**
 * A scale of a public answer, leniently (like every other field here): not an
 * array → the defaults; a step whose name breaks the rule or repeats another
 * (case-insensitively) is dropped, an added step with a value out of range too;
 * a built-in step keeps its CANONICAL spelling (`m` → `M`) and falls back to its
 * default value; a missing built-in comes back at its place among the built-ins
 * (pages-service `withBuiltins`); over the cap, the last added steps go.
 */
function parseScale(key: SiteThemeScaleKey, raw: unknown): SiteThemeScaleStep[] {
  const spec = SITE_THEME_SCALES[key];
  const out: SiteThemeScaleStep[] = [];
  const at = (name: string) => out.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item) || typeof item.name !== "string" || !SITE_THEME_SCALE_NAME.test(item.name)) continue;
      if (at(item.name) >= 0) continue;
      const builtin = builtinStep(spec, item.name);
      const value = scaleValue(spec, item.value) ?? builtin?.value;
      if (value === undefined) continue;
      out.push({ name: builtin?.name ?? item.name, value });
    }
  }
  spec.builtins.forEach((b, bi) => {
    if (at(b.name) >= 0) return;
    let index = 0;
    for (let j = bi - 1; j >= 0; j--) {
      const k = at(spec.builtins[j].name);
      if (k >= 0) {
        index = k + 1;
        break;
      }
    }
    out.splice(index, 0, { name: b.name, value: b.value });
  });
  while (out.length > SITE_THEME_MAX_SCALE_STEPS) {
    let last = out.length - 1;
    while (builtinStep(spec, out[last].name)) last--;
    out.splice(last, 1);
  }
  return out;
}

const LABEL_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** A label pages-service would store: trimmed, non-empty, no control characters, ≤ 64 characters. */
export function siteThemeColorLabelValid(label: unknown): label is string {
  if (typeof label !== "string") return false;
  const l = label.trim();
  return l !== "" && !LABEL_CONTROL.test(l) && [...l].length <= SITE_THEME_MAX_CUSTOM_COLOR_LABEL;
}

/**
 * Custom colours of a public answer, leniently: not an array → `[]`; an item
 * whose key breaks the rule, is reserved or repeats one before it (without
 * case) is dropped; a colour that is not `#rrggbb` drops the item too (there
 * is no default to fall back to); over the cap, the last ones go.
 */
function parseCustomColors(raw: unknown): SiteThemeCustomColor[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteThemeCustomColor[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= SITE_THEME_MAX_CUSTOM_COLORS) break;
    if (!isRecord(item) || !isThemeColorKey(item.key)) continue;
    const key = item.key;
    if (seen.has(key.toLowerCase())) continue;
    if (typeof item.light !== "string" || !HEX.test(item.light) || typeof item.dark !== "string" || !HEX.test(item.dark)) continue;
    seen.add(key.toLowerCase());
    const label = typeof item.label === "string" && item.label.trim() !== "" ? item.label.trim() : key;
    out.push({ key, label, light: item.light.toLowerCase(), dark: item.dark.toLowerCase() });
  }
  return out;
}

/**
 * The theme of a public answer, every field checked: not an object → `null`
 * (no theme published — render nothing); a field outside its enumeration or
 * a colour that is not `#rrggbb` → that field's default. Unknown keys are
 * ignored. `fonts` not an object → absent (no font rules); a family outside
 * the whitelist → Geist. `spacing` / `iconSize` → `parseScale` (the built-in
 * steps always there, in their canonical spelling).
 */
export function parseSiteTheme(raw: unknown): SiteTheme | null {
  if (!isRecord(raw)) return null;
  const colors = isRecord(raw.colors) ? raw.colors : {};
  const parsed = {} as Record<SiteThemeRole, SiteThemeColorPair>;
  for (const role of SITE_THEME_ROLES) {
    const pair = isRecord(colors[role]) ? colors[role] : {};
    const fallback = SITE_THEME_DEFAULT.colors[role];
    parsed[role] = { light: hex(pair.light, fallback.light), dark: hex(pair.dark, fallback.dark) };
  }
  return {
    colors: parsed,
    ...(isRecord(raw.fonts) ? { fonts: { heading: font(raw.fonts.heading), body: font(raw.fonts.body) } } : {}),
    typeScale: pick(SITE_THEME_TYPE_SCALES, raw.typeScale, SITE_THEME_DEFAULT.typeScale),
    radius: pick(SITE_THEME_RADII, raw.radius, SITE_THEME_DEFAULT.radius),
    density: pick(SITE_THEME_DENSITIES, raw.density, SITE_THEME_DEFAULT.density),
    shadow: pick(SITE_THEME_SHADOWS, raw.shadow, SITE_THEME_DEFAULT.shadow),
    spacing: parseScale("spacing", raw.spacing),
    iconSize: parseScale("iconSize", raw.iconSize),
    customColors: parseCustomColors(raw.customColors),
  };
}

/** WCAG 2.x relative luminance of a `#rrggbb` colour (pages-service `relativeLuminance`). */
function relativeLuminance(color: string): number {
  const channel = (i: number) => {
    const c = parseInt(color.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast of two `#rrggbb` colours, 1 to 21 (pages-service `ContrastRatio`). */
export function siteThemeContrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal text (pages-service `MinContrastAA`). */
export const SITE_THEME_MIN_CONTRAST = 4.5;

/**
 * Text-on-fill pairs that must hold AA in both sets, foreground first
 * (pages-service `contrastPairs`); `primaryForeground` on `primary` is the
 * primary button.
 */
export const SITE_THEME_CONTRAST_PAIRS: readonly (readonly [SiteThemeRole, SiteThemeRole])[] = [
  ["text", "background"],
  ["textMuted", "background"],
  ["primaryForeground", "primary"],
  ["text", "surface"],
  ["textMuted", "surface"],
  ["text", "muted"],
];

const PRESET_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * The strict check pages-service runs before it stores a theme
 * (`SiteTheme.Validate`, SDL-772), field by field: `[]` = valid, otherwise one
 * message per field (`colors.text.dark: …`). Unlike `parseSiteTheme`, nothing
 * falls back to a default — this is for themes the product itself ships (the
 * presets) and for checking an edit before it is sent. Colours must already be
 * `#rrggbb` (the service also takes `#rgb` and normalises; ours never send it).
 */
export function validateSiteTheme(raw: unknown): string[] {
  if (!isRecord(raw)) return ["theme: expected an object"];
  const errors: string[] = [];
  const colors = isRecord(raw.colors) ? raw.colors : {};
  const valid: Record<string, string> = {};
  for (const role of SITE_THEME_ROLES) {
    const pair = isRecord(colors[role]) ? colors[role] : {};
    for (const side of ["light", "dark"] as const) {
      const value = pair[side];
      if (typeof value === "string" && HEX.test(value)) valid[`${role}.${side}`] = value.toLowerCase();
      else errors.push(`colors.${role}.${side}: expected #rrggbb, got ${JSON.stringify(value)}`);
    }
  }
  const fonts = isRecord(raw.fonts) ? raw.fonts : {};
  for (const field of ["heading", "body"] as const) {
    if (!siteFont(fonts[field])) errors.push(`fonts.${field}: ${JSON.stringify(fonts[field])} is not in the whitelist`);
  }
  const enums: [string, readonly string[]][] = [
    ["typeScale", SITE_THEME_TYPE_SCALES],
    ["radius", SITE_THEME_RADII],
    ["density", SITE_THEME_DENSITIES],
    ["shadow", SITE_THEME_SHADOWS],
  ];
  for (const [field, allowed] of enums) {
    const value = raw[field];
    if (typeof value !== "string" || !allowed.includes(value)) errors.push(`${field}: ${JSON.stringify(value)} is not one of ${allowed.join("|")}`);
  }
  // Scales (SDL-949, pages-service `themeScale.validate`). Absent — the key
  // missing or `null` — is valid: the service reads `null` as no key (a nil
  // `*ThemeScalePatch` in a PATCH, `withBuiltins` → the defaults on a stored
  // theme), fills a stored theme without them with the defaults on read, and a
  // patch without them leaves them as they are. Present → checked whole.
  for (const key of SITE_THEME_SCALE_KEYS) {
    const steps = raw[key];
    if (steps === undefined || steps === null) continue;
    if (!Array.isArray(steps)) {
      errors.push(`${key}: expected an array of {name, value}`);
      continue;
    }
    const spec = SITE_THEME_SCALES[key];
    const seen = new Set<string>();
    steps.forEach((step: unknown, i: number) => {
      const field = `${key}[${i}]`;
      const name = isRecord(step) ? step.name : undefined;
      const value = isRecord(step) ? step.value : undefined;
      if (typeof name !== "string" || !SITE_THEME_SCALE_NAME.test(name)) {
        errors.push(`${field}.name: ${JSON.stringify(name)} is not a step name (letters, digits, - and _, up to 16)`);
      } else if (seen.has(name.toLowerCase())) {
        errors.push(`${field}.name: ${JSON.stringify(name)} repeats`);
      } else {
        seen.add(name.toLowerCase());
      }
      if (scaleValue(spec, value) === null) errors.push(`${field}.value: ${JSON.stringify(value)} px is outside ${spec.min}–${spec.max}`);
    });
    for (const b of spec.builtins) {
      if (!seen.has(b.name.toLowerCase())) errors.push(`${key}: the built-in step ${JSON.stringify(b.name)} is missing`);
    }
    if (steps.length > SITE_THEME_MAX_SCALE_STEPS) errors.push(`${key}: at most ${SITE_THEME_MAX_SCALE_STEPS} steps, got ${steps.length}`);
  }
  // Custom colours (SDL-950, pages-service `validateCustomColors`). Absent or
  // `null` is valid (the service reads it as `[]` / no change); present → whole.
  const custom = raw.customColors;
  if (custom !== undefined && custom !== null) {
    if (!Array.isArray(custom)) {
      errors.push("customColors: expected an array of {key, label, light, dark}");
    } else {
      const seen = new Set<string>();
      custom.forEach((c: unknown, i: number) => {
        const field = `customColors[${i}]`;
        const item = isRecord(c) ? c : {};
        if (!isThemeColorKey(item.key)) {
          errors.push(`${field}.key: ${JSON.stringify(item.key)} is not a colour key (a lowercase Latin letter, then Latin letters, digits, - and _, up to 32; not a role or a reserved word)`);
        } else if (seen.has(item.key.toLowerCase())) {
          errors.push(`${field}.key: ${JSON.stringify(item.key)} repeats`);
        } else {
          seen.add(item.key.toLowerCase());
        }
        if (!siteThemeColorLabelValid(item.label)) errors.push(`${field}.label: a label of 1–${SITE_THEME_MAX_CUSTOM_COLOR_LABEL} characters, no control characters`);
        for (const side of ["light", "dark"] as const) {
          const v = item[side];
          if (typeof v !== "string" || !HEX.test(v)) errors.push(`${field}.${side}: expected #rrggbb, got ${JSON.stringify(v)}`);
        }
      });
      if (custom.length > SITE_THEME_MAX_CUSTOM_COLORS) errors.push(`customColors: at most ${SITE_THEME_MAX_CUSTOM_COLORS}, got ${custom.length}`);
    }
  }
  if (raw.preset !== undefined && raw.preset !== "" && (typeof raw.preset !== "string" || !PRESET_ID.test(raw.preset))) {
    errors.push(`preset: ${JSON.stringify(raw.preset)} is not a preset id`);
  }
  for (const side of ["light", "dark"] as const) {
    for (const [fg, bg] of SITE_THEME_CONTRAST_PAIRS) {
      const a = valid[`${fg}.${side}`];
      const b = valid[`${bg}.${side}`];
      if (!a || !b) continue;
      const ratio = siteThemeContrast(a, b);
      if (ratio < SITE_THEME_MIN_CONTRAST) errors.push(`colors.${fg}.${side}: contrast ${ratio.toFixed(2)}:1 on ${bg} is below ${SITE_THEME_MIN_CONTRAST}:1`);
    }
  }
  return errors;
}

/** The colour variables of one set (`light` on the root, `dark` on a dark band). */
export function siteThemeColorVariables(theme: SiteTheme, mode: "light" | "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of SITE_THEME_ROLES) {
    for (const name of SITE_THEME_ROLE_VARIABLES[role]) out[name] = theme.colors[role][mode];
  }
  return { ...out, ...siteThemeCustomColorVariables(theme.customColors, mode) };
}

/**
 * `--pages-color-<key>` of each custom colour (SDL-950) for one mode: only
 * keys of the rule and `#rrggbb` values, the first of a key wins.
 */
export function siteThemeCustomColorVariables(
  colors: readonly SiteThemeCustomColor[] | undefined,
  mode: "light" | "dark"
): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const c of colors ?? []) {
    if (!isThemeColorKey(c?.key) || seen.has(c.key.toLowerCase())) continue;
    const value = c[mode];
    if (typeof value !== "string" || !HEX.test(value)) continue;
    seen.add(c.key.toLowerCase());
    out[`${THEME_COLOR_VARIABLE_PREFIX}${c.key}`] = value.toLowerCase();
  }
  return out;
}

/**
 * The scale variables (SDL-949): `--pages-space-<name>` = the step × density,
 * `--pages-icon-<name>` = the step in px. A step that breaks the name rule, the
 * range or repeats a name is never written, whatever built the theme.
 */
export function siteThemeScaleVariables(theme: Pick<SiteTheme, "spacing" | "iconSize">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SITE_THEME_SCALE_KEYS) {
    const spec = SITE_THEME_SCALES[key];
    const seen = new Set<string>();
    for (const step of theme[key] ?? []) {
      if (typeof step?.name !== "string" || !SITE_THEME_SCALE_NAME.test(step.name)) continue;
      const value = scaleValue(spec, step.value);
      if (value === null || seen.has(step.name.toLowerCase())) continue;
      seen.add(step.name.toLowerCase());
      out[`${spec.prefix}${step.name}`] = key === "spacing" ? `calc(${value}px * var(--pages-density))` : `${value}px`;
    }
  }
  return out;
}

/** Every variable the root gets: light colours, radius, shadow, density, type scale, scales. */
export function siteThemeRootVariables(theme: SiteTheme): Record<string, string> {
  const out: Record<string, string> = {
    ...siteThemeColorVariables(theme, "light"),
    ...SITE_THEME_RADIUS_VALUES[theme.radius],
    ...SITE_THEME_SHADOW_VALUES[theme.shadow],
    "--pages-density": SITE_THEME_DENSITY_FACTOR[theme.density],
  };
  const sizes = SITE_THEME_TYPE_SCALE_SIZES[theme.typeScale];
  for (const level of SITE_THEME_TEXT_LEVELS) out[`--pages-text-${level}`] = sizes[level];
  Object.assign(out, siteThemeScaleVariables(theme));
  if (theme.fonts) {
    out["--pages-font-heading"] = siteFontStack(siteFont(theme.fonts.heading)!);
    out["--pages-font-body"] = siteFontStack(siteFont(theme.fonts.body)!);
    // The kit's `font-sans` utility reads this one (globals.css `--font-sans`).
    out["--font-geist-sans"] = "var(--pages-font-body)";
  }
  return out;
}

/** The theme's families, heading first, without repeats. */
function themeFonts(theme: SiteTheme): SiteFont[] {
  if (!theme.fonts) return [];
  const heading = siteFont(theme.fonts.heading)!;
  const body = siteFont(theme.fonts.body)!;
  return heading === body ? [heading] : [heading, body];
}

/** Where the faces are set: the page's text and its headings. */
export const SITE_THEME_FONT_RULES = "body{font-family:var(--pages-font-body)}\nh1,h2,h3,h4,h5,h6{font-family:var(--pages-font-heading)}";

export type SiteThemeFontPreload = { href: string; family: string; weight: number };

/**
 * The faces worth a `<link rel="preload" as="font">`: the heading family at
 * 700 and the body family at 400, Latin subset — exactly two files (one when
 * the families and weights coincide), never the whole whitelist. Empty without
 * `fonts`.
 */
export function siteThemeFontPreloads(raw: unknown, base: string = SITE_FONTS_BASE): SiteThemeFontPreload[] {
  const theme = parseSiteTheme(raw);
  if (!theme?.fonts) return [];
  const heading = siteFont(theme.fonts.heading)!;
  const body = siteFont(theme.fonts.body)!;
  const out: SiteThemeFontPreload[] = [
    { href: siteFontFile(heading, "latin", 700, base), family: heading.family, weight: 700 },
    { href: siteFontFile(body, "latin", 400, base), family: body.family, weight: 400 },
  ];
  return out.filter((p, i) => out.findIndex((q) => q.href === p.href) === i);
}

/**
 * Where the dark set applies: the kit's own `.dark` scope (a Section with
 * `background: "dark"` carries the class, so the kit's `dark:` variants
 * switch with it) and the band's attribute. Under `:root` so it outranks the
 * kit's `.dark` block (0,2,0 against 0,1,0) whatever the sheet order.
 */
export const SITE_THEME_DARK_SELECTOR = ':root .dark, :root [data-background="dark"]';

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `${selector}{${body}}`;
}

export type SiteThemeCssOptions = {
  /**
   * Where the font files are served; `null` = no font rules at all (the Studio
   * canvas: the admin's host does not serve the site's fonts). Default `/fonts`.
   */
  fontsBase?: string | null;
};

/**
 * The page's theme stylesheet, or `null` when there is no theme to apply
 * (`raw` is absent or not an object). Throws if the sheet would carry `<` or
 * `\` — impossible by construction, guarded anyway.
 */
export function siteThemeCss(raw: unknown, options: SiteThemeCssOptions = {}): string | null {
  const parsed = parseSiteTheme(raw);
  if (!parsed) return null;
  const base = options.fontsBase === undefined ? SITE_FONTS_BASE : options.fontsBase;
  const theme: SiteTheme = base === null ? { ...parsed, fonts: undefined } : parsed;
  const faces = base === null ? [] : themeFonts(theme).flatMap((f) => siteFontFaces(f, base));
  const css = [
    ...faces,
    block(":root", siteThemeRootVariables(theme)),
    block(SITE_THEME_DARK_SELECTOR, siteThemeColorVariables(theme, "dark")),
    ...(theme.fonts ? [SITE_THEME_FONT_RULES] : []),
  ].join("\n");
  if (/[<\\]/.test(css)) throw new Error("siteThemeCss: refused a sheet with markup characters");
  return css;
}

/**
 * Only the custom colours' variables (SDL-950) — light on the root, dark on a
 * dark band — or `null` when there are none. For a canvas drawn WITHOUT the
 * site theme (the page editor's, SDL-950 review): the element that holds a
 * colour key paints the colour the theme draft gives it, and nothing else of
 * the theme reaches the canvas.
 */
export function siteThemeCustomColorCss(colors: readonly SiteThemeCustomColor[] | undefined): string | null {
  const light = siteThemeCustomColorVariables(colors, "light");
  if (Object.keys(light).length === 0) return null;
  const css = [block(":root", light), block(SITE_THEME_DARK_SELECTOR, siteThemeCustomColorVariables(colors, "dark"))].join("\n");
  if (/[<\\]/.test(css)) throw new Error("siteThemeCustomColorCss: refused a sheet with markup characters");
  return css;
}

/** The attribute of the `<style>` element that carries the custom colours only. */
export const SITE_THEME_CUSTOM_COLORS_STYLE_ATTR = "data-pages-theme-colors";

/** The custom colours' `<style>` element (see `siteThemeCustomColorCss`), or `null` without any. */
export function SiteThemeCustomColorStyle({
  colors,
}: {
  colors?: readonly SiteThemeCustomColor[];
}): React.ReactElement | null {
  const css = siteThemeCustomColorCss(colors);
  return css === null ? null : React.createElement("style", { [SITE_THEME_CUSTOM_COLORS_STYLE_ATTR]: "" }, css);
}

/** The attribute of the `<style>` element that carries the theme. */
export const SITE_THEME_STYLE_ATTR = "data-pages-theme";

/**
 * The theme's `<style>` element, or `null` without a theme. A plain `<style>`
 * (no `precedence`) is not hoisted by React: it lands where it is drawn — the
 * top of the site's page, or the canvas frame's own document.
 */
export function SiteThemeStyle({ theme, fontsBase }: { theme?: unknown } & SiteThemeCssOptions): React.ReactElement | null {
  const css = siteThemeCss(theme, { fontsBase });
  return css === null ? null : React.createElement("style", { [SITE_THEME_STYLE_ATTR]: "" }, css);
}
