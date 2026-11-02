/**
 * Site theme as data — SDL-771 (moved here from the canvas by SDL-776: the
 * live Site theme tab and the canvas read this one copy), epic EP-160 («Тема сайта и стилизация блоков»).
 *
 * The canvas is a mock-up: nothing here calls an API. But the SHAPE is not
 * invented — it is the contract pages-service ships in SDL-772
 * (`internal/models/theme.go`): eight colour roles as light/dark pairs, two
 * faces from the whitelist, type scale, radius, density, shadow and a preset
 * id. The default theme, the font whitelist and the six contrast pairs are
 * copied from there, so the screen the owner approves cannot promise a field
 * the service does not have. Drift is fixed here, not there.
 *
 * Token → pixel values (scale steps, radii, paddings, shadows) are NOT in the
 * shaping; they are the canvas's minimal reading and belong to the renderer
 * task (EP-160 step 3). The presets come from @markerloop/studio (SDL-777).
 */

import {
  SITE_THEME_MAX_CUSTOM_COLORS,
  SITE_THEME_MAX_CUSTOM_COLOR_LABEL,
  SITE_THEME_MAX_SCALE_STEPS,
  isSiteThemeColorKey,
  siteThemeColorLabelValid,
  SITE_THEME_PRESETS,
  SITE_THEME_SCALES,
  SITE_THEME_SCALE_KEYS,
  SITE_THEME_SCALE_NAME,
  siteThemeDefaultScale,
  type SiteThemeScaleKey,
  type SiteThemeScaleStep,
} from "@markerloop/studio";

