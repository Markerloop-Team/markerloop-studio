// Components of the four primitives (SDL-630); their catalog half is
// `../core/primitives`. No hooks, no browser APIs — they render the same on
// the server and in the canvas.
//
// Each one spreads the props it does not consume onto its ROOT element: the
// renderer marks nodes with `data-sauna-node-id` through props in editable
// mode, and a primitive that swallowed it could not be selected on the
// canvas. Their look is inline style over the kit's tokens, not utility
// classes: the canvas frame drops the host's sheet, so only the kit's CSS
// variables are guaranteed to resolve there.

import * as React from "react";

import type { SaunaRegistry } from "./types";
import type {
  BoxBackground,
  BoxRadius,
  ImageAspect,
  ImageBorderColor,
  ImageRadius,
  ImageWidth,
  TextAlign,
  TextColor,
  TextLevel,
  TextWeight,
} from "../core/primitives";
import {
  BOX_BACKGROUNDS,
  TEXT_COLORS,
  themeColorVar,
  IMAGE_FIXED_WIDTH_DEFAULT,
  IMAGE_FIXED_WIDTH_MAX,
  IMAGE_FIXED_WIDTH_MIN,
  IMAGE_FOCUS_MAX,
  IMAGE_FOCUS_MIN,
  IMAGE_WIDTHS,
} from "../core/primitives";
import { isSafeUrl, isUrlPropName } from "../core/safe-url";

type PassThrough = Omit<React.HTMLAttributes<HTMLElement>, "color">;

/**
 * A value of an enumeration table, only for the table's OWN keys: a stored
 * `"constructor"` / `"__proto__"` / `"toString"` must not reach the style as
 * a function or an object from the prototype (SDL-775 review).
 */
function pick<T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}
type Children = { children?: React.ReactNode };

// Sizes read the site theme's type scale (SDL-773, `--pages-text-<level>` on
// the page's root); without a theme the fallback is the size as before.
//
// The three largest levels are also capped by the width (SDL-775 verify): the
// theme's size is the ceiling, `cqi` the cap — the same rule and the same caps
// as the approved canvas (`SiteText` in the admin's site-preview-parts.tsx),
// so a display line on a 390px phone shrinks instead of running past its
// column. With no size container above, `cqi` is the viewport's width, i.e.
// the page's. At 1440 the cap is far above every theme size, so desktop text
// keeps exactly the token. `overflowWrap: anywhere` (also the canvas's) breaks
// a single word that is still wider than its column instead of letting the
// page root clip its last letters. The smaller levels keep their fixed size
// and the root's clip (SDL-769 pins an unbreakable body line being clipped).
const fit = (size: string, cqi: number): React.CSSProperties => ({
  fontSize: `min(${size}, ${cqi}cqi)`,
  overflowWrap: "anywhere",
});
const TEXT_STYLE: Record<TextLevel, React.CSSProperties> = {
  // SDL-775: the step above h1, drawn as an <h1>.
  display: {
    ...fit("var(--pages-text-display, 3.5rem)", 13),
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    margin: "0 0 0.5em",
  },
  h1: { ...fit("var(--pages-text-h1, 2.25rem)", 10), fontWeight: 700, lineHeight: 1.15, margin: "0 0 0.5em" },
  h2: { ...fit("var(--pages-text-h2, 1.75rem)", 8), fontWeight: 600, lineHeight: 1.2, margin: "0 0 0.5em" },
  h3: { fontSize: "var(--pages-text-h3, 1.25rem)", fontWeight: 600, lineHeight: 1.3, margin: "0 0 0.5em" },
  lead: { fontSize: "var(--pages-text-lead, 1.125rem)", margin: "0 0 0.75em" },
  body: { fontSize: "var(--pages-text-body, 1rem)", margin: "0 0 0.75em" },
  caption: { fontSize: "var(--pages-text-caption, 0.8125rem)", color: "var(--muted-foreground)", margin: "0 0 0.5em" },
};

