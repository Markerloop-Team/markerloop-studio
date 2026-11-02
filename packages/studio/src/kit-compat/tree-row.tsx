"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Badge, cn } from "@markerloop/ui/ui";

/** Horizontal indent per tree depth level, px (D1 spec: 16px/level). */
const INDENT_PER_LEVEL = 16;

export type TreeRowProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Nesting depth; each level indents the row by 16px. */
  depth?: number;
  /** Type glyph rendered before the label (usually a lucide icon). */
  icon?: React.ReactNode;
  /** Row label. */
  label: React.ReactNode;
  /**
   * Secondary label rendered after `label`, in monospace at the caption step, muted
   * (approved canvas, KitSheet/TreeRow). It exists for the case where the
   * primary label stopped being the thing the row IS — an outline row that
   * carries an author-given name still has to say what type it is.
   * Omitted, nothing renders and the label keeps the full width.
   */
  meta?: React.ReactNode;
  /**
   * Renders the label slot as an inline text field instead of text — the
   * rename state of the approved canvas. Presentational like the rest of
   * the row: WHEN a rename starts is the host's business, the field's
   * looks, focus and key handling are the row's.
   *
   * The field seeds itself from `editValue` on the frame editing turns on
   * and is uncontrolled from there, so a host that re-renders on every
   * keystroke cannot fight the caret. Enter (or blur) commits the current
   * text, Escape cancels — both are also stopped from bubbling, because
   * the tree above owns Enter/arrow keys and would act on them.
   *
   * **The host must clear `editing` from its commit and cancel handlers.**
   * A field settles once: Enter blurs on the way out, and without that
   * latch the same rename would apply twice (and an Escape would be undone
   * by the unmount blur). Leaving `editing` true after a commit therefore
   * leaves a live but permanently unsettleable field — see the `Renaming`
   * story for the intended shape.
   */
  editing?: boolean;
  /** Text the rename field opens with. */
  editValue?: string;
  /** Enter or blur: the field's text, untrimmed — trimming is host policy. */
  onEditCommit?: (value: string) => void;
  /** Escape: the edit is abandoned, nothing changed. */
  onEditCancel?: () => void;
  /** Accessible name of the rename field. Default: "Rename". */
  editLabel?: string;
  /**
   * Number of children, rendered as a counter badge.
   *
   * `0` is a value, not an absence: an empty container is exactly the row
   * an author needs to see (SDL-375), and it used to be swallowed together
   * with «no counter at all». Omit the prop — or pass `null` — for a row
   * that should carry no counter. WHICH rows those are is the host's call:
   * the primitive has no way to tell a leaf from an empty container, and
   * guessing here would put the rule in the one place that cannot know it.
   */
  childCount?: number | null;
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
  meta,
  editing = false,
  editValue = "",
  onEditCommit,
  onEditCancel,
  editLabel = "Rename",
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
        // Selection is an `info` state, not a louder hover. Both used to be
        // `--accent`, which made the selected row all but indistinguishable
        // from the one under the cursor; the board (KitSheet, «TreeRow»)
        // separates them with a tinted ground, an inset rail and info text.
        selected &&
          "bg-info/15 text-info-foreground font-medium shadow-[inset_2px_0_0_var(--info)] hover:bg-info/15 hover:text-info-foreground",
        className
      )}
      style={{ paddingLeft: 8 + depth * INDENT_PER_LEVEL }}
      {...props}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          // Deliberately unreachable by Tab: in the ARIA tree pattern the
          // treeitem is the single keyboard target and expansion happens on
          // the horizontal arrow keys, so a reachable toggle per container
          // would grow the ring by one stop per level — the exact keyboard
          // trap SDL-115 removed. Pointer users keep the click target.
          tabIndex={-1}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          onClick={(event) => {
            event.stopPropagation();
            onExpandedChange?.(!expanded);
          }}
        >
          <ChevronRight
            className={cn(
              "size-3 transition-transform",
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
      {editing ? (
        <TreeRowRenameField
          value={editValue}
          label={editLabel}
          onCommit={onEditCommit}
          onCancel={onEditCancel}
        />
      ) : (
        /* The label is the only place a long node type can be read, and the
           row never scrolls: the chevron slot, icon and counter are fixed, so
           the label box is whatever the column leaves over (measured: 197px of
           a 251px row at depth 0). Anything past that is ellipsised and would
           otherwise be unrecoverable, so a plain string label carries its own
           `title` — hover reveals the full value without a tooltip provider.
           A ReactNode label is left alone: its text is not ours to flatten. */
        <span
          data-slot="tree-row-label"
          className="min-w-0 flex-1 truncate"
          title={typeof label === "string" ? label : undefined}
        >
          {label}
        </span>
      )}
      {/* The type badge survives the rename state — on the approved canvas
          the field and the badge share the row, so the author can see what
          they are renaming while they rename it. `shrink-0`: the label (or
          the field) is what gives way when the column is narrow. */}
      {meta != null && meta !== false ? (
        <span
          data-slot="tree-row-meta"
          className="shrink-0 font-mono text-caption text-muted-foreground"
        >
          {meta}
        </span>
      ) : null}
      {childCount != null ? (
        <Badge variant="secondary" className="px-1.5 text-caption tabular-nums">
          {childCount}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * The inline rename field of a TreeRow.
 *
 * Its own component so that mounting IS the reset: the field appears the
 * moment `editing` flips on, and `defaultValue` therefore always seeds from
 * the value of that moment. Keeping it inline in TreeRow would need an
 * effect to re-seed a long-lived input, and effects run after paint — the
 * author would see the previous name for a frame.
 */
function TreeRowRenameField({
  value,
  label,
  onCommit,
  onCancel,
}: {
  value: string;
  label: string;
  onCommit?: (value: string) => void;
  onCancel?: () => void;
}) {
  // Commit fires from Enter and from blur, and Enter blurs the field on the
  // way out — without this latch the same rename would be applied twice, and
  // an Escape followed by the unmount blur would apply the edit it cancelled.
  const settled = React.useRef(false);
  const selectOnMount = React.useCallback(
    (el: HTMLInputElement | null) => el?.select(),
    []
  );
  const settle = (run: () => void) => {
    if (settled.current) return;
    settled.current = true;
    run();
  };

  return (
    <input
      data-slot="tree-row-rename"
      type="text"
      aria-label={label}
      defaultValue={value}
      // Autofocus with the text selected: a rename almost always replaces
      // the name rather than appends to it, and the author who wanted to
      // append presses End. `autoFocus` alone leaves the caret at the end.
      //
      // The callback MUST be stable. Written inline it gets a fresh
      // identity every render, and React then detaches and re-attaches the
      // ref on each one — re-running `select()` in the middle of an edit.
      // Anything above the tree re-rendering (the auto-save chip settling
      // saving → ready, say) would silently select the author's half-typed
      // name, and their next keystroke would replace it.
      ref={selectOnMount}
      autoFocus
      // The row underneath selects on click and the tree above walks on the
      // arrow keys — inside a text field both are wrong, and the field is
      // deliberately the only thing that stops them.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          settle(() => onCommit?.(event.currentTarget.value));
        } else if (event.key === "Escape") {
          event.preventDefault();
          settle(() => onCancel?.());
        }
      }}
      onBlur={(event) => settle(() => onCommit?.(event.currentTarget.value))}
      className={cn(
        "h-[22px] min-w-0 flex-1 rounded-sm border border-ring bg-background px-1.5 text-sm",
        "outline-none ring-2 ring-ring/20"
      )}
    />
  );
}