export const COLOR_ROLES = [
  "background",
  "surface",
  "muted",
  "text",
  "textMuted",
  "primary",
  "primaryForeground",
  "border",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export const ROLE_INFO: Record<ColorRole, { label: string; hint: string }> = {
  background: { label: "Background", hint: "The page itself" },
  surface: { label: "Surface", hint: "Cards and boxes" },
  muted: { label: "Muted", hint: "Quiet bands and fills" },
  text: { label: "Text", hint: "Headings and body copy" },
  textMuted: { label: "Text muted", hint: "Captions and secondary copy" },
  primary: { label: "Primary", hint: "Buttons, links, accents" },
  primaryForeground: { label: "On primary", hint: "Text on primary fills" },
  border: { label: "Border", hint: "Lines and outlines" },
};

export type Mode = "light" | "dark";
export type ColorPair = { light: string; dark: string };

export const TYPE_SCALES = ["compact", "default", "large"] as const;
export const RADII = ["none", "sm", "md", "lg", "full"] as const;
export const DENSITIES = ["compact", "default", "airy"] as const;
export const SHADOWS = ["none", "soft", "strong"] as const;

export type TypeScale = (typeof TYPE_SCALES)[number];
export type Radius = (typeof RADII)[number];
export type Density = (typeof DENSITIES)[number];
export type Shadow = (typeof SHADOWS)[number];

/** A custom colour — pages-service `ThemeCustomColor` (SDL-950): key for props, label for people, light/dark hex. */
export type CustomColor = { key: string; label: string; light: string; dark: string };

/** A named step of a theme scale, px — pages-service `ThemeScaleStep` (SDL-949). */
export type ScaleStep = SiteThemeScaleStep;

export type SiteTheme = {
  colors: Record<ColorRole, ColorPair>;
  fonts: { heading: string; body: string };
  typeScale: TypeScale;
  radius: Radius;
  density: Density;
  shadow: Shadow;
  /** Preset the theme started from; "" — none (the default look). */
  preset: string;
  /**
   * Named scales (SDL-949): spacing px before the density multiplier, icon
   * sizes px. The service always returns them. The Theme screen adds and
   * removes the theme's own steps (`addScaleStep` / `removeScaleStep`); the
   * built-ins are never removed. The PATCH sends the whole theme and an array
   * there REPLACES the scale, so the steps from GET go back as they are unless
   * edited. Optional: presets and the canvas mock-ups have none, and an absent
   * scale in a PATCH leaves it as it is.
   */
  spacing?: ScaleStep[];
  iconSize?: ScaleStep[];
  /**
   * Custom colours (SDL-950). The service always returns the list (`[]` for an
   * older theme); an array in the PATCH replaces it whole, so the list from
   * GET goes back as it is unless edited. Optional for the same reasons as the
   * scales: presets and mock-ups have none.
   */
  customColors?: CustomColor[];
};

/* ------------------------------------------------------------------ fonts */

export type FontCategory = "sans" | "serif" | "display" | "mono";

/** The whitelist of SDL-772 (`ThemeFonts`), same order, same categories. */
export const FONTS: readonly { family: string; category: FontCategory }[] = [
  { family: "Geist", category: "sans" },
  { family: "Inter", category: "sans" },
  { family: "Roboto", category: "sans" },
  { family: "Open Sans", category: "sans" },
  { family: "Montserrat", category: "sans" },
  { family: "Raleway", category: "sans" },
  { family: "Nunito", category: "sans" },
  { family: "Nunito Sans", category: "sans" },
  { family: "Rubik", category: "sans" },
  { family: "Manrope", category: "sans" },
  { family: "Noto Sans", category: "sans" },
  { family: "PT Sans", category: "sans" },
  { family: "Fira Sans", category: "sans" },
  { family: "IBM Plex Sans", category: "sans" },
  { family: "Source Sans 3", category: "sans" },
  { family: "Work Sans", category: "sans" },
  { family: "DM Sans", category: "sans" },
  { family: "Plus Jakarta Sans", category: "sans" },
  { family: "Lato", category: "sans" },
  { family: "Poppins", category: "sans" },
  { family: "Merriweather", category: "serif" },
  { family: "Lora", category: "serif" },
  { family: "Playfair Display", category: "serif" },
  { family: "PT Serif", category: "serif" },
  { family: "Noto Serif", category: "serif" },
  { family: "Source Serif 4", category: "serif" },
  { family: "EB Garamond", category: "serif" },
  { family: "Cormorant Garamond", category: "serif" },
  { family: "Oswald", category: "display" },
  { family: "Unbounded", category: "display" },
  { family: "JetBrains Mono", category: "mono" },
];

export const FONT_GROUPS: readonly { category: FontCategory; label: string }[] = [
  { category: "sans", label: "Sans serif" },
  { category: "serif", label: "Serif" },
  { category: "display", label: "Display" },
  { category: "mono", label: "Monospace" },
];

const FALLBACK: Record<FontCategory, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", ui-serif, serif',
  display: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

/**
 * CSS stack for a whitelisted face. The admin does not load the faces (the
 * site will, self-hosted — EP-160 step 4), so the mock-up falls back to a
 * system font of the same kind: serif stays serif, mono stays mono.
 */
export function fontStack(family: string): string {
  const category =
    FONTS.find((font) => font.family === family)?.category ?? "sans";
  return `"${family}", ${FALLBACK[category]}`;
}

/* ---------------------------------------------------------------- default */

/** `DefaultSiteTheme()` of SDL-772: today's look of a site, in hex. */
export const DEFAULT_THEME: SiteTheme = {
  colors: {
    background: { light: "#ffffff", dark: "#111111" },
    surface: { light: "#ffffff", dark: "#1e1e1e" },
    muted: { light: "#f5f5f5", dark: "#2a2a2a" },
    text: { light: "#111111", dark: "#fefefe" },
    // #767676, not the kit's #8f8f8f: the default must pass its own AA check.
    textMuted: { light: "#767676", dark: "#b5b5b5" },
    primary: { light: "#111111", dark: "#f5f5f5" },
    primaryForeground: { light: "#fefefe", dark: "#111111" },
    border: { light: "#e5e5e5", dark: "#292929" },
  },
  fonts: { heading: "Geist", body: "Geist" },
  typeScale: "default",
  radius: "md",
  density: "default",
  shadow: "soft",
  preset: "",
};

/* ---------------------------------------------------------------- presets */

export type Preset = {
  id: string;
  /** English card title; the screen shows `siteTheme.presets.items.<id>.name`. */
  name: string;
  /** One line under the card: who the preset is for (English, as `name`). */
  note: string;
  theme: SiteTheme;
};

/**
 * The real presets (SDL-777): `SITE_THEME_PRESETS` of @markerloop/studio is
 * the one source of truth, shared with the `markerloop` MCP — a preset is
 * never re-typed here. Assigned, not copied, so the type checker holds the
 * two shapes together: a field the studio adds or renames breaks this line.
 * Ids are what published themes store in `preset` — never rename one.
 *
 * There is no «Default» preset: `preset: ""` is the service's own default
 * look (`DEFAULT_THEME`), which belongs to no preset.
 */
export const PRESETS: readonly Preset[] = SITE_THEME_PRESETS;

/** The preset of that id; `""` (the default look) and an unknown id → none. */
export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

const cloneScale = (steps: readonly ScaleStep[]): ScaleStep[] =>
  steps.map((s) => ({ name: s.name, value: s.value }));

/**
 * A copy that shares nothing with its source — drafts are edited in place.
 * The scales go last, as pages-service orders them, so a theme from GET and
 * the same theme from the form serialise alike (the tab compares JSON).
 */
export function cloneTheme(theme: SiteTheme): SiteTheme {
  const { spacing, iconSize, customColors, ...rest } = theme;
  return {
    ...rest,
    fonts: { ...theme.fonts },
    colors: Object.fromEntries(
      COLOR_ROLES.map((role) => [role, { ...theme.colors[role] }])
    ) as Record<ColorRole, ColorPair>,
    ...(spacing ? { spacing: cloneScale(spacing) } : {}),
    ...(iconSize ? { iconSize: cloneScale(iconSize) } : {}),
    ...(customColors ? { customColors: customColors.map((c) => ({ ...c })) } : {}),
  };
}

/**
 * A preset applied to a draft: the preset's look, the draft's own scales. A
 * preset carries no scales (SDL-949) — steps the site added must survive it.
 */
export function applyPresetTheme(preset: SiteTheme, current: SiteTheme): SiteTheme {
  return cloneTheme({
    ...preset,
    ...(current.spacing ? { spacing: current.spacing } : {}),
    ...(current.iconSize ? { iconSize: current.iconSize } : {}),
    // Custom colours (SDL-950) are the site's own too: a preset has none.
    ...(current.customColors ? { customColors: current.customColors } : {}),
  });
}

/* ---------------------------------------------------------- custom colours */

export const MAX_CUSTOM_COLORS = SITE_THEME_MAX_CUSTOM_COLORS;
export const MAX_CUSTOM_COLOR_LABEL = SITE_THEME_MAX_CUSTOM_COLOR_LABEL;

/** A label the service stores (`validateCustomColors`): trimmed, 1–64 characters, no control characters. */
export const customColorLabelValid: (label: unknown) => label is string = siteThemeColorLabelValid;

/** The theme's custom colours; absent — none (as the service reads an older theme). */
export function customColors(theme: SiteTheme): CustomColor[] {
  return (theme.customColors ?? []).map((c) => ({ ...c }));
}

/**
 * A key for a new colour from its label (pages-service `ThemeCustomColorKeyRe`:
 * a lowercase Latin letter, then Latin letters, digits, - and _, up to 32):
 * «Brand blue» → `brandBlue`. A label with no Latin letters (Кириллица) or a
 * key that is reserved or taken → `color<N>`, the first free one.
 */
export function customColorKey(label: string, taken: readonly CustomColor[]): string {
  const used = new Set(taken.map((c) => c.key.toLowerCase()));
  const words = label.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  let key = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32);
  if (!isSiteThemeColorKey(key) || used.has(key.toLowerCase())) {
    let n = taken.length + 1;
    while (used.has(`color${n}`)) n++;
    key = `color${n}`;
  }
  return key;
}