// Roles of the site theme (SDL-775). `default` adds nothing: the text keeps
// the colour it has anyway (inherited from its band, or the level's own).
// `inverse` is the page background colour — light text on a dark fill.
// A custom theme colour key (SDL-950) paints `var(--pages-color-<key>)`; a key
// the theme does not have falls back to the level's own colour (or inherits).
const TEXT_COLOR: Record<(typeof TEXT_COLORS)[number], string | undefined> = {
  default: undefined,
  muted: "var(--muted-foreground)",
  primary: "var(--primary)",
  inverse: "var(--background)",
};
const levelColor = (level: TextLevel): string | undefined => {
  const c = (TEXT_STYLE[level] ?? TEXT_STYLE.body).color;
  return typeof c === "string" ? c : undefined;
};
const TEXT_WEIGHT: Record<TextWeight, number> = { normal: 400, medium: 500, bold: 700 };

export type TextProps = Children &
  PassThrough & { level?: TextLevel; text?: string; color?: TextColor; align?: TextAlign; weight?: TextWeight };

export function Text({ level = "body", text, color, align, weight, children, style, ...rest }: TextProps): React.ReactElement {
  const Tag = level === "display" ? "h1" : level === "h1" || level === "h2" || level === "h3" ? level : "p";
  // Only what is set goes into the style: a node without these props renders
  // byte for byte as before (the engine's render parity snapshot).
  const own: React.CSSProperties = {};
  const tint = pick(TEXT_COLOR, color) ?? themeColorVar(color, levelColor(level));
  if (tint) own.color = tint;
  if (align && (align === "left" || align === "center" || align === "right")) own.textAlign = align;
  const heft = pick(TEXT_WEIGHT, weight);
  if (heft !== undefined) own.fontWeight = heft;
  return (
    <Tag style={{ ...(TEXT_STYLE[level] ?? TEXT_STYLE.body), ...own, ...style }} {...rest}>
      {children ?? text}
    </Tag>
  );
}

export type ImageProps = PassThrough & {
  src?: string;
  alt?: string;
  fit?: React.CSSProperties["objectFit"];
  /** The frame's shape, a CSS `aspect-ratio`; `auto` = the picture's own (SDL-769). */
  aspect?: ImageAspect;
  /** Corners (SDL-775): the theme's, square, or round. Absent = as before. */
  radius?: ImageRadius;
  /** Focus point in % (SDL-951), drawn as `object-position`. Absent = the centre, as before. */
  focus?: { x: number; y: number };
  /** fill / hug / fixed (SDL-951). Absent = as before. */
  width?: ImageWidth;
  /** px for `width: "fixed"`. */
  fixedWidth?: number;
  /** A 1px border in a theme role's colour (SDL-951). */
  border?: boolean;
  borderColor?: ImageBorderColor;
  /** The theme's shadow (SDL-951). */
  shadow?: boolean;
};

const IMAGE_RADIUS: Record<ImageRadius, string> = {
  theme: "var(--radius-large, var(--radius))",
  none: "0px",
  full: "9999px",
};

// Theme role → its own kit variable, the first of `SITE_THEME_ROLE_VARIABLES`
// in `@markerloop/studio` (SDL-951). Only variables, never a colour.
const IMAGE_BORDER_COLOR: Record<ImageBorderColor, string> = {
  background: "var(--background)",
  surface: "var(--card)",
  muted: "var(--muted)",
  text: "var(--foreground)",
  textMuted: "var(--muted-foreground)",
  primary: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  border: "var(--border)",
};

/** The theme's lifted shadow (`shadow` of the site theme paints it; none without a theme). */
const IMAGE_SHADOW = "var(--elevated-shadow, none)";

const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/**
 * The SDL-951 props as style, only what is set and valid: a node without them
 * (or with a value outside the schema) gets an empty object, so it renders
 * byte for byte as before. `empty` = the no-`src` frame, which has no width of
 * its own to hug: there `hug` keeps the frame's full width.
 */
