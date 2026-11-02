"use client";

// CollectionsList — sidebar entries for the CollectionsShell shell.
//
// Read-only list with selection state lifted to the caller. The
// add/edit/delete affordances and the inline "+ New collection" button
// sit next to the schema editor, so creation flows through a single,
// consistent path.
//
// Stays presentation-only: no data fetching, no provider abstraction.
// Caller wires the data source (see useCollections in entities/)
// and passes `collections`, `selectedId`, `onSelect`. Loading/error
// states are deliberately props, not internal — the whole shell can
// render during pending state without nested skeletons.
//
// Layout and typography come from the sunday-sauna kit (SDL-226); the
// active-item accent tint stays inline because the kit has no bare
// list-item primitive with a selected state that matches this markup.
//
// SDL-452 adds `variant="rail"`: the same data at 56px for the tablet
// column of <CollectionsShell>. It is a variant rather than a second
// component because the props, the selection semantics and the empty /
// loading / error branches are identical — only the row shrinks to its
// icon. Names survive as `title` + visually-hidden text, so the rail
// stays operable by screen reader and by hover.

import type { ReactNode } from "react";

import { Box, Button, Text } from "@markerloop/ui/ui";

import type { Collection } from "./types";

/** Icon shown in both variants; the rail falls back to an initial. */
function collectionGlyph(c: Collection): string {
  return c.icon ?? (c.is_builtin ? "★" : "▸");
}

export interface CollectionsListProps {
  collections: readonly Collection[];
  /** Currently selected collection id, or null when nothing is picked. */
  selectedId: string | null;
  /** Click handler — fires the selected collection back to the caller. */
  onSelect: (collection: Collection) => void;
  /** True while the parent's query is in flight. Renders a placeholder. */
  isLoading?: boolean;
  /** Set when fetching failed. Renders a short error message. */
  error?: string | null;
  /**
   * Optional click handler for the "+" button next to the heading.
   * When set, the button is rendered and opens <CollectionCreateForm>.
   * When undefined, the heading shows the collection count instead, so a
   * read-only mounting of the list stays harmless.
   */
  onAddClick?: () => void;
  /** Optional copy override for headings and state messages (i18n). */
  labels?: {
    heading?: string;
    loading?: string;
    empty?: string;
    error?: string;
    builtinBadge?: string;
    addCollection?: string;
  };
  /**
   * `"full"` (default) is the 260px desktop column and the drawer body.
   * `"rail"` is the 56px tablet strip: icons only, names as tooltips.
   */
  variant?: "full" | "rail";
}

export function CollectionsList({
  collections,
  selectedId,
  onSelect,
  onAddClick,
  isLoading = false,
  error = null,
  labels,
  variant = "full",
}: CollectionsListProps): ReactNode {
  const heading = labels?.heading ?? "Collections";
  const builtinBadge = labels?.builtinBadge ?? "built-in";
  const addLabel = labels?.addCollection ?? "+ New";

  if (variant === "rail") {
    return (
      <Box
        as="nav"
        direction="column"
        align="center"
        gap={1}
        className="p-2"
        role="navigation"
        aria-label={heading}
      >
        {onAddClick ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onAddClick}
            title={addLabel}
            aria-label={addLabel}
          >
            <span aria-hidden="true">+</span>
          </Button>
        ) : null}

        {isLoading || error || collections.length === 0 ? (
          // The rail has no room for a sentence; the state is spelled out
          // in the drawer, which is one tap away from the same screen.
          <Text as="span" variant="muted" size="sm" aria-hidden="true">
            {isLoading ? "…" : error ? "!" : "∅"}
          </Text>
        ) : (
          <Box as="ul" direction="column" align="center" gap={0.5} role="list">
            {collections.map((c) => {
              const isActive = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    aria-current={isActive ? "true" : undefined}
                    data-active={isActive ? "" : undefined}
                    title={c.name}
                    className={`collections-rail-item flex h-9 w-9 cursor-pointer items-center justify-center rounded-md${isActive ? " bg-accent text-accent-foreground" : ""}`}
                  >
                    <span aria-hidden="true">{collectionGlyph(c)}</span>
                    <span className="sr-only">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box
      as="nav"
      direction="column"
      gap={2}
      className="p-4"
      role="navigation"
      aria-label={heading}
    >
      <Box direction="row" align="center" justify="between" className="px-1">
        <Text as="span" variant="label">
          {heading.toUpperCase()}
        </Text>
        {onAddClick ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onAddClick}
          >
            {addLabel}
          </Button>
        ) : !isLoading && !error ? (
          <Text as="span" variant="label" weight="medium">
            {collections.length}
          </Text>
        ) : null}
      </Box>

      {isLoading ? (
        <Text variant="muted" size="sm" className="px-1">
          {labels?.loading ?? "Loading…"}
        </Text>
      ) : error ? (
        <Text variant="destructive" size="sm" className="px-1">
          {labels?.error ?? error}
        </Text>
      ) : collections.length === 0 ? (
        <Text variant="muted" size="sm" className="px-1">
          {labels?.empty ?? "No collections yet."}
        </Text>
      ) : (
        <Box as="ul" direction="column" gap={0.5} role="list">
          {collections.map((c) => {
            const isActive = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  aria-current={isActive ? "true" : undefined}
                  data-active={isActive ? "" : undefined}
                  className={`collections-list-item flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left${isActive ? " bg-accent text-accent-foreground" : ""}`}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {collectionGlyph(c)}
                  </span>
                  <Text as="span" size="sm" className="min-w-0 flex-1 truncate">
                    {c.name}
                  </Text>
                  {c.is_builtin ? (
                    <Text
                      as="span"
                      variant="label"
                      weight="normal"
                      className="shrink-0"
                    >
                      {builtinBadge}
                    </Text>
                  ) : null}
                </button>
              </li>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
