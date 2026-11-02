// Site theme presets (SDL-777, EP-160 step 8): ready themes for the typical
// businesses of Markerloop's clients — the one source of truth. The Site theme
// tab (SDL-776) offers them as cards, the `markerloop` MCP (SDL-778) as a list;
// both take `SITE_THEME_PRESETS` / `siteThemePreset(id)` from here and nothing
// else, so a preset is never re-typed in a second place.
//
// Every preset is a whole theme in pages-service's shape (SDL-772,
// `internal/models/theme.go`): 8 colour roles as light/dark `#rrggbb` pairs,
// `fonts` from the whitelist (./site-fonts.ts), the four tokens, and `preset`
// = its own id. The package tests hold each one to `validateSiteTheme` (the
// copy of pages-service `SiteTheme.Validate`): AA contrast (4.5:1) of the six
// text-on-surface pairs, primary button included, in light AND dark.
//
// Fonts: only families with Cyrillic AND every Kazakh letter (`kazakhMissing`
// empty) — clients' sites are in Russian and Kazakh, a preset must not hand
// them a face that falls back mid-word. The tests enforce it too.
//
// Labels are English (the admin's catalog translates them where they are
// shown); `id` is what lands in the theme's `preset` field — never rename one,
// published themes point at it.

import type { SiteTheme, SiteThemeFonts } from "./site-theme";

/**
 * A preset's theme: always with fonts, always naming its preset. No scales
 * (SDL-949): a preset is a look, and applying one must not reset the steps a
 * site added — the theme keeps its own `spacing` / `iconSize`.
 */
export type SiteThemePresetTheme = Omit<SiteTheme, "spacing" | "iconSize"> & { fonts: SiteThemeFonts; preset: string };

export type SiteThemePreset = {
  /** Lands in the theme's `preset`; pages-service `^[a-z0-9][a-z0-9_-]{0,63}$`. */
  id: string;
  /** Card title. */
  name: string;
  /** One line under the card: who the preset is for. */
  note: string;
  theme: SiteThemePresetTheme;
};

function preset(id: string, name: string, note: string, theme: Omit<SiteThemePresetTheme, "preset">): SiteThemePreset {
  return { id, name, note, theme: { ...theme, preset: id } };
}