/** Why a colour cannot join the theme — the screen names it in its locale. */
export type CustomColorError = "labelInvalid" | "hexInvalid" | "tooMany";

/** The service's rules for one added colour (`validateCustomColors`): label, two hexes, the cap. */
export function customColorError(
  colors: readonly CustomColor[],
  label: string,
  light: string,
  dark: string
): CustomColorError | null {
  if (colors.length >= MAX_CUSTOM_COLORS) return "tooMany";
  if (!siteThemeColorLabelValid(label)) return "labelInvalid";
  if (!normalizeHex(light) || !normalizeHex(dark)) return "hexInvalid";
  return null;
}

/** The list with a new colour last (its key from the label), hexes as the service stores them. */
export function addCustomColor(colors: readonly CustomColor[], c: Omit<CustomColor, "key">): CustomColor[] {
  const key = customColorKey(c.label, colors);
  return [
    ...colors.map((x) => ({ ...x })),
    { key, label: c.label.trim(), light: normalizeHex(c.light) ?? c.light, dark: normalizeHex(c.dark) ?? c.dark },
  ];
}

/** The list without the colour of that key. */
export function removeCustomColor(colors: readonly CustomColor[], key: string): CustomColor[] {
  return colors.filter((c) => c.key !== key).map((c) => ({ ...c }));
}

