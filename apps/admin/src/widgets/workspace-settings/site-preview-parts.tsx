"use client";

import * as React from "react";
import { ImageIcon } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import {
  DENSITY_PX,
  fontStack,
  isHeadingLevel,
  levelSize,
  roleColor,
  themeVars,
  type SiteTheme,
  type TextLevel,
} from "@/entities/site-theme";

/**
 * A client SITE drawn from theme tokens — SDL-771, EP-160.
 *
 * Shared by both canvases of the epic: the live preview of the Site theme tab
 * and the page under the Studio inspector. It is the mock-up of what the
 * renderer task (EP-160 step 3) builds for real, and it works the way the
 * shaping says the real one will: the theme re-values the KIT's CSS
 * variables on the page root (`themeVars`), a section set to `dark` re-values
 * them again with the dark set, and kit components inside (`Button`, `Table`)
 * repaint without a line of their own colour.
 *
 * The colours here are therefore not «canvas colours» — they are the theme's
 * data, applied as runtime values through inline style, which is the one
 * place the admin allows inline style. Nothing in this file names a colour.
 *
 * Every size is in px × `zoom`: the theme tab shows the page in a narrow
 * column, the inspector at full width. Headings are also capped by the
 * container width (`cqi`), so a large display line wraps instead of pushing
 * the page sideways at 390.
 */

type Vars = Record<string, string>;

const ThemeContext = React.createContext<{ theme: SiteTheme; zoom: number }>({
  theme: {} as SiteTheme,
  zoom: 1,
});

function useSiteTheme() {
  return React.useContext(ThemeContext);
}

