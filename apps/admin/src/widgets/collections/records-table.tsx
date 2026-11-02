"use client";

// RecordsTable — paginated view of records in one collection.
//
// Every cell goes through the field-type registry, so a renderer can
// be swapped per field type without touching this component. Bulk
// selection and per-column quick filters live here too.
//
// Sorting is server-side and owned by the caller (`sortBy` /
// `onSortChange`). Quick filters are NOT: they narrow the rows already
// loaded, so they are a "find the row I just saw" affordance, not
// search across the collection.
//
// EP-186 (layer 3, pattern 1): the toolbar is the admin's one — the kit
// SearchField and the count «Shown N of M» — and the rows are the admin's
// one list, DataView: ONE field description built from the collection
// schema (every cell through the field-type registry) draws the desktop
// table and, below 768px, the cards, from one row model. The look is
// DataView's dense grid (`density="compact"`, `frame="bare"`) with the
// per-column quick-filter row in its `headerRow` slot. This module reads no
// next-intl (it renders without a provider in `smoke:collections`), so it
// uses DataViewBase with the caller's labels. The panel frame — the toolbar
// strip, the scroll area, the empty states and the pager pinned under the
// scroll area — stays here, which is why DataView's own pager is off.

import * as React from "react";
import { useMemo, useState, type ReactNode } from "react";

import { Box, Button, EmptyState, FormControl, Text } from "@markerloop/ui/ui";

import {
  DataViewBase,
  type DataViewField,
  type DataViewSort,
  type DataViewTexts,
  type DataViewValue,
} from "@/shared/components/data-view";
import { ListPager, PAGER_FALLBACK_LABELS } from "@/shared/components/list-pager";

import { getFieldTypeRenderers } from "./field-type-registry";
import type { CollectionField, CollectionRecord } from "./types";

export interface RecordsTablePagination {
  /** Zero-based page index. */
  pageIndex: number;
  /** Records per page. */
  pageSize: number;
}