/**
 * «New» (owner, 1 Nov 2026): the colour as the draft has it is not in the
 * published theme — no published colour of that key, or one with another
 * light or dark value. The site paints it only after «Publish theme».
 */
export function isNewColor(draft: SiteTheme, published: SiteTheme | null | undefined, key: string): boolean {
  const c = customColors(draft).find((x) => x.key === key);
  if (!c) return false;
  const live = published ? customColors(published) : [];
  return !live.some(
    (x) => x.key === key && normalizeHex(x.light) === normalizeHex(c.light) && normalizeHex(x.dark) === normalizeHex(c.dark)
  );
}

/* ----------------------------------------------------------------- scales */

export type ScaleKey = SiteThemeScaleKey;
export const SCALE_KEYS = SITE_THEME_SCALE_KEYS;

/** The scale's limits as pages-service checks them (`themeScale.validate`). */
export function scaleLimits(key: ScaleKey): { min: number; max: number; maxSteps: number } {
  const spec = SITE_THEME_SCALES[key];
  return { min: spec.min, max: spec.max, maxSteps: SITE_THEME_MAX_SCALE_STEPS };
}

/** The steps of a theme's scale; absent or empty — the built-ins (as the service reads it). */
export function scaleSteps(theme: SiteTheme, key: ScaleKey): ScaleStep[] {
  const steps = theme[key];
  return steps && steps.length > 0 ? cloneScale(steps) : siteThemeDefaultScale(key);
}

/** A built-in step (case-insensitive, as the service compares names): never removed. */
export function isBuiltinStep(key: ScaleKey, name: string): boolean {
  const n = name.toLowerCase();
  return SITE_THEME_SCALES[key].builtins.some((b) => b.name.toLowerCase() === n);
}

/**
 * «New» on the Theme screen (owner, 1 Nov 2026): the step as the draft has it
 * is not in the published theme — the site does not have it until «Publish
 * theme». A step whose name is published with another value is new too (the
 * site still draws the old size). Nothing published yet → the published scale
 * is the built-ins. The name is part of a CSS variable, so it compares
 * exactly. A published step the draft removed is not drawn here (it is only in
 * the change list).
 */
export function isNewStep(
  draft: SiteTheme,
  published: SiteTheme | null | undefined,
  key: ScaleKey,
  name: string
): boolean {
  const step = scaleSteps(draft, key).find((s) => s.name === name);
  if (!step) return false;
  const live = published ? scaleSteps(published, key) : siteThemeDefaultScale(key);
  return !live.some((s) => s.name === name && s.value === step.value);
}

/** Why a new step cannot join the scale — the screen names it in its locale. */
export type ScaleStepError = "nameInvalid" | "nameTaken" | "valueInvalid" | "tooMany";

/**
 * The service's rules for one added step (pages-service `themeScale.validate`):
 * a name of letters, digits, `-` and `_` (up to 16, starts with a letter or
 * digit) that no other step has case-insensitively; an integer px within the
 * scale's range; at most 32 steps. `value` is what the person typed.
 */
export function scaleStepError(
  steps: readonly ScaleStep[],
  key: ScaleKey,
  name: string,
  value: string
): ScaleStepError | null {
  if (steps.length >= SITE_THEME_MAX_SCALE_STEPS) return "tooMany";
  const n = name.trim();
  if (!SITE_THEME_SCALE_NAME.test(n)) return "nameInvalid";
  if (steps.some((s) => s.name.toLowerCase() === n.toLowerCase())) return "nameTaken";
  const { min, max } = scaleLimits(key);
  const v = value.trim();
  if (!/^\d+$/.test(v)) return "valueInvalid";
  const px = Number(v);
  if (px < min || px > max) return "valueInvalid";
  return null;
}

