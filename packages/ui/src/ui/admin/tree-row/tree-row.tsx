"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "../../internal/components/badge";
import { cn } from "../../internal/utils/cn";

/** Horizontal indent per tree depth level, px (D1 spec: 16px/level). */
const INDENT_PER_LEVEL = 16;

export type TreeRowProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Nesting depth; each level indents the row by 16px. */
  depth?: number;
  /** Type glyph rendered before the label (usually a lucide icon). */
  icon?: React.ReactNode;
  /** Row label. */
  label: React.ReactNode;
  /** Number of children; rendered as a counter badge when > 0. */
  childCount?: number;
  /** Row shows a chevron and toggles when it has expandable children. */
  expandable?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Selection highlight. */
  selected?: boolean;
  /**
   * 1-based ARIA depth. `depth` is the visual indent (0-based); assistive
   * tech reads `aria-level`, which the ARIA tree pattern defines as 1-based.
   * Defaults to `depth + 1` so callers that already pass `depth` get correct
   * semantics for free and only have to think about it when the two differ
   * (a virtualised tree that indents by column, say).
   */
  level?: number;
};

/**
 * A single presentational row of an admin tree (page outline, block
 * hierarchy). Pure view: expansion and selection state live in the host —
 * the row only reports the toggle. Not part of the schema catalog (D1).
 */
export function TreeRow({
  depth = 0,
  icon,
  label,
  childCount,
  expandable = false,
  expanded = false,
  onExpandedChange,
  selected = false,
  level,
  className,
  ...props
}: TreeRowProps) {
  return (
    <div
      data-slot="tree-row"
      data-selected={selected || undefined}
      role="treeitem"
      aria-selected={selected}
      aria-level={level ?? depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-sm select-none",
        "hover:bg-accent hover:text-accent-foreground",
        // Layer D (SDL-115): the row is the tree's keyboard target, so it
        // must paint a focus ring of its own — the browser's default outline
        // is suppressed on a `div[tabindex]` in several of the themes this
        // kit ships. `focus-visible`, never bare `focus:`: clicking a row is
        // how selection works, and a ring on every click reads as a bug.
        "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        selected && "bg-accent text-accent-foreground font-medium",
        className
      )}
      style={{ paddingLeft: 8 + depth * INDENT_PER_LEVEL }}
      {...props}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          onClick={(event) => {
            event.stopPropagation();
            onExpandedChange?.(!expanded);
          }}
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-90"
            )}
          />
        </button>
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
      {icon ? (
        <span
          data-slot="tree-row-icon"
          className="flex shrink-0 items-center text-muted-foreground [&>svg]:size-4"
        >
          {icon}
        </span>
      ) : null}
      {/* The label is the only place a long node type can be read, and the
          row never scrolls: the chevron slot, icon and counter are fixed, so
          the label box is whatever the column leaves over (measured: 197px of
          a 251px row at depth 0). Anything past that is ellipsised and would
          otherwise be unrecoverable, so a plain string label carries its own
          `title` — hover reveals the full value without a tooltip provider.
          A ReactNode label is left alone: its text is not ours to flatten. */}
      <span
        data-slot="tree-row-label"
        className="min-w-0 flex-1 truncate"
        title={typeof label === "string" ? label : undefined}
      >
        {label}
      </span>
      {childCount != null && childCount > 0 ? (
        <Badge variant="secondary" className="px-1.5 text-caption tabular-nums">
          {childCount}
        </Badge>
      ) : null}
    </div>
  );
}
