"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "../../internal/utils/cn";

/**
 * One tile of an admin grid (EP-186, layer 3 — screen patterns, pattern 2).
 *
 * The WHOLE surface is the control: a link when `href` is given, otherwise a
 * button. No nested "Open" button, no card that only looks clickable. Inside:
 * an optional media slot (a preview, an icon, a sample), the title with an
 * optional badge next to it, and muted meta values.
 *
 * Meta values carry no "label:" prefixes on screen — a value that needs a
 * name for assistive technology brings it as an `sr-only` span itself.
 *
 * Everything inside is phrasing content (`span`s), so the tile stays valid
 * both as `<a>` and as `<button>`.
 */
export type TileProps = Omit<React.HTMLAttributes<HTMLElement>, "title" | "children" | "onClick"> & {
  /** What the tile is called — the one line people scan. */
  title: React.ReactNode;
  /** Muted values under the title, in order (size, key, date…). */
  meta?: React.ReactNode[];
  /** Picture, sample or glyph above the title. */
  media?: React.ReactNode;
  /** A short mark next to the title (Public, Built-in, Edited). */
  badge?: React.ReactNode;
  /** The chosen tile of a picker / preset row: ring-2 ring-primary. */
  selected?: boolean;
  /** Navigation target: the tile renders as a link. */
  href?: string;
  /** Action of a button tile (ignored when `href` is set). */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** Button tile only. */
  disabled?: boolean;
};

const TILE_CLASS =
  "group/tile flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left text-card-foreground no-underline outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

export function Tile({
  title,
  meta,
  media,
  badge,
  selected = false,
  href,
  onClick,
  disabled,
  className,
  ...rest
}: TileProps) {
  const metaValues = (meta ?? []).filter((value) => value !== null && value !== undefined && value !== false);
  const body = (
    <>
      {media ? (
        <span data-slot="tile-media" className="block w-full min-w-0">
          {media}
        </span>
      ) : null}
      <span data-slot="tile-body" className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span data-slot="tile-title" className="min-w-0 truncate text-sm font-medium">
            {title}
          </span>
          {badge ? <span className="flex shrink-0 items-center">{badge}</span> : null}
        </span>
        {metaValues.length > 0 ? (
          <span data-slot="tile-meta" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {metaValues.map((value, index) => (
              <span key={index} className="min-w-0 break-words">
                {value}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </>
  );

  const classes = cn(TILE_CLASS, selected && "ring-2 ring-primary", className);

  if (href) {
    return (
      <Link
        href={href}
        data-slot="tile"
        data-selected={selected ? "true" : undefined}
        className={classes}
        onClick={onClick}
        {...rest}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-slot="tile"
      data-selected={selected ? "true" : undefined}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {body}
    </button>
  );
}

export type TileGridProps = React.ComponentProps<"div">;

/**
 * The one grid of tiles: as many columns as fit, never narrower than 240px
 * (or than the container, so a phone never scrolls sideways), 16px gaps.
 */
export function TileGrid({ className, ...props }: TileGridProps) {
  return (
    <div
      data-slot="tile-grid"
      className={cn(
        "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))]",
        className
      )}
      {...props}
    />
  );
}