function imageLook(
  p: Pick<ImageProps, "focus" | "width" | "fixedWidth" | "border" | "borderColor" | "shadow">,
  empty: boolean
): React.CSSProperties {
  const own: React.CSSProperties = {};
  if (p.width === "fixed") {
    own.width = `${inRange(p.fixedWidth, IMAGE_FIXED_WIDTH_MIN, IMAGE_FIXED_WIDTH_MAX) && Number.isInteger(p.fixedWidth) ? p.fixedWidth : IMAGE_FIXED_WIDTH_DEFAULT}px`;
  } else if (p.width === "fill") {
    own.width = "100%";
  } else if (p.width === "hug" && !empty) {
    own.width = "auto";
  }
  if (!empty && p.focus && typeof p.focus === "object") {
    const { x, y } = p.focus;
    if (inRange(x, IMAGE_FOCUS_MIN, IMAGE_FOCUS_MAX) && inRange(y, IMAGE_FOCUS_MIN, IMAGE_FOCUS_MAX)) {
      own.objectPosition = `${x}% ${y}%`;
    }
  }
  if (p.border === true) own.border = `1px solid ${pick(IMAGE_BORDER_COLOR, p.borderColor) ?? IMAGE_BORDER_COLOR.border}`;
  if (p.shadow === true) own.boxShadow = IMAGE_SHADOW;
  return own;
}

/**
 * With no `src` it draws its own empty frame instead of an `<img>`: a node
 * fresh from the catalog has no address yet, and an `<img>` without one is a
 * broken-image glyph (with `src=""`, a request for the page itself).
 *
 * Never wider than its container (`max-width: 100%`), and it shrinks with its
 * row (`min-width: 0`): three 1600px pictures in one row `Box` share the row
 * instead of the first taking it all and the page root clipping the others
 * (SDL-769 review r2). What keeps a small picture its size beside long text is
 * the row, not the picture: a row `Box` that holds a picture gives its text
 * and box children `flex: 1 1 0%` (see `Box`), so they take the space left
 * over instead of claiming their whole one-line width and squeezing the
 * picture (a 200px logo shrank to ~20px, review r1).
 *
 * `fit` needs a frame of its own shape to show: with `aspect` set the `<img>`
 * IS that frame (full width, the chosen proportions) and `object-fit` places
 * the picture in it. With `auto` the box has the picture's proportions and
 * cover/contain/fill look the same — which is why `fit` "did nothing".
 */
export function Image({
  src,
  alt = "",
  fit = "cover",
  aspect = "auto",
  radius,
  focus,
  width,
  fixedWidth,
  border,
  borderColor,
  shadow,
  style,
  ...rest
}: ImageProps): React.ReactElement {
  const framed = aspect !== "auto";
  const corner = pick(IMAGE_RADIUS, radius);
  const look = imageLook({ focus, width, fixedWidth, border, borderColor, shadow }, !src);
  // `width` and `border` are also HTML attributes: a stored node with a raw
  // `width: 300` / `border: 1` (not a value of the SDL-951 schema) keeps
  // reaching the element as an attribute, exactly as before the props existed.
  if (width !== undefined && !(IMAGE_WIDTHS as readonly unknown[]).includes(width)) {
    (rest as Record<string, unknown>).width = width;
  }
  if (border !== undefined && typeof border !== "boolean") (rest as Record<string, unknown>).border = border;
  if (!src) {
    return (
      <div
        role="img"
        aria-label={alt || "Image"}
        data-pages-primitive="image-empty"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          aspectRatio: framed ? aspect : "16 / 9",
          border: "1px dashed var(--border)",
          borderRadius: corner ?? "var(--radius)",
          background: "var(--muted)",
          color: "var(--muted-foreground)",
          ...look,
          ...style,
        }}
        {...rest}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{
        display: "block",
        // Shrinks with its row, never past it: pictures wider than the row
        // share it rather than being clipped (SDL-769). Its text neighbours
        // yield first — the row rule in `Box`.
        ...(framed ? { width: "100%", aspectRatio: aspect } : null),
        maxWidth: "100%",
        minWidth: 0,
        height: "auto",
        objectFit: fit,
        ...(corner ? { borderRadius: corner } : null),
        ...look,
        ...style,
      }}
      {...rest}
    />
  );
}

