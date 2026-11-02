"use client";

// Editors of the style props of the first-wave Elements (SDL-775, EP-160),
// after the inspector canvas (/design-system/site-theme/inspector,
// apps/admin/src/app/design-system/_canvas/site-theme-inspector-parts.tsx):
// a short enumeration is a joined row (`SegmentedEditor`, as the canvas
// draws every style enum), Box columns 1–4 too, and Image aspect offers the
// four values of the shaping only. Keyed by Element type, so a kit component
// with a prop of the same name keeps its own editor.

import { z } from "zod";

import { IMAGE_ASPECTS, IMAGE_OFFERED_ASPECTS, BOX_COLUMNS_MAX, BOX_COLUMNS_MIN } from "@markerloop/engine";

import { EnumEditor, SegmentedEditor } from "./builtin-editors";
import type { PropEditor } from "./types";

const COLUMN_VALUES = Array.from({ length: BOX_COLUMNS_MAX - BOX_COLUMNS_MIN + 1 }, (_, i) => String(BOX_COLUMNS_MIN + i)) as [
  string,
  ...string[],
];

/** Box.columns: a number in the page, a segmented row of 1–4 in the panel; pressing the pressed one clears it. */
export const BoxColumnsEditor: PropEditor = (ctx) =>
  SegmentedEditor({
    ...ctx,
    zodSchema: z.enum(COLUMN_VALUES),
    value: typeof ctx.value === "number" ? String(ctx.value) : undefined,
    onChange: (next) => ctx.onChange(typeof next === "string" ? Number(next) : undefined),
  });

/**
 * Image.aspect: the four offered values; a stored node with one of the other
 * three (3 / 2, 3 / 4, 9 / 16 stay valid) keeps it listed, so the select
 * shows what is on the page instead of a blank.
 */
export const ImageAspectEditor: PropEditor = (ctx) => {
  const current = typeof ctx.value === "string" ? ctx.value : undefined;
  const offered: string[] = [...IMAGE_OFFERED_ASPECTS];
  if (current && !offered.includes(current) && (IMAGE_ASPECTS as readonly string[]).includes(current)) offered.push(current);
  return EnumEditor({ ...ctx, zodSchema: z.enum(offered as [string, ...string[]]) });
};

/** A custom colour of the site theme as the panel offers it (SDL-950). */
export type ThemeColorOption = { key: string; label: string; color: string };

/**
 * A colour prop (Section.background, Text.color, Box.background) with the site theme's custom
 * colours (SDL-950): the built-in values as the segmented row, the theme's
 * own colours as swatches under it. A swatch writes the colour's KEY; pressing
 * the pressed one clears the prop, like a segment. A stored key the theme no
 * longer has presses nothing (the page draws the default).
 */
export function themeColorEditor(colors: readonly ThemeColorOption[]): PropEditor {
  return (ctx) => {
    const segmented = SegmentedEditor(ctx);
    if (colors.length === 0) return segmented;
    return (
      <div className="flex flex-col gap-2">
        {segmented}
        <div role="group" aria-label="Theme colours" className="flex flex-wrap" style={{ gap: 8 }} data-sauna-theme-colors={ctx.fieldName}>
          {colors.map((c) => {
            const pressed = ctx.value === c.key;
            return (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={pressed}
                disabled={ctx.disabled}
                data-theme-color={c.key}
                onClick={() => ctx.onChange(pressed ? undefined : c.key)}
                className="cursor-pointer border border-border"
                style={{
                  // The assembled studio's `.sw` (1 Nov 2026): 26 × 26, corner 7, gap 8.
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  padding: 0,
                  background: c.color,
                  boxShadow: pressed ? "0 0 0 2px var(--background, #fff), 0 0 0 3.5px #008ed0" : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
    );
  };
}

/** The colour props that take a theme colour key (SDL-950), per Element type. */
export const THEME_COLOR_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Section: ["background"],
  Text: ["color"],
  Box: ["background"],
};

/** Per Element type: field → editor. A host's own `editors` still win. */
export const STYLE_EDITORS: Readonly<Record<string, Readonly<Record<string, PropEditor>>>> = {
  Section: { background: SegmentedEditor, width: SegmentedEditor },
  Text: { color: SegmentedEditor, align: SegmentedEditor, weight: SegmentedEditor },
  Box: { columns: BoxColumnsEditor, background: SegmentedEditor, radius: SegmentedEditor },
  Image: { aspect: ImageAspectEditor, radius: SegmentedEditor },
};
