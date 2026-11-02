"use client";

// BulkActionBar — floating toolbar shown when one or more records
// are selected in the RecordsTable.
//
// Linear/Gmail pattern: the bar appears at the bottom of the main
// pane with a count and the available actions. It ships a single
// "Delete" action plus a clear-selection close; more actions are
// added by composing another component on top of the same selection
// state.

import type { ReactNode } from "react";
import { Box, Button, Text } from "@markerloop/ui/ui";

export interface BulkActionBarProps {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  isDeleting?: boolean;
  labels?: {
    selected?: string;
    delete?: string;
    deleting?: string;
    clear?: string;
  };
}

export function BulkActionBar({
  count,
  onDelete,
  onClear,
  isDeleting = false,
  labels,
}: BulkActionBarProps): ReactNode {
  if (count === 0) return null;
  return (
    <Box
      role="toolbar"
      aria-label="Bulk actions"
      direction="row"
      align="center"
      gap={3}
      className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-popover px-4 py-2.5 text-popover-foreground shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]"
    >
      <Text as="span" size="sm" weight="medium">
        {count} {labels?.selected ?? "selected"}
      </Text>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded-full border-destructive text-destructive"
      >
        {isDeleting
          ? labels?.deleting ?? "Deleting…"
          : labels?.delete ?? "Delete"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClear}
        disabled={isDeleting}
        className="rounded-full"
      >
        {labels?.clear ?? "Clear"}
      </Button>
    </Box>
  );
}