/** The page root: theme variables, page background, body face. */
export function ThemeScope({
  theme,
  zoom = 1,
  children,
  testid,
  className,
}: {
  theme: SiteTheme;
  zoom?: number;
  children: React.ReactNode;
  testid?: string;
  className?: string;
}) {
  const style = {
    ...themeVars(theme, "light"),
    background: "var(--background)",
    color: "var(--foreground)",
    fontFamily: "var(--font-sans)",
  } as React.CSSProperties;
  return (
    <ThemeContext.Provider value={{ theme, zoom }}>
      <div
        data-testid={testid}
        data-heading-font={theme.fonts.heading}
        data-body-font={theme.fonts.body}
        className={["@container min-w-0 overflow-hidden", className]
          .filter(Boolean)
          .join(" ")}
        style={style}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/* ---------------------------------------------------------------- Section */

export const SECTION_BACKGROUNDS = ["default", "muted", "primary", "dark"] as const;
export const SECTION_WIDTHS = ["narrow", "default", "wide", "full"] as const;
export type SectionBackground = (typeof SECTION_BACKGROUNDS)[number];
export type SectionWidth = (typeof SECTION_WIDTHS)[number];

/**
 * Content width of a section. In px at zoom 1, and never wider than a share
 * of the page — a narrow preview would otherwise show four equal widths.
 */
const SECTION_WIDTH: Record<SectionWidth, { px: number; share: number }> = {
  narrow: { px: 560, share: 62 },
  default: { px: 760, share: 78 },
  wide: { px: 1040, share: 92 },
  full: { px: 0, share: 100 },
};

/**
 * Variables a section puts on itself.
 *
 * `dark` re-values the kit variables with the DARK set of every role — that
 * is the whole of «dark is a property of the section» (EP-160 decision: no
 * visitor dark mode in v1). `primary` paints the band with primary and
 * swaps the pair, so a primary button inside stays visible: the shaping is
 * silent here, this is the canvas's minimal reading.
 */
function sectionVars(theme: SiteTheme, background: SectionBackground): Vars {
  if (background === "dark") {
    return { ...themeVars(theme, "dark"), background: "var(--background)" };
  }
  if (background === "primary") {
    const primary = roleColor(theme, "primary", "light");
    const onPrimary = roleColor(theme, "primaryForeground", "light");
    return {
      "--foreground": onPrimary,
      "--muted-foreground": onPrimary,
      "--primary": onPrimary,
      "--primary-foreground": primary,
      "--ring": onPrimary,
      background: primary,
    };
  }
  return {
    background: background === "muted" ? "var(--muted)" : "var(--background)",
  };
}

export function SiteSection({
  background = "default",
  width = "default",
  align = "left",
  children,
  testid,
  ...rest
}: {
  background?: SectionBackground;
  width?: SectionWidth;
  align?: "left" | "center";
  children: React.ReactNode;
  testid?: string;
} & Omit<React.ComponentProps<"section">, "style">) {
  const { theme, zoom } = useSiteTheme();
  const density = DENSITY_PX[theme.density];
  const w = SECTION_WIDTH[width];
  const style = {
    ...sectionVars(theme, background),
    color: "var(--foreground)",
    paddingBlock: `${Math.round(density.section * zoom)}px`,
    paddingInline: width === "full" ? "0px" : `${Math.round(24 * zoom)}px`,
    textAlign: align,
  } as React.CSSProperties;
  return (
    <section
      data-testid={testid}
      data-background={background}
      data-width={width}
      style={style}
      {...rest}
    >
      <div
        style={{
          maxWidth:
            width === "full"
              ? "100%"
              : `min(${Math.round(w.px * zoom)}px, ${w.share}%)`,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: align === "center" ? "center" : "stretch",
          gap: `${Math.round(density.gap * zoom)}px`,
        }}
      >
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- Text */

export const TEXT_COLORS = ["default", "muted", "primary", "inverse"] as const;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const TEXT_WEIGHTS = ["normal", "medium", "bold"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export type TextWeight = (typeof TEXT_WEIGHTS)[number];

const TEXT_COLOR_VAR: Record<TextColor, string> = {
  default: "var(--foreground)",
  muted: "var(--muted-foreground)",
  primary: "var(--primary)",
  // Shaping is silent on «inverse»: read as «the page's own background
  // colour», i.e. light text in a dark band, dark text in a light one.
  inverse: "var(--background)",
};

const WEIGHT: Record<TextWeight, number> = { normal: 400, medium: 500, bold: 700 };

/** Container-width cap per level, so display wraps instead of overflowing. */
const CAP_CQI: Partial<Record<TextLevel, number>> = {
  display: 13,
  h1: 10,
  h2: 8,
};

export function SiteText({
  level = "body",
  color = "default",
  align,
  weight,
  children,
  testid,
  ...rest
}: {
  level?: TextLevel;
  color?: TextColor;
  align?: TextAlign;
  weight?: TextWeight;
  children: React.ReactNode;
  testid?: string;
} & Omit<React.ComponentProps<"p">, "style" | "color">) {
  const { theme, zoom } = useSiteTheme();
  const heading = isHeadingLevel(level);
  const px = levelSize(theme.typeScale, level, zoom);
  const cap = CAP_CQI[level];
  const Tag: "h1" | "h2" | "h3" | "p" =
    level === "display" || level === "h1"
      ? "h1"
      : level === "h2" || level === "h3"
        ? level
        : "p";
  return (
    <Tag
      data-testid={testid}
      data-level={level}
      style={{
        margin: 0,
        fontFamily: heading ? fontStack(theme.fonts.heading) : "var(--font-sans)",
        fontSize: cap ? `min(${px}px, ${cap}cqi)` : `${px}px`,
        lineHeight: heading ? 1.1 : 1.5,
        letterSpacing: level === "display" ? "-0.02em" : undefined,
        fontWeight: WEIGHT[weight ?? (heading ? "bold" : "normal")],
        color: TEXT_COLOR_VAR[color],
        textAlign: align,
        overflowWrap: "anywhere",
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------- Box */

export const BOX_COLUMNS = [1, 2, 3, 4] as const;
export const BOX_BACKGROUNDS = ["none", "surface", "muted"] as const;
export const BOX_RADII = ["theme", "none"] as const;
export type BoxColumns = (typeof BOX_COLUMNS)[number];
export type BoxBackground = (typeof BOX_BACKGROUNDS)[number];
export type BoxRadius = (typeof BOX_RADII)[number];

/**
 * Equal columns, stacked on a phone. «Phone» is the width of the page, not
 * of the admin window: the container query reads the site's root, so the
 * mini page in a narrow preview stacks exactly as the real site would.
 * The step is `@sm` (24rem): the inspector's phone frame (375px) and the
 * preview on a 390px screen (~350px) stack, the scaled desktop preview of the
 * theme tab (~414px at 1440) keeps its columns. `@xs` (20rem) let a phone
 * frame keep two columns.
 * Literal class strings — the admin sheet compiles only what it can read.
 */
const COLUMN_CLASS: Record<BoxColumns, string> = {
  1: "grid grid-cols-1",
  2: "grid grid-cols-1 @sm:grid-cols-2",
  3: "grid grid-cols-1 @sm:grid-cols-3",
  4: "grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-4",
};

export function SiteBox({
  columns = 1,
  background = "none",
  border = false,
  radius = "theme",
  children,
  testid,
  ...rest
}: {
  columns?: BoxColumns;
  background?: BoxBackground;
  border?: boolean;
  radius?: BoxRadius;
  children: React.ReactNode;
  testid?: string;
} & Omit<React.ComponentProps<"div">, "style">) {
  const { theme, zoom } = useSiteTheme();
  const density = DENSITY_PX[theme.density];
  const framed = background !== "none" || border;
  return (
    <div
      data-testid={testid}
      data-columns={columns}
      className={COLUMN_CLASS[columns]}
      style={{
        gap: `${Math.round(density.gap * zoom)}px`,
        padding: framed ? `${Math.round(density.pad * zoom)}px` : undefined,
        background:
          background === "surface"
            ? "var(--card)"
            : background === "muted"
              ? "var(--muted)"
              : undefined,
        border: border ? "1px solid var(--border)" : undefined,
        borderRadius: radius === "theme" ? "var(--radius-large)" : "0px",
        boxShadow: background === "surface" ? "var(--surface-shadow)" : undefined,
        textAlign: "left",
        minWidth: 0,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Image */

export const IMAGE_RADII = ["theme", "none", "full"] as const;
export type ImageRadius = (typeof IMAGE_RADII)[number];
/**
 * The `aspect` values the inspector and the catalog offer — the four of the
 * shaping, in its order (owner, 11 Oct 2026). The engine's Image keeps all
 * seven (`packages/engine/src/core/primitives.ts`); 3 / 2, 3 / 4 and 9 / 16
 * stay valid in a stored page, they are just not offered.
 */
export const IMAGE_ASPECTS = ["auto", "1 / 1", "4 / 3", "16 / 9"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

/** A picture placeholder: the canvas has no files, so the frame is the point. */
export function SiteImage({
  aspect = "4 / 3",
  radius = "theme",
  testid,
  ...rest
}: {
  aspect?: ImageAspect;
  radius?: ImageRadius;
  testid?: string;
} & Omit<React.ComponentProps<"div">, "style">) {
  return (
    <div
      data-testid={testid}
      data-radius={radius}
      role="img"
      aria-label="Photo placeholder"
      style={{
        aspectRatio: aspect === "auto" ? "3 / 2" : aspect,
        borderRadius:
          radius === "theme"
            ? "var(--radius-large)"
            : radius === "full"
              ? "9999px"
              : "0px",
        background:
          "linear-gradient(135deg, var(--muted) 0%, var(--border) 55%, var(--muted-foreground) 140%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted-foreground)",
        overflow: "hidden",
        width: "100%",
      }}
      {...rest}
    >
      <ImageIcon size={28} aria-hidden="true" />
    </div>
  );
}

/* -------------------------------------------------------------- TableView */

/**
 * TableView through the kit's own Table — the real compound renders the
 * kit's table, so the flags are classes on top of it, not a second table.
 */
export function SiteTable({
  rows,
  header = true,
  bordered = false,
  striped = false,
  compact = false,
  testid,
  ...rest
}: {
  rows: readonly (readonly string[])[];
  header?: boolean;
  bordered?: boolean;
  striped?: boolean;
  compact?: boolean;
  testid?: string;
} & Omit<React.ComponentProps<"div">, "style">) {
  const [head, ...body] = header ? rows : [null, ...rows];
  const cell = [
    compact ? "px-2 py-1" : "px-3 py-2",
    bordered ? "border border-border" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      data-testid={testid}
      data-bordered={bordered}
      data-striped={striped}
      data-compact={compact}
      className="min-w-0"
      {...rest}
    >
      <UI.Table className={bordered ? "border-collapse" : undefined}>
        {head ? (
          <UI.Table.Header>
            <UI.Table.Row>
              {head.map((value) => (
                <UI.Table.Head key={value} className={cell}>
                  {value}
                </UI.Table.Head>
              ))}
            </UI.Table.Row>
          </UI.Table.Header>
        ) : null}
        <UI.Table.Body>
          {body.map((row, index) =>
            row ? (
              <UI.Table.Row
                key={index}
                className={striped && index % 2 === 1 ? "bg-muted" : undefined}
              >
                {row.map((value, i) => (
                  <UI.Table.Cell key={i} className={cell}>
                    {value}
                  </UI.Table.Cell>
                ))}
              </UI.Table.Row>
            ) : null
          )}
        </UI.Table.Body>
      </UI.Table>
    </div>
  );
}

/* ----------------------------------------------------------------- Button */

export function SiteButton({
  variant = "default",
  children,
  testid,
}: {
  variant?: "default" | "outline";
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <UI.Button
      size="sm"
      variant={variant}
      data-testid={testid}
      type="button"
      tabIndex={-1}
    >
      {children}
    </UI.Button>
  );
}