/** The scale with the step added after the others (the service keeps added steps after the built-ins). */
export function addScaleStep(steps: readonly ScaleStep[], step: ScaleStep): ScaleStep[] {
  return [...cloneScale(steps), { name: step.name.trim(), value: step.value }];
}

/** The scale without a step of the theme's own; a built-in stays. */
export function removeScaleStep(steps: readonly ScaleStep[], key: ScaleKey, name: string): ScaleStep[] {
  if (isBuiltinStep(key, name)) return cloneScale(steps);
  return cloneScale(steps.filter((s) => s.name !== name));
}

/** Steps as the screen lists them: by size, the scale's order among equals. */
export function stepsBySize(steps: readonly ScaleStep[]): ScaleStep[] {
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.value - b.s.value || a.i - b.i)
    .map(({ s }) => s);
}

/* --------------------------------------------------------------- contrast */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

/** `NormalizeHex` of SDL-772: #rgb / #rrggbb → #rrggbb, lower case. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!HEX.test(v)) return null;
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const MIN_CONTRAST = 4.5;

/** `contrastPairs` of SDL-772: foreground role, background role. */
export const CONTRAST_PAIRS: readonly [ColorRole, ColorRole][] = [
  ["text", "background"],
  ["textMuted", "background"],
  ["primaryForeground", "primary"],
  ["text", "surface"],
  ["textMuted", "surface"],
  ["text", "muted"],
];

export type ContrastCheck = {
  fg: ColorRole;
  bg: ColorRole;
  mode: Mode;
  ratio: number;
  pass: boolean;
};

/** Every pair in both sets; a pair with an invalid hex is skipped, as there. */
export function contrastChecks(theme: SiteTheme): ContrastCheck[] {
  const out: ContrastCheck[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const [fg, bg] of CONTRAST_PAIRS) {
      const a = normalizeHex(theme.colors[fg][mode]);
      const b = normalizeHex(theme.colors[bg][mode]);
      if (!a || !b) continue;
      const ratio = contrastRatio(a, b);
      out.push({ fg, bg, mode, ratio, pass: ratio >= MIN_CONTRAST });
    }
  }
  return out;
}

/** Ratio as the service prints it: floored to two decimals. */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

/* ------------------------------------------------------------------- diff */

/** A field of the theme that differs, as data — the screen names it in its locale. */
export type ThemeChange =
  | { kind: "color"; role: ColorRole; mode: Mode }
  | { kind: "headingFont" | "bodyFont" | "typeScale" | "radius" | "density" | "shadow" | SiteThemeScaleKey | "customColors" };

/**
 * A scale as pages-service reads it: absent (a theme older than SDL-949, the
 * screen's DEFAULT_THEME) is the built-in steps. A step's name is part of a
 * CSS variable name, so names compare exactly, case included.
 */
function scaleKey(steps: readonly ScaleStep[] | undefined, key: SiteThemeScaleKey): string {
  const list = steps && steps.length > 0 ? steps : siteThemeDefaultScale(key);
  return JSON.stringify(list.map((s) => [s.name, s.value]));
}

/** The fields that differ between two themes, in the order of the form. */
export function themeChangeList(from: SiteTheme, to: SiteTheme): ThemeChange[] {
  const out: ThemeChange[] = [];
  for (const role of COLOR_ROLES) {
    for (const mode of ["light", "dark"] as const) {
      if (
        normalizeHex(from.colors[role][mode]) !==
        normalizeHex(to.colors[role][mode])
      ) {
        out.push({ kind: "color", role, mode });
      }
    }
  }
  if (from.fonts.heading !== to.fonts.heading) out.push({ kind: "headingFont" });
  if (from.fonts.body !== to.fonts.body) out.push({ kind: "bodyFont" });
  if (from.typeScale !== to.typeScale) out.push({ kind: "typeScale" });
  if (from.radius !== to.radius) out.push({ kind: "radius" });
  if (from.density !== to.density) out.push({ kind: "density" });
  if (from.shadow !== to.shadow) out.push({ kind: "shadow" });
  for (const key of SITE_THEME_SCALE_KEYS) {
    if (scaleKey(from[key], key) !== scaleKey(to[key], key)) out.push({ kind: key });
  }
  if (colorsKey(from) !== colorsKey(to)) out.push({ kind: "customColors" });
  return out;
}