export interface RecordsTableProps {
  fields: readonly CollectionField[];
  records: readonly CollectionRecord[];
  pagination: RecordsTablePagination;
  onPaginationChange: (next: RecordsTablePagination) => void;
  isLoading?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onRowClick?: (record: CollectionRecord) => void;
  /**
   * Called from the empty state's CTA. When omitted, the empty state
   * carries the reason but no action — a list that cannot be filled
   * from here should not pretend otherwise.
   */
  onCreateRecord?: () => void;
  /**
   * Set of selected record ids. When provided, the table renders a
   * checkbox column. When undefined, rows have no selection state.
   */
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (next: Set<string>) => void;
  /**
   * When true, a per-column quick-filter row is rendered between the
   * header and the body. Filters apply client-side to the current
   * page — handy as a refinement on top of server-side `search`.
   */
  enableQuickFilter?: boolean;
  /**
   * Server-side search across the JSONB payload. Caller owns the
   * state; the table renders an input above the table when
   * `onSearchChange` is set.
   */
  search?: string;
  onSearchChange?: (next: string) => void;
  /**
   * Records in the collection, when the caller knows it (the listing's
   * `records_count`). With `formatCount` it draws «Shown N of M» in the
   * toolbar; unknown → no count, never a guessed 0.
   */
  total?: number;
  /** The caller's catalogue string for the count (this module has no i18n). */
  formatCount?: (shown: number, total: number) => string;
  /**
   * Server-side sort state. Caller owns it; clickable column
   * headers cycle `asc → desc → unset` and emit changes via
   * `onSortChange`. `sortBy` is the field key (or `created_at` /
   * `updated_at` for built-in columns).
   */
  sortBy?: string | null;
  sortOrder?: "asc" | "desc";
  onSortChange?: (next: {
    sort_by: string | null;
    sort_order: "asc" | "desc";
  }) => void;
  labels?: {
    idColumn?: string;
    createdAtColumn?: string;
    updatedAtColumn?: string;
    loading?: string;
    empty?: string;
    emptyHint?: string;
    emptySearch?: string;
    emptySearchHint?: string;
    clearSearch?: string;
    /**
     * Метка CTA пустого состояния. НЕ равна метке кнопки добавления в
     * шапке: две кнопки с одинаковым доступным именем на одном экране —
     * и двусмысленность для скринридера, и strict-mode violation в
     * Playwright (поймано пайплайном 2804377914 на sdl170/sdl360).
     */
    createFirstRecord?: string;
    error?: string;
    noFields?: string;
    prev?: string;
    next?: string;
    page?: string;
    selectAll?: string;
    selectRow?: string;
    quickFilterPlaceholder?: string;
    searchPlaceholder?: string;
  };
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return value;
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** A JSON cell as the list reads it (the sort itself is the server's). */
function cellValue(value: unknown): DataViewValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

/** The built-in columns — not collection fields, no quick filter. */
const ID_COLUMN = "__id";

export function RecordsTable({
  fields,
  records,
  pagination,
  onPaginationChange,
  isLoading = false,
  error = null,
  hasMore = false,
  onRowClick,
  onCreateRecord,
  selectedIds,
  onSelectionChange,
  enableQuickFilter = false,
  search,
  onSearchChange,
  total,
  formatCount,
  sortBy = null,
  sortOrder = "desc",
  onSortChange,
  labels,
}: RecordsTableProps): ReactNode {
  const idLabel = labels?.idColumn ?? "ID";
  const createdLabel = labels?.createdAtColumn ?? "Created";
  const updatedLabel = labels?.updatedAtColumn ?? "Updated";
  const selectionEnabled = !!selectedIds && !!onSelectionChange;

  const [filters, setFilters] = useState<Record<string, string>>({});

  const visibleRecords = useMemo(() => {
    if (!enableQuickFilter) return records;
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== "");
    if (active.length === 0) return records;
    return records.filter((r) =>
      active.every(([key, q]) => {
        const cell = r.data?.[key];
        if (cell === null || cell === undefined) return false;
        return String(cell).toLowerCase().includes(q.toLowerCase());
      })
    );
  }, [records, filters, enableQuickFilter]);

  if (error) {
    return (
      <Text variant="destructive" size="sm" className="p-6 text-center">
        {labels?.error ?? error}
      </Text>
    );
  }

  if (isLoading) {
    return (
      <Text variant="muted" size="sm" className="p-6 text-center">
        {labels?.loading ?? "Loading…"}
      </Text>
    );
  }

  if (fields.length === 0) {
    return (
      <Text variant="muted" size="sm" className="p-6 text-center">
        {labels?.noFields ?? "This collection has no fields yet."}
      </Text>
    );
  }

  // Two different nothings, and the audit (SDL-461) found them merged
  // into one line: "no records yet" was shown when a search simply
  // matched nothing, next to a search box and a pager for zero rows.
  // `narrowed` tells them apart — the collection is empty, or the
  // user's own query hid everything.
  const quickFilterActive = Object.values(filters).some((v) => v.trim() !== "");
  const searchActive = (search ?? "").trim() !== "";
  const narrowed = quickFilterActive || searchActive;
  /** Collection has nothing to show and nothing is hiding it. */
  const trulyEmpty =
    records.length === 0 && !narrowed && pagination.pageIndex === 0;

  const showCount = typeof total === "number" && !!formatCount;

  const clearNarrowing = () => {
    setFilters({});
    onSearchChange?.("");
  };

  const onPrev = () => {
    if (pagination.pageIndex > 0) {
      onPaginationChange({
        ...pagination,
        pageIndex: pagination.pageIndex - 1,
      });
    }
  };

  const onNext = () => {
    if (hasMore) {
      onPaginationChange({
        ...pagination,
        pageIndex: pagination.pageIndex + 1,
      });
    }
  };

  const sortable = Boolean(onSortChange);
  // One description of a record: the id chip, every schema field through
  // the registry (the first is the card's title), the two timestamps
  // (Updated is the card's footnote).
  const viewFields: DataViewField<CollectionRecord>[] = [
    {
      id: ID_COLUMN,
      label: idLabel,
      render: (r) => (
        <Text as="code" variant="mono" size="xs">
          {shortId(r.id)}
        </Text>
      ),
      hint: (r) => r.id,
    },
    ...fields.map(
      (f, index): DataViewField<CollectionRecord> => ({
        id: f.key,
        label: f.name,
        headerHint: f.key,
        value: (r) => cellValue(r.data?.[f.key]),
        render: (r) => {
          const { CellRender } = getFieldTypeRenderers(f.type);
          return <CellRender field={f} value={r.data?.[f.key]} />;
        },
        sortable,
        sortFirst: "asc",
        card: index === 0 ? "title" : "field",
      })
    ),
    {
      id: "created_at",
      label: createdLabel,
      value: (r) => r.created_at,
      render: (r) => formatDateTime(r.created_at),
      sortable,
      sortFirst: "asc",
    },
    {
      id: "updated_at",
      label: updatedLabel,
      value: (r) => r.updated_at,
      render: (r) => formatDateTime(r.updated_at),
      sortable,
      sortFirst: "asc",
      card: "note",
    },
  ];

  const filterableKeys = new Set(fields.map((f) => f.key));
  const quickFilterRow = enableQuickFilter
    ? (field: DataViewField<CollectionRecord>) =>
        filterableKeys.has(field.id) ? (
          <FormControl.Input
            type="text"
            value={filters[field.id] ?? ""}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                [field.id]: e.target.value,
              }))
            }
            placeholder={labels?.quickFilterPlaceholder ?? "Filter…"}
            className="h-7 px-1.5"
          />
        ) : null
    : undefined;

  // Click cycle: unset -> asc -> desc -> unset (asc first on every column).
  const sort: DataViewSort[] = sortBy ? [{ field: sortBy, direction: sortOrder }] : [];
  const handleSortChange = (next: DataViewSort[]) => {
    const first = next[0];
    onSortChange?.(
      first ? { sort_by: first.field, sort_order: first.direction } : { sort_by: null, sort_order: "desc" }
    );
  };

  const texts: DataViewTexts = {
    searchPlaceholder: labels?.searchPlaceholder ?? "",
    clearSearch: labels?.clearSearch ?? "",
    errorLoadingData: labels?.error ?? "",
    dataNotFound: labels?.emptySearch ?? "",
    previous: labels?.prev ?? PAGER_FALLBACK_LABELS.previous,
    next: labels?.next ?? PAGER_FALLBACK_LABELS.next,
    page: labels?.page ?? PAGER_FALLBACK_LABELS.page,
    shown: "",
    of: "",
    listCount: ({ shown, total: all }) => formatCount?.(shown, all) ?? "",
    selectAll: labels?.selectAll ?? "Select all",
    selectRow: labels?.selectRow ?? "Select row",
  };

  return (
    <Box direction="column" fullHeight data-collections-records-table="">
      {(onSearchChange || showCount) && !trulyEmpty ? (
        <Box
          direction="row"
          align="center"
          gap={3}
          wrap
          className="border-b border-border px-3 py-2.5"
          data-collections-records-toolbar=""
        >
          {onSearchChange ? (
            <Box className="min-w-[12rem] max-w-sm flex-1">
              <FormControl.SearchField
                value={search ?? ""}
                onChange={onSearchChange}
                placeholder={labels?.searchPlaceholder ?? "Search records…"}
                ariaLabel={labels?.searchPlaceholder ?? "Search records…"}
                clearLabel={labels?.clearSearch}
              />
            </Box>
          ) : null}
          {showCount ? (
            <Text
              as="span"
              size="sm"
              variant="muted"
              className="ml-auto tabular-nums"
              data-collections-records-count=""
            >
              {formatCount(visibleRecords.length, total)}
            </Text>
          ) : null}
        </Box>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {visibleRecords.length === 0 ? (
          <EmptyState paddingY={10} data-collections-records-empty="">
            <Text as="h2" size="lg" weight="semibold">
              {trulyEmpty
                ? (labels?.empty ?? "No records yet.")
                : (labels?.emptySearch ?? "Nothing matches this query.")}
            </Text>
            <Text size="sm" variant="muted">
              {trulyEmpty
                ? (labels?.emptyHint ??
                  "Create the first record with the button above.")
                : (labels?.emptySearchHint ??
                  "Change the query or clear the search.")}
            </Text>
            {trulyEmpty ? (
              onCreateRecord ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={onCreateRecord}
                  data-collections-records-empty-create=""
                >
                  {labels?.createFirstRecord ?? "Create the first record"}
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearNarrowing}
                data-collections-records-empty-clear=""
              >
                {labels?.clearSearch ?? "Clear search"}
              </Button>
            )}
          </EmptyState>
        ) : (
          <DataViewBase
            fields={viewFields}
            data={[...visibleRecords]}
            getRowId={(r) => r.id}
            density="compact"
            frame="bare"
            show={{ search: false, count: false, pager: false }}
            sort={sort}
            onSortChange={handleSortChange}
            sortMode="server"
            paging={{
              mode: "server-more",
              pageIndex: pagination.pageIndex,
              hasMore,
              onPageChange: (pageIndex) => onPaginationChange({ ...pagination, pageIndex }),
            }}
            selection={
              selectionEnabled
                ? { mode: "multiple", selectedIds: selectedIds!, onChange: onSelectionChange }
                : { mode: "none" }
            }
            onRowClick={onRowClick}
            headerRow={quickFilterRow}
            cardsAttributes={{ "data-collections-records-cards": "" }}
            cardAttributes={(r) => ({ "data-collections-record-card": r.id })}
            texts={texts}
          />
        )}
      </div>

      {trulyEmpty ? null : (
        // Общий пейджер админки (SDL-458). `totalPages` не передаётся
        // намеренно: `GET /records` общего количества не отдаёт, известен
        // только `hasMore`, поэтому индикатор здесь без « / M».
        <ListPager
          page={pagination.pageIndex + 1}
          hasPrev={pagination.pageIndex > 0}
          hasNext={hasMore}
          onPrev={onPrev}
          onNext={onNext}
          labels={{
            previous: labels?.prev,
            next: labels?.next,
            page: labels?.page,
          }}
          className="border-t border-border px-3 py-2"
        />
      )}
    </Box>
  );
}