/** The presets, in the order the tab shows them. */
export const SITE_THEME_PRESETS: readonly SiteThemePreset[] = [
  preset("minimal", "Minimal", "Any business: clean, neutral, lets content speak", {
    colors: {
      background: { light: "#ffffff", dark: "#09090b" },
      surface: { light: "#ffffff", dark: "#18181b" },
      muted: { light: "#f4f4f5", dark: "#27272a" },
      text: { light: "#18181b", dark: "#fafafa" },
      textMuted: { light: "#52525b", dark: "#a1a1aa" },
      primary: { light: "#18181b", dark: "#fafafa" },
      primaryForeground: { light: "#fafafa", dark: "#18181b" },
      border: { light: "#e4e4e7", dark: "#27272a" },
    },
    fonts: { heading: "Inter", body: "Inter" },
    typeScale: "default",
    radius: "md",
    density: "default",
    shadow: "soft",
  }),
  preset("cafe", "Warm café", "Cafés, bakeries, restaurants, saunas", {
    colors: {
      background: { light: "#fdf8f3", dark: "#1a120d" },
      surface: { light: "#ffffff", dark: "#241913" },
      muted: { light: "#f5ebe0", dark: "#30221a" },
      text: { light: "#2d1e15", dark: "#f7ede4" },
      textMuted: { light: "#6b5546", dark: "#c2ad9d" },
      primary: { light: "#a0441c", dark: "#f0956a" },
      primaryForeground: { light: "#ffffff", dark: "#1a120d" },
      border: { light: "#e8d9ca", dark: "#3b2b21" },
    },
    fonts: { heading: "Lora", body: "Nunito" },
    typeScale: "large",
    radius: "lg",
    density: "airy",
    shadow: "soft",
  }),
  preset("boutique", "Boutique", "Fashion, jewellery, flowers, beauty salons", {
    colors: {
      background: { light: "#fbf7f5", dark: "#161013" },
      surface: { light: "#ffffff", dark: "#20171b" },
      muted: { light: "#f3e9e5", dark: "#2c2025" },
      text: { light: "#2a1f24", dark: "#f6eef1" },
      textMuted: { light: "#6e5b63", dark: "#c3b0b8" },
      primary: { light: "#7a2e4a", dark: "#e8a3bc" },
      primaryForeground: { light: "#ffffff", dark: "#161013" },
      border: { light: "#e9dcd7", dark: "#3a2b31" },
    },
    fonts: { heading: "Cormorant Garamond", body: "Raleway" },
    typeScale: "large",
    radius: "none",
    density: "airy",
    shadow: "none",
  }),
  preset("tech", "Tech", "IT services, SaaS, agencies, online schools", {
    colors: {
      background: { light: "#ffffff", dark: "#0b1020" },
      surface: { light: "#f8fafc", dark: "#111831" },
      muted: { light: "#eef2f7", dark: "#1a2340" },
      text: { light: "#0f172a", dark: "#e8edf7" },
      textMuted: { light: "#475569", dark: "#9aa6bf" },
      primary: { light: "#2952e3", dark: "#7c9cff" },
      primaryForeground: { light: "#ffffff", dark: "#0b1020" },
      border: { light: "#e2e8f0", dark: "#243056" },
    },
    fonts: { heading: "IBM Plex Sans", body: "IBM Plex Sans" },
    typeScale: "compact",
    radius: "sm",
    density: "compact",
    shadow: "soft",
  }),
  preset("studio", "Studio", "Fitness, dance and photo studios, events", {
    colors: {
      background: { light: "#ffffff", dark: "#0e0e0e" },
      surface: { light: "#fafafa", dark: "#1a1a1a" },
      muted: { light: "#f2f2f2", dark: "#262626" },
      text: { light: "#111111", dark: "#f5f5f5" },
      textMuted: { light: "#595959", dark: "#a8a8a8" },
      primary: { light: "#c42a17", dark: "#ff7a5c" },
      primaryForeground: { light: "#ffffff", dark: "#0e0e0e" },
      border: { light: "#e3e3e3", dark: "#2e2e2e" },
    },
    fonts: { heading: "Oswald", body: "Rubik" },
    typeScale: "large",
    radius: "full",
    density: "default",
    shadow: "strong",
  }),
  preset("eco", "Eco", "Farms, organic shops, tourism, wellness", {
    colors: {
      background: { light: "#f8faf5", dark: "#10170f" },
      surface: { light: "#ffffff", dark: "#182217" },
      muted: { light: "#ecf1e4", dark: "#212d20" },
      text: { light: "#1c2a1b", dark: "#ecf3e8" },
      textMuted: { light: "#536150", dark: "#a9b8a4" },
      primary: { light: "#2e6b34", dark: "#8fd18f" },
      primaryForeground: { light: "#ffffff", dark: "#10170f" },
      border: { light: "#dbe3d0", dark: "#2b3a2a" },
    },
    fonts: { heading: "Merriweather", body: "Nunito Sans" },
    typeScale: "default",
    radius: "lg",
    density: "airy",
    shadow: "none",
  }),
  preset("clinic", "Clinic", "Clinics, dentists, legal and consulting services", {
    colors: {
      background: { light: "#f7fbfc", dark: "#0a1a1f" },
      surface: { light: "#ffffff", dark: "#10252c" },
      muted: { light: "#e6f2f4", dark: "#173139" },
      text: { light: "#0e2a33", dark: "#e6f4f7" },
      textMuted: { light: "#4a636b", dark: "#9db8bf" },
      primary: { light: "#0a6e7d", dark: "#5cc8d6" },
      primaryForeground: { light: "#ffffff", dark: "#0a1a1f" },
      border: { light: "#d4e5e9", dark: "#1f3d46" },
    },
    fonts: { heading: "Montserrat", body: "Open Sans" },
    typeScale: "default",
    radius: "md",
    density: "default",
    shadow: "soft",
  }),
];

/** The preset of that id, or `undefined` (an unknown or empty `preset`). */
export function siteThemePreset(id: unknown): SiteThemePreset | undefined {
  return typeof id === "string" ? SITE_THEME_PRESETS.find((p) => p.id === id) : undefined;
}