/** Custom colours as compared: absent = `[]`, hexes normalised, order kept. */
function colorsKey(theme: SiteTheme): string {
  return JSON.stringify(
    customColors(theme).map((c) => [c.key, c.label.trim(), normalizeHex(c.light) ?? c.light, normalizeHex(c.dark) ?? c.dark])
  );
}

const CHANGE_LABEL: Record<Exclude<ThemeChange["kind"], "color">, string> = {
  headingFont: "Heading font",
  bodyFont: "Body font",
  typeScale: "Type scale",
  radius: "Radius",
  density: "Density",
  shadow: "Shadow",
  spacing: "Spacing scale",
  iconSize: "Icon sizes",
  customColors: "Custom colours",
};

/** Human names of the fields that differ (English) — the «what will change» line. */
export function themeChanges(from: SiteTheme, to: SiteTheme): string[] {
  return themeChangeList(from, to).map((c) =>
    c.kind === "color" ? `${ROLE_INFO[c.role].label} (${c.mode})` : CHANGE_LABEL[c.kind]
  );
}

/** Every colour of the theme is a hex pages-service accepts (`NormalizeHex`). */
export function themeHexValid(theme: SiteTheme): boolean {
  return (
    COLOR_ROLES.every(
      (role) =>
        normalizeHex(theme.colors[role].light) !== null &&
        normalizeHex(theme.colors[role].dark) !== null
    ) && customColors(theme).every((c) => normalizeHex(c.light) !== null && normalizeHex(c.dark) !== null)
  );
}

/**
 * The draft can go to the service: every colour parses (`themeHexValid`) and
 * every custom colour's name passes `customColorLabelValid` — an empty name or
 * one with a control character would only come back as a 422 while the user
 * is still typing (SDL-950 review).
 */
export function themeSendable(theme: SiteTheme): boolean {
  return themeHexValid(theme) && customColors(theme).every((c) => customColorLabelValid(c.label));
}

/**
 * The theme as pages-service stores it: every colour through `normalizeHex`
 * (#RGB → #rrggbb, spaces trimmed, lower case). A colour that does not parse
 * is left as typed — the service names it in its 422, the screen never
 * rejects more than the service does.
 */
export function normalizeTheme(theme: SiteTheme): SiteTheme {
  const out = cloneTheme(theme);
  for (const role of COLOR_ROLES) {
    for (const mode of ["light", "dark"] as const) {
      const n = normalizeHex(out.colors[role][mode]);
      if (n) out.colors[role][mode] = n;
    }
  }
  for (const c of out.customColors ?? []) {
    // The service trims the label; trimmed here too, so a trailing space never reads as unsaved.
    c.label = c.label.trim();
    c.light = normalizeHex(c.light) ?? c.light;
    c.dark = normalizeHex(c.dark) ?? c.dark;
  }
  return out;
}

/**
 * The theme is still exactly its preset (no «Edited» badge). A preset carries
 * no scales (SDL-949) and applying one keeps the draft's, so the scales are not
 * part of «still the preset».
 */
export function matchesPreset(theme: SiteTheme): boolean {
  const base = presetById(theme.preset);
  if (!base) return false;
  const scales: readonly string[] = [...SITE_THEME_SCALE_KEYS, "customColors"];
  return themeChangeList(base.theme, theme).every((c) => scales.includes(c.kind));
}

/* ----------------------------------------------------- tokens → CSS values */

/**
 * Scale steps. Body size and ratio per scale; every level is body × ratio^n.
 * Display is the new top step (EP-160: «Text не крупнее h1»).
 */
const SCALE: Record<TypeScale, { base: number; ratio: number }> = {
  compact: { base: 15, ratio: 1.2 },
  default: { base: 16, ratio: 1.25 },
  large: { base: 17, ratio: 1.333 },
};