const BOX_ALIGN: Record<string, React.CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

/** Marks a row `Box` for `BOX_ROW_RULE`. */
export const BOX_ROW_ATTR = "data-pages-row";

/**
 * A row that holds a picture lets the picture keep its size and makes its
 * text yield (SDL-769). In a flex row every item starts at its content width
 * and all shrink in proportion to it, so a long paragraph (one-line width
 * ~10 000px) squeezed a 200px logo to ~20px. With `flex-shrink: 1000` the
 * text and box children give up width first (down to their own minimum, the
 * longest word) and the picture keeps its size; pictures wider than the row
 * still shrink among themselves (`Image` is `min-width: 0`). Nothing grows:
 * where the row has room every child keeps its content width, as before —
 * `flex: 1 1 0%` stretched a column of buttons from 92 to 1064px and pushed
 * a button beside a short heading to the row's far end (review r3).
 *
 * Only text (`Text` draws p/h1/h2/h3) and `Box` children, only in a row with
 * an `<img>`: buttons and links keep their own shrink, a row without a
 * picture lays out exactly as before.
 *
 * A `<style>` inside the row, not inline style: the row does not know which
 * of its children are pictures (the renderer may wrap them in boundaries and
 * refs), the DOM does. Plain `<style>` with no `precedence` is not hoisted by
 * React, so it lands in whichever document the row is drawn into — the
 * canvas iframe included — and it is `display: none`, not a flex item.
 */
export const BOX_ROW_RULE = `[${BOX_ROW_ATTR}]:has(> img) > :is(p, h1, h2, h3, [data-pages-primitive="box"]) { flex-shrink: 1000; }`;

/** Marks a `Box` with equal columns for `BOX_COLUMNS_RULE`; the value is the count. */
export const BOX_COLUMNS_ATTR = "data-pages-columns";

/**
 * Equal columns, stacked on a phone (SDL-775). A media query, so it needs a
 * `<style>` (inline style has none); like `BOX_ROW_RULE` it is the box's first
 * child, `display: none`, and not a grid item. Below 640px every count is one
 * column; four columns go through two (640–1023px) to four (1024px and up).
 * The canvas iframe has the device's width, so its Phone preview stacks too.
 */
export const BOX_COLUMNS_RULE =
  `[${BOX_COLUMNS_ATTR}]{grid-template-columns:minmax(0,1fr)}` +
  `@media (min-width:640px){[${BOX_COLUMNS_ATTR}="2"],[${BOX_COLUMNS_ATTR}="4"]{grid-template-columns:repeat(2,minmax(0,1fr))}[${BOX_COLUMNS_ATTR}="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}}` +
  `@media (min-width:1024px){[${BOX_COLUMNS_ATTR}="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}}`;

// A custom theme colour key (SDL-950): `var(--pages-color-<key>)`, transparent
// (= `none`) when the theme does not have it.
const BOX_BACKGROUND: Record<(typeof BOX_BACKGROUNDS)[number], React.CSSProperties | null> = {
  none: null,
  surface: { background: "var(--card)", color: "var(--card-foreground)", boxShadow: "var(--surface-shadow, none)" },
  muted: { background: "var(--muted)" },
};

