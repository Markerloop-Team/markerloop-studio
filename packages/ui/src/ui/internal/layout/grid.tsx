import * as React from "react";

import { cn } from "../utils/cn";

export type GridMinItemWidth = 178 | 200 | 240;

export type GridProps = React.ComponentProps<"div"> & {
  gap?: 0 | 2 | 3 | 4 | 6 | 8;
} & (
    | {
        columns?: 1 | 2 | 3 | 4;
        mdColumns?: 1 | 2 | 3 | 4;
        lgColumns?: 1 | 2 | 3 | 4;
        minItemWidth?: never;
      }
    | {
        /**
         * Auto-fill track sizing: as many `minmax(Xpx,1fr)` columns as fit.
         * Mutually exclusive with `columns`/`mdColumns`/`lgColumns` — the
         * track count comes from the container width, not a breakpoint.
         */
        minItemWidth: GridMinItemWidth;
        columns?: never;
        mdColumns?: never;
        lgColumns?: never;
      }
  );

export const GAP_CLASS: Record<string, string> = {
  "0": "gap-0",
  "2": "gap-2",
  "3": "gap-3",
  "4": "gap-4",
  "6": "gap-6",
  "8": "gap-8",
};

// Why every track count is written as a breakpoint variant and never as a
// bare `grid-cols-N` (SDL-153, same mechanism as SDL-114):
//
// A consumer loads `sunday-sauna/ui/styles.css` and then its own compiled
// Tailwind. The second sheet re-declares every utility the host itself
// writes. Two *different* class names targeting one property are resolved by
// source order — a media query adds no specificity — so the host's late copy
// of `.grid-cols-N` beat our earlier `.md:grid-cols-M` and the grid stopped
// being responsive at every width. Which prop combination breaks depends on
// the host's class usage, i.e. on code we don't control.
//
// The three ranges below are therefore mutually exclusive media queries.
// Nothing here is unguarded, and no two of them are ever live at once, so
// sheet order cannot decide anything:
//
//   max-md:      → @media not all and (min-width:48rem)   (<768px)
//   md:max-lg:   → 768px … 1023px  (only when lgColumns narrows the top end)
//   md:          → ≥768px          (when there is no lgColumns)
//   lg:          → ≥1024px
export const COLS_CLASS: Record<string, string> = {
  "1": "max-md:grid-cols-1",
  "2": "max-md:grid-cols-2",
  "3": "max-md:grid-cols-3",
  "4": "max-md:grid-cols-4",
};

export const MD_COLS_CLASS: Record<string, string> = {
  "1": "md:grid-cols-1",
  "2": "md:grid-cols-2",
  "3": "md:grid-cols-3",
  "4": "md:grid-cols-4",
};

/**
 * `md:` capped at the `lg:` breakpoint. Used instead of {@link MD_COLS_CLASS}
 * whenever `lgColumns` is set, so the medium and large rules do not overlap
 * either — an overlap would put `md:` and `lg:` back into an order race the
 * moment a host sheet happens to carry a copy of one of them.
 */
export const MD_MAX_LG_COLS_CLASS: Record<string, string> = {
  "1": "md:max-lg:grid-cols-1",
  "2": "md:max-lg:grid-cols-2",
  "3": "md:max-lg:grid-cols-3",
  "4": "md:max-lg:grid-cols-4",
};

export const LG_COLS_CLASS: Record<string, string> = {
  "1": "lg:grid-cols-1",
  "2": "lg:grid-cols-2",
  "3": "lg:grid-cols-3",
  "4": "lg:grid-cols-4",
};

// Auto-fill tracks (EP-32 inventory §4.3). Written out literally — the
// Tailwind scanner only sees classes that exist as string literals, same
// reason COLS_CLASS above is a spelled-out dictionary. The three widths are
// the closed list the screens actually use: insert cards (178), metric/asset
// cards (200), admin collection cards (240).
export const MIN_ITEM_WIDTH_CLASS: Record<string, string> = {
  "178": "[grid-template-columns:repeat(auto-fill,minmax(178px,1fr))]",
  "200": "[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]",
  "240": "[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]",
};

/**
 * The full, order-proof track-count class list for one grid element.
 *
 * Single source for both `Grid` and `Box variant="grid"`; they used to build
 * the list separately and drifted into the same bug twice.
 */
export function gridColumnsClasses(
  columns: 1 | 2 | 3 | 4 = 1,
  mdColumns?: 1 | 2 | 3 | 4,
  lgColumns?: 1 | 2 | 3 | 4
): (string | undefined)[] {
  // With no bare utility left, the ≥768px range has to be spelled out even
  // when the author only set `columns` — otherwise the element would carry a
  // track count below 768px and nothing above it.
  const md = mdColumns ?? columns;

  return [
    COLS_CLASS[String(columns)],
    lgColumns ? MD_MAX_LG_COLS_CLASS[String(md)] : MD_COLS_CLASS[String(md)],
    lgColumns ? LG_COLS_CLASS[String(lgColumns)] : undefined,
  ];
}

export function Grid({
  gap = 0,
  columns,
  mdColumns,
  lgColumns,
  minItemWidth,
  className,
  ...props
}: GridProps) {
  return (
    <div
      className={cn(
        "grid",
        GAP_CLASS[String(gap)],
        ...(minItemWidth
          ? [MIN_ITEM_WIDTH_CLASS[String(minItemWidth)]]
          : gridColumnsClasses(columns ?? 1, mdColumns, lgColumns)),
        className
      )}
      {...props}
    />
  );
}