export const TEXT_LEVELS = [
  "display",
  "h1",
  "h2",
  "h3",
  "lead",
  "body",
  "caption",
] as const;
export type TextLevel = (typeof TEXT_LEVELS)[number];

const LEVEL_STEP: Record<TextLevel, number> = {
  display: 6,
  h1: 4,
  h2: 3,
  h3: 2,
  lead: 1,
  body: 0,
  caption: -1,
};

/** Size in px for a level; `zoom` shrinks the mini page in a preview. */
export function levelSize(scale: TypeScale, level: TextLevel, zoom = 1): number {
  const { base, ratio } = SCALE[scale];
  return Math.round(base * ratio ** LEVEL_STEP[level] * zoom);
}

export function isHeadingLevel(level: TextLevel): boolean {
  return level === "display" || level === "h1" || level === "h2" || level === "h3";
}

export const RADIUS_PX: Record<Radius, { control: string; box: string }> = {
  none: { control: "0px", box: "0px" },
  sm: { control: "4px", box: "6px" },
  md: { control: "8px", box: "12px" },
  lg: { control: "12px", box: "18px" },
  full: { control: "9999px", box: "24px" },
};

export const DENSITY_PX: Record<Density, { section: number; gap: number; pad: number }> = {
  compact: { section: 24, gap: 8, pad: 12 },
  default: { section: 40, gap: 12, pad: 16 },
  airy: { section: 64, gap: 20, pad: 24 },
};

export const SHADOW_CSS: Record<Shadow, string> = {
  none: "none",
  soft: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  strong: "0 10px 15px -3px rgb(0 0 0 / 0.14), 0 4px 6px -4px rgb(0 0 0 / 0.14)",
};

/** A role's value, falling back to the default when the draft hex is broken. */
export function roleColor(theme: SiteTheme, role: ColorRole, mode: Mode): string {
  return (
    normalizeHex(theme.colors[role][mode]) ??
    DEFAULT_THEME.colors[role][mode]
  );
}

/**
 * The kit's CSS variables for one colour set. This is the whole mechanism of
 * the epic in one function: the site gets the kit's variables re-valued on
 * its root, so kit components inside repaint without being rewritten.
 */
export function themeVars(theme: SiteTheme, mode: Mode): Record<string, string> {
  const c = (role: ColorRole) => roleColor(theme, role, mode);
  const radius = RADIUS_PX[theme.radius];
  const colors: Record<string, string> = {
    "--background": c("background"),
    "--foreground": c("text"),
    "--card": c("surface"),
    "--card-foreground": c("text"),
    "--popover": c("surface"),
    "--popover-foreground": c("text"),
    "--muted": c("muted"),
    "--muted-foreground": c("textMuted"),
    "--secondary": c("muted"),
    "--secondary-foreground": c("text"),
    "--accent": c("muted"),
    "--accent-foreground": c("text"),
    "--primary": c("primary"),
    "--primary-foreground": c("primaryForeground"),
    "--border": c("border"),
    "--input": c("border"),
    "--ring": c("primary"),
  };
  // The kit's own utilities (`bg-primary` inside UI.Button) read
  // `--color-<token>`, which the kit's stylesheet resolves once on :root.
  // Re-valuing only `--primary` on a subtree leaves them painted with the
  // admin's colours, so every colour token is also re-valued as `--color-*`.
  // The renderer of SDL-773 has to do the same (or the kit has to move to
  // `@theme inline`), otherwise kit components on a site keep the admin's ink.
  const kitColors = Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [`--color-${name.slice(2)}`, value])
  );
  // Custom colours (SDL-950): `--pages-color-<key>`, what an Element's colour
  // prop with that key paints (the engine's `themeColorVar`).
  const custom: Record<string, string> = {};
  for (const c of customColors(theme)) {
    const v = normalizeHex(c[mode]);
    if (v && isSiteThemeColorKey(c.key)) custom[`--pages-color-${c.key}`] = v;
  }
  return {
    ...colors,
    ...kitColors,
    ...custom,
    "--radius-small": radius.control,
    "--radius-medium": radius.control,
    "--radius-large": radius.box,
    "--radius-xlarge": radius.box,
    "--surface-shadow": SHADOW_CSS[theme.shadow],
    "--font-sans": fontStack(theme.fonts.body),
  };
}