export type BoxProps = Children &
  PassThrough & {
    direction?: "column" | "row";
    /** In quarters of a rem, like the kit's spacing scale. */
    gap?: number;
    padding?: number;
    align?: "start" | "center" | "end" | "stretch";
    /** 1–4 equal columns (SDL-775); absent = the flex column/row as before. */
    columns?: number;
    background?: BoxBackground;
    border?: boolean;
    radius?: BoxRadius;
  };

export function Box({
  direction = "column",
  gap = 4,
  padding = 4,
  align = "stretch",
  columns,
  background,
  border,
  radius,
  children,
  style,
  ...rest
}: BoxProps): React.ReactElement {
  const cols =
    typeof columns === "number" && Number.isInteger(columns) && columns >= 1 && columns <= 4 ? columns : undefined;
  const row = direction === "row" && cols === undefined;
  const custom = pick(BOX_BACKGROUND, background) === undefined ? themeColorVar(background) : undefined;
  const fill = pick(BOX_BACKGROUND, background) ?? (custom ? { background: custom } : null);
  const framed = !!fill || border === true;
  const corner = radius === "none" ? "0px" : radius === "theme" || framed ? "var(--radius-large, var(--radius))" : undefined;
  return (
    <div
      data-pages-primitive="box"
      {...(row ? { [BOX_ROW_ATTR]: "" } : null)}
      {...(cols !== undefined ? { [BOX_COLUMNS_ATTR]: String(cols) } : null)}
      style={{
        ...(cols !== undefined
          ? { display: "grid" }
          : { display: "flex", flexDirection: direction === "row" ? "row" : "column" }),
        // Density (SDL-773): the site theme's `--pages-density` scales both;
        // without a theme the factor is 1 and the spacing is as before.
        gap: `calc(${gap * 0.25}rem * var(--pages-density, 1))`,
        padding: `calc(${padding * 0.25}rem * var(--pages-density, 1))`,
        alignItems: BOX_ALIGN[align] ?? "stretch",
        ...fill,
        ...(border === true ? { border: "1px solid var(--border)" } : null),
        ...(corner ? { borderRadius: corner } : null),
        ...style,
      }}
      {...rest}
    >
      {/* The <style> is the row's first child: :first-child / :nth-child of its children shift by one. */}
      {row ? <style>{BOX_ROW_RULE}</style> : null}
      {cols !== undefined ? <style>{BOX_COLUMNS_RULE}</style> : null}
      {children}
    </div>
  );
}

export type LinkProps = Children &
  PassThrough & {
    text?: string;
    href?: string;
    target?: "_self" | "_blank";
  };

/**
 * An `href` outside http(s)/mailto/tel/relative (SDL-681) is not written at
 * all — no `#` fallback, so a refused link reads as text, not as a link to the
 * top of the page. The renderer already drops it; this covers a direct use.
 * The rest props go first: a document cannot override `href`, nor the
 * `noopener noreferrer` a new tab gets.
 */
export function Link({ text, href, target = "_self", children, style, ...rest }: LinkProps): React.ReactElement {
  // `REL` / `Target` / `HREF` reach the DOM as written and an HTML parser
  // keeps the first of two same-named attributes: drop the non-canonical
  // spellings. Any other URL-like prop (`SRC`, `logoHref`) in any case passes
  // only with a safe value — names are compared case-insensitively.
  const own = Object.fromEntries(
    Object.entries(rest).filter(([k, v]) => {
      const l = k.toLowerCase();
      if (l === "rel" || l === "target") return k === "rel";
      if (l === "href") return false;
      return !isUrlPropName(k) || isSafeUrl(v, k);
    })
  ) as typeof rest;
  return (
    <a
      {...own}
      href={isSafeUrl(href, "href") ? href : undefined}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : own.rel}
      style={{ color: "var(--primary)", textDecoration: "underline", ...style }}
    >
      {children ?? text}
    </a>
  );
}

/** `type` → component for the four primitives; pair with `PRIMITIVE_BLOCKS`. */
export const PRIMITIVE_REGISTRY = { Text, Image, Box, Link } satisfies SaunaRegistry;
