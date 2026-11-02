"use client";

import { withBasePath } from "@/demo/config";
import * as React from "react";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
  type Table as TanstackTable,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Folder } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { Tile, TileGrid } from "@markerloop/ui/ui/admin";
import { useTranslations } from "@/shared/hooks";
import { ListPager } from "@/shared/components/list-pager";
import {
  fieldsWithCardRole,
  fieldsWithTileRole,
  formatFieldValue,
  type DataViewField,
  type DataViewSort,
} from "./fields";

/** The search input's test hook; `data-*` is not in the input props type. */
type InputTestHook = React.ComponentProps<"input">;

/** `data-*` / `aria-*` attributes stamped on a row, a tile or a card. */
export type DataViewRowAttributes = Record<`data-${string}` | `aria-${string}`, string | boolean | undefined>;

/** «Показано N из M» — one shape of the count for every list (EP-186). */
export interface DataViewCount {
  shown: number;
  total: number;
}

/**
 * How the rows are paged. `none` — every row is on screen; `client` — the
 * list pages the rows it holds; `server` — the caller holds one page and
 * knows the total; `server-more` — the caller holds one page and only knows
 * whether another follows (`GET /records` has no total).
 */
export type DataViewPaging =
  | { mode: "none" }
  | {
      mode: "client";
      pageSize: number;
      /** Controlled page; absent → the list keeps its own. */
      pageIndex?: number;
      onPageChange?: (pageIndex: number) => void;
    }
  | {
      mode: "server";
      pageIndex: number;
      pageSize: number;
      total: number;
      /** Overrides `ceil(total / pageSize)` when the server reports its own. */
      pageCount?: number;
      onPageChange: (pageIndex: number) => void;
    }
  | {
      mode: "server-more";
      pageIndex: number;
      hasMore: boolean;
      onPageChange: (pageIndex: number) => void;
    };

export type DataViewSelection =
  | { mode: "none" }
  | {
      mode: "single" | "multiple";
      selectedIds: ReadonlySet<string>;
      onChange?: (next: Set<string>) => void;
    };

/** Which parts of the chrome are drawn. Every part is on by default. */
export interface DataViewShow {
  search?: boolean;
  filters?: boolean;
  count?: boolean;
  header?: boolean;
  /** The pager (and the page line under the desktop table). A host that draws its own sets it off. */
  pager?: boolean;
}

/** What the page line under the desktop table may say about the page. */
export interface DataViewPageInfo {
  /** Rows on the current page. */
  shown: number;
  pageIndex: number;
  pageCount: number;
}

/** Every string the list draws. `DataView` takes them from next-intl. */
export interface DataViewTexts {
  searchPlaceholder: string;
  clearSearch: string;
  errorLoadingData: string;
  dataNotFound: string;
  previous: string;
  next: string;
  shown: string;
  of: string;
  page: string;
  listCount: (count: DataViewCount) => string;
  selectAll: string;
  selectRow: string;
}

/** The section a row belongs to (EP-175): a stable key and the title people read. */
export interface DataViewGroup {
  key: string;
  label: string;
}

/** One titled section of rows, in the order the list draws it. */
export interface DataViewSection<TRow> {
  /** `null` — the rows `groupBy` put in no group. */
  group: DataViewGroup | null;
  rows: TRow[];
}

/**
 * Splits rows into sections (EP-175). Rows keep their order inside a section
 * (the list's sort); sections go by `compare` — default: by label — and the
 * rows with no group come last. Exported so a smoke can execute the rule.
 */
export function groupDataViewRows<TRow>(
  rows: readonly TRow[],
  groupBy: (row: TRow) => DataViewGroup | null,
  compare: (a: DataViewGroup, b: DataViewGroup) => number = (a, b) => a.label.localeCompare(b.label)
): DataViewSection<TRow>[] {
  const byKey = new Map<string, DataViewSection<TRow>>();
  const none: DataViewSection<TRow> = { group: null, rows: [] };
  for (const row of rows) {
    const group = groupBy(row);
    if (!group) {
      none.rows.push(row);
      continue;
    }
    const section = byKey.get(group.key);
    if (section) section.rows.push(row);
    else byKey.set(group.key, { group, rows: [row] });
  }
  const sections = [...byKey.values()].sort((a, b) => compare(a.group!, b.group!));
  if (none.rows.length > 0) sections.push(none);
  return sections;
}

export interface DataViewProps<TRow> {
  /** The screen's one description of its fields: table, tiles and cards. */
  fields: readonly DataViewField<TRow>[];
  data: TRow[];
  /** Row identity: selection, keys. Default: the row's index. */
  getRowId?: (row: TRow, index: number) => string;
  view?: "table" | "tiles";
  show?: DataViewShow;
  /** `bare` drops the frame around the table. */
  frame?: "bordered" | "bare";
  /** `compact` is the dense data-grid look (records): tighter cells, label headers. */
  density?: "normal" | "compact";
  isLoading?: boolean;
  error?: Error | null;
  errorMessage?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** `client` narrows the rows by `searchValue` over the fields' values; default `server` (rows come narrowed). */
  searchMode?: "client" | "server";
  filters?: ReactNode;
  /** The count in the toolbar. Given → the desktop table draws no count line of its own. */
  count?: DataViewCount;
  /** Controlled sort; absent → the list keeps its own. */
  sort?: DataViewSort[];
  onSortChange?: (sort: DataViewSort[]) => void;
  /** `server` — rows come sorted, the header only reports the wish. Default `client`. */
  sortMode?: "client" | "server";
  paging?: DataViewPaging;
  /** The line next to the desktop pager. Default: «Shown N of M (Page i of n)». */
  paginationInfo?: (info: DataViewPageInfo) => ReactNode;
  selection?: DataViewSelection;
  /** Drawn above the list (a BulkActionBar); the caller decides when. */
  bulkActions?: ReactNode;
  onRowClick?: (row: TRow) => void;
  /** Navigation target of a row (a tile becomes a link). */
  rowHref?: (row: TRow) => string | undefined;
  /** An extra header row under the table header, one cell per field (quick filters). */
  headerRow?: (field: DataViewField<TRow>) => ReactNode;
  /** Test hooks of the screen that hosts the list. */
  toolbarTestId?: string;
  searchTestId?: string;
  countTestId?: string;
  tableTestId?: string;
  cardsTestId?: string;
  tilesTestId?: string;
  /** Attributes of each desktop row / each tile. */
  rowAttributes?: (row: TRow) => DataViewRowAttributes;
  /** Attributes of each mobile card. */
  cardAttributes?: (row: TRow) => DataViewRowAttributes;
  /** Attributes of the desktop branch / of the cards branch (a host's own test hooks). */
  tableAttributes?: DataViewRowAttributes;
  cardsAttributes?: DataViewRowAttributes;
  /** A line between the toolbar and the list (an active mode, a notice). */
  notice?: ReactNode;
  /**
   * Group sections (EP-175): rows are split into titled sections — a folder
   * icon, the title and the count — in the tiles, the table and the cards
   * alike. Absent → one flat list, as before. `null` → the «no group» section
   * (`ungroupedLabel`), drawn last.
   */
  groupBy?: (row: TRow) => DataViewGroup | null;
  /** Title of the section of rows with no group. Default: "No group". */
  ungroupedLabel?: string;
  /** Section order; default: by label. The «no group» section is always last. */
  groupCompare?: (a: DataViewGroup, b: DataViewGroup) => number;
  /** Test hook stamped on every section heading (with `data-group`). */
  groupTestId?: string;
  /**
   * The row's actions (EP-175) — typically a «⋯» menu. One slot for every
   * branch: the top-right corner of a tile's media, the last cell of a table
   * row, the top-right of a mobile card. Clicks inside it never activate the row.
   */
  rowActions?: (row: TRow) => ReactNode;
  /** Accessible name of the table's actions column. */
  rowActionsLabel?: string;
  /**
   * Where a tile's actions sit: over the top-right corner of the media
   * (default), or at the end of the title line — the media stays clear.
   */
  rowActionsPlacement?: "media" | "title";
  /**
   * Attributes of a tile's own control (the link / button). With `rowActions`
   * a tile is a frame holding the control and the actions: `rowAttributes`
   * go on the frame, these on the control.
   */
  tileControlAttributes?: (row: TRow) => DataViewRowAttributes;
  /**
   * Replaces the list under the toolbar — the screen's own loading, error or
   * empty card. The toolbar stays, so a filter that emptied the list can be
   * undone right there.
   */
  body?: ReactNode;
}

const SELECT_COLUMN = "__select";

const toSorting = (sort: readonly DataViewSort[]): SortingState =>
  sort.map((s) => ({ id: s.field, desc: s.direction === "desc" }));

const fromSorting = (sorting: SortingState): DataViewSort[] =>
  sorting.map((s) => ({ field: s.id, direction: s.desc ? "desc" : "asc" }));

const resolve = <T,>(updater: Updater<T>, old: T): T =>
  typeof updater === "function" ? (updater as (old: T) => T)(old) : updater;

/** A field's cell: its own render, or its value as text. */
function renderField<TRow>(field: DataViewField<TRow>, row: TRow): ReactNode {
  if (field.render) return field.render(row);
  return field.value ? formatFieldValue(field.value(row)) : null;
}

/** Keyboard and pointer props of a clickable row / card. */
function clickableProps<TElement extends HTMLElement>(onActivate: () => void, ownTargetOnly: boolean) {
  return {
    onClick: onActivate,
    tabIndex: 0,
    role: "button" as const,
    onKeyDown: (e: KeyboardEvent<TElement>) => {
      if (ownTargetOnly && e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** `rowHref` on a table row or a card: a plain document navigation (no router in a smoke). */
const followHref = (href: string) => {
  window.location.assign(withBasePath(href));
};

/**
 * The admin's one list (EP-186): a desktop table, tiles, and below 768px
 * cards — all three drawn from ONE field description and ONE row model.
 *
 * The row model is the point. ResponsiveDataTable drew the desktop table with
 * the kit's DataTable (its own TanStack instance, which sorted and paged) and
 * the cards with a second, all-manual instance — so on dictionary Cities and
 * Languages the phone showed every row unsorted while the desktop showed ten
 * sorted ones. Here one instance sorts, filters and pages, and the table, the
 * tiles and the cards all read its rows.
 *
 * The switch between table and cards is CSS only (`hidden md:block` /
 * `md:hidden`): a media-query hook would render different branches on the
 * server and the client. Both are in the DOM, exactly one is visible.
 *
 * The desktop table keeps the kit DataTable's markup (built from the kit's
 * Table parts), so every screen looks as it did. There is no view switch in
 * the interface on purpose: `view`, the toggles, the frame and the density
 * are for the future page constructor, not for people.
 *
 * This component reads no next-intl: its strings come in `texts`, so a host
 * without a provider (the collections module) can draw it. `DataView` is the
 * admin's wrapper that brings them from the catalogue.
 */
export function DataViewBase<TRow>({
  fields,
  data,
  getRowId,
  view = "table",
  show,
  frame = "bordered",
  density = "normal",
  isLoading = false,
  error = null,
  errorMessage,
  emptyMessage,
  searchPlaceholder,
  searchValue = "",
  onSearchChange,
  searchMode = "server",
  filters,
  count,
  sort,
  onSortChange,
  sortMode = "client",
  paging = { mode: "none" },
  paginationInfo,
  selection = { mode: "none" },
  bulkActions,
  onRowClick,
  rowHref,
  headerRow,
  toolbarTestId,
  searchTestId,
  countTestId,
  tableTestId,
  cardsTestId,
  tilesTestId,
  rowAttributes,
  cardAttributes,
  tableAttributes,
  cardsAttributes,
  notice,
  body,
  groupBy,
  ungroupedLabel = "No group",
  groupCompare,
  groupTestId,
  rowActions,
  rowActionsLabel = "Actions",
  rowActionsPlacement = "media",
  tileControlAttributes,
  texts,
}: DataViewProps<TRow> & { texts: DataViewTexts }) {
  const showSearch = show?.search ?? true;
  const showFilters = show?.filters ?? true;
  const showCount = show?.count ?? true;
  const showHeader = show?.header ?? true;
  const showPager = show?.pager ?? true;

  // Uncontrolled state, so a list without a caller-held sort or page still
  // sorts and pages (the kit table's header did nothing without a handler).
  const [ownSort, setOwnSort] = useState<DataViewSort[]>([]);
  const [ownPageIndex, setOwnPageIndex] = useState(0);

  const sortState = sort ?? ownSort;
  const sorting = useMemo(() => toSorting(sortState), [sortState]);

  const pageIndex =
    paging.mode === "none" ? 0 : paging.mode === "client" ? (paging.pageIndex ?? ownPageIndex) : paging.pageIndex;
  const pageSize =
    paging.mode === "client" || paging.mode === "server" ? paging.pageSize : Math.max(data.length, 1);
  const serverPageCount =
    paging.mode === "server" ? (paging.pageCount ?? Math.max(1, Math.ceil(paging.total / paging.pageSize))) : 1;

  const multiple = selection.mode === "multiple";
  const selectedIds = selection.mode === "none" ? null : selection.selectedIds;

  const columns = useMemo<ColumnDef<TRow, unknown>[]>(() => {
    const own: ColumnDef<TRow, unknown>[] = fields.map((field) => {
      const read = field.value;
      const base: ColumnDef<TRow, unknown> = {
        id: field.id,
        header: field.labelHidden ? () => <span className="sr-only">{field.label}</span> : (field.label ?? ""),
        enableSorting: field.sortable ?? Boolean(read),
        cell: ({ row }) => renderField(field, row.original),
      };
      if (field.sortFirst) base.sortDescFirst = field.sortFirst === "desc";
      return read ? { ...base, accessorFn: (row: TRow) => read(row) } : base;
    });
    return own;
  }, [fields]);

  const columnVisibility = useMemo<VisibilityState>(() => {
    const state: VisibilityState = {};
    for (const field of fields) if (field.table === false) state[field.id] = false;
    return state;
  }, [fields]);

  const clientSort = sortMode === "client";
  const clientPaging = paging.mode === "client";
  const clientSearch = searchMode === "client";

  const table = useReactTable<TRow>({
    data,
    columns,
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: clientSort ? getSortedRowModel() : undefined,
    getFilteredRowModel: clientSearch ? getFilteredRowModel() : undefined,
    getPaginationRowModel: clientPaging ? getPaginationRowModel() : undefined,
    manualSorting: !clientSort,
    manualFiltering: !clientSearch,
    manualPagination: !clientPaging,
    pageCount: paging.mode === "server" ? serverPageCount : paging.mode === "server-more" ? -1 : undefined,
    globalFilterFn: "includesString",
    state: {
      sorting,
      columnVisibility,
      globalFilter: clientSearch ? searchValue : undefined,
      pagination: { pageIndex, pageSize },
    },
    onSortingChange: (updater) => {
      const next = fromSorting(resolve(updater, sorting));
      if (sort === undefined) setOwnSort(next);
      onSortChange?.(next);
    },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next = resolve(updater, { pageIndex, pageSize });
      if (paging.mode === "none") return;
      if (paging.mode === "client" && paging.pageIndex === undefined) setOwnPageIndex(next.pageIndex);
      paging.onPageChange?.(next.pageIndex);
    },
  });

  const rows = table.getRowModel().rows;
  // Sections over the table's own rows: grouping never re-sorts or re-pages.
  const sections: DataViewSection<Row<TRow>>[] = groupBy
    ? groupDataViewRows(rows, (row) => groupBy(row.original), groupCompare)
    : [{ group: null, rows }];
  const sectionLabel = (section: DataViewSection<Row<TRow>>) => section.group?.label ?? ungroupedLabel;
  const sectionKey = (section: DataViewSection<Row<TRow>>) => section.group?.key ?? "__none";
  const sectionHeading = (section: DataViewSection<Row<TRow>>) => (
    <Box
      direction="row"
      align="center"
      gap={2}
      className="min-w-0"
      data-data-view-group={sectionKey(section)}
      data-testid={groupTestId}
      data-group={section.group ? section.group.label : ""}
    >
      <Folder size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <UI.Text as="h3" size="sm" weight="semibold" className="min-w-0 truncate">
        {sectionLabel(section)}
      </UI.Text>
      <UI.Text as="span" size="sm" variant="muted" className="tabular-nums" data-data-view-group-count="">
        {section.rows.length}
      </UI.Text>
    </Box>
  );
  /** Clicks in the actions slot stay there: the row / card / tile is not activated. */
  const actionsSlot = (row: TRow, className?: string) => (
    <div
      className={className}
      data-data-view-row-actions=""
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
    >
      {rowActions?.(row)}
    </div>
  );
  const pageCount = paging.mode === "server-more" ? -1 : table.getPageCount();
  const canPrev = pageIndex > 0;
  const canNext = paging.mode === "server-more" ? paging.hasMore : pageIndex + 1 < pageCount;
  const goTo = (next: number) => table.setPageIndex(next);

  const isSelected = (row: Row<TRow>) => Boolean(selectedIds?.has(row.id));
  const toggleOne = (id: string) => {
    if (selection.mode === "none" || !selection.onChange) return;
    const next = selection.mode === "single" ? new Set<string>() : new Set(selection.selectedIds);
    if (selection.selectedIds.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  const allSelected = multiple && rows.length > 0 && rows.every(isSelected);
  const someSelected = multiple && !allSelected && rows.some(isSelected);
  const toggleAll = () => {
    if (selection.mode !== "multiple" || !selection.onChange) return;
    const next = new Set(selection.selectedIds);
    if (allSelected) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    selection.onChange(next);
  };

  const activate = (row: TRow): (() => void) | undefined => {
    if (onRowClick) return () => onRowClick(row);
    const href = rowHref?.(row);
    return href ? () => followHref(href) : undefined;
  };

  const searchLabel = searchPlaceholder ?? texts.searchPlaceholder;
  const drawSearch = showSearch && Boolean(onSearchChange);
  const drawFilters = showFilters && Boolean(filters);
  const drawCount = showCount && Boolean(count) && !body;
  const hasToolbar = drawSearch || drawFilters || (showCount && Boolean(count));

  const selectCheckbox = (row: Row<TRow>) => (
    <UI.FormControl.Checkbox
      aria-label={texts.selectRow}
      checked={isSelected(row)}
      onCheckedChange={() => toggleOne(row.id)}
    />
  );

  /* ------------------------------------------------------------ table */

  const compact = density === "compact";
  const visibleFields = fields.filter((field) => field.table !== false);
  const tableColumnCount = visibleFields.length + (multiple ? 1 : 0) + (rowActions ? 1 : 0);

  const sortIcon = (dir: false | "asc" | "desc") =>
    compact
      ? dir === "asc"
        ? " ▲"
        : dir === "desc"
          ? " ▼"
          : ""
      : dir === "asc"
        ? <ArrowUp className="h-4 w-4" />
        : dir === "desc"
          ? <ArrowDown className="h-4 w-4" />
          : <ArrowUpDown className="h-4 w-4 opacity-50" />;

  const headerContent = (field: DataViewField<TRow>) => {
    const column = table.getColumn(field.id);
    const header = table.getFlatHeaders().find((h) => h.column.id === field.id);
    const label = header ? flexRender(header.column.columnDef.header, header.getContext()) : field.label;
    const dir = column?.getIsSorted() ?? false;
    if (compact) {
      const text = (
        <UI.Text as="span" variant="label">
          {label}
          {sortIcon(dir)}
        </UI.Text>
      );
      return column?.getCanSort() ? (
        <button type="button" onClick={() => column.toggleSorting()} className="cursor-pointer">
          {text}
        </button>
      ) : (
        text
      );
    }
    return (
      <div className="flex items-center gap-2">
        {column?.getCanSort() ? (
          <button
            type="button"
            className="flex items-center gap-2 py-2 -my-2 min-h-9 rounded-sm hover:text-foreground transition-colors outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            onClick={() => column.toggleSorting()}
          >
            {label}
            {sortIcon(dir)}
          </button>
        ) : (
          label
        )}
      </div>
    );
  };

  const rowPropsFor = (row: Row<TRow>) => {
    const onActivate = activate(row.original);
    return onActivate ? clickableProps<HTMLTableRowElement>(onActivate, false) : {};
  };

  // The kit DataTable's markup, part for part, around this list's rows.
  const kitTable = (
    <div className="space-y-4">
      <div className={frame === "bordered" ? "rounded-md border" : undefined} data-data-view-frame={frame}>
        <UI.Table.Root>
          {showHeader ? (
            <UI.Table.Header>
              <UI.Table.Row>
                {multiple ? (
                  <UI.Table.Head className="w-9">
                    <UI.FormControl.Checkbox
                      aria-label={texts.selectAll}
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                    />
                  </UI.Table.Head>
                ) : null}
                {visibleFields.map((field) => (
                  <UI.Table.Head key={field.id} title={field.headerHint}>
                    {headerContent(field)}
                  </UI.Table.Head>
                ))}
                {rowActions ? (
                  <UI.Table.Head className="w-12">
                    <span className="sr-only">{rowActionsLabel}</span>
                  </UI.Table.Head>
                ) : null}
              </UI.Table.Row>
              {headerRow ? (
                <UI.Table.Row>
                  {multiple ? <UI.Table.Head className="w-9" /> : null}
                  {visibleFields.map((field) => (
                    <UI.Table.Head key={field.id}>{headerRow(field)}</UI.Table.Head>
                  ))}
                  {rowActions ? <UI.Table.Head className="w-12" /> : null}
                </UI.Table.Row>
              ) : null}
            </UI.Table.Header>
          ) : null}
          <UI.Table.Body>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <UI.Table.Row key={i}>
                  {Array.from({ length: tableColumnCount }).map((__, j) => (
                    <UI.Table.Cell key={j}>
                      <UI.Skeleton className="h-4 w-full" />
                    </UI.Table.Cell>
                  ))}
                </UI.Table.Row>
              ))
            ) : rows.length ? (
              sections.flatMap((section) => [
                ...(groupBy
                  ? [
                      <UI.Table.Row key={`group:${sectionKey(section)}`} className="hover:bg-transparent">
                        <UI.Table.Cell colSpan={tableColumnCount} className="pt-4">
                          {sectionHeading(section)}
                        </UI.Table.Cell>
                      </UI.Table.Row>,
                    ]
                  : []),
                ...section.rows.map((row) => {
                const selected = isSelected(row);
                const clickable = rowPropsFor(row);
                return (
                  <UI.Table.Row
                    key={row.id}
                    data-state={selected ? "selected" : undefined}
                    className={"onClick" in clickable ? "cursor-pointer" : undefined}
                    {...clickable}
                    {...rowAttributes?.(row.original)}
                  >
                    {multiple ? (
                      <UI.Table.Cell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        {selectCheckbox(row)}
                      </UI.Table.Cell>
                    ) : null}
                    {row.getVisibleCells().map((cell) => {
                      const field = visibleFields.find((f) => f.id === cell.column.id);
                      return (
                        <UI.Table.Cell key={cell.id} title={field?.hint?.(row.original)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </UI.Table.Cell>
                      );
                    })}
                    {rowActions ? (
                      <UI.Table.Cell className="w-12 text-right">{actionsSlot(row.original, "flex justify-end")}</UI.Table.Cell>
                    ) : null}
                  </UI.Table.Row>
                );
              }),
              ])
            ) : (
              <UI.Table.Row>
                <UI.Table.Cell colSpan={tableColumnCount} className="h-24 text-center">
                  {emptyMessage || texts.dataNotFound}
                </UI.Table.Cell>
              </UI.Table.Row>
            )}
          </UI.Table.Body>
        </UI.Table.Root>
      </div>
      {showPager ? tableFooter(table) : null}
    </div>
  );

  function tableFooter(instance: TanstackTable<TRow>): ReactNode {
    if (paging.mode === "server-more") {
      return (
        <ListPager
          page={pageIndex + 1}
          hasPrev={canPrev}
          hasNext={canNext}
          onPrev={() => goTo(pageIndex - 1)}
          onNext={() => goTo(pageIndex + 1)}
          labels={{ previous: texts.previous, next: texts.next, page: texts.page }}
        />
      );
    }
    const shown = instance.getRowModel().rows.length;
    const totalRows = paging.mode === "server" ? pageCount * pageSize : data.length;
    const buttons =
      pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <UI.Button variant="outline" size="sm" onClick={() => instance.previousPage()} disabled={!instance.getCanPreviousPage()}>
            {texts.previous}
          </UI.Button>
          <div className="text-sm text-muted-foreground">
            {pageIndex + 1} / {pageCount}
          </div>
          <UI.Button variant="outline" size="sm" onClick={() => instance.nextPage()} disabled={!instance.getCanNextPage()}>
            {texts.next}
          </UI.Button>
        </div>
      ) : null;
    const info = paginationInfo ?? (count ? () => null : undefined);
    return (
      <div className="flex items-center justify-between">
        {info ? (
          <div className="flex items-center justify-between w-full">
            <div>{info({ shown, pageIndex, pageCount })}</div>
            {buttons}
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {texts.shown} {shown} {texts.of} {totalRows}
              {pageCount > 1 && (
                <span className="ml-2">
                  ({texts.page} {pageIndex + 1} {texts.of} {pageCount})
                </span>
              )}
            </div>
            {buttons}
          </>
        )}
      </div>
    );
  }

  // The dense data-grid look (records): hairline cells, sticky label headers.
  const cellClass =
    "max-w-80 overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-3 py-2 text-left align-top";
  const headerCellClass = `${cellClass} sticky top-0 bg-muted/40`;

  const compactTable = (
    <>
    <div className={frame === "bordered" ? "rounded-md border" : undefined} data-data-view-frame={frame}>
      <UI.Text as="table" size="sm" className="w-full border-collapse table-auto">
        {showHeader ? (
          <thead>
            <tr>
              {multiple ? (
                <th className={`${headerCellClass} w-9`}>
                  <UI.FormControl.Checkbox
                    aria-label={texts.selectAll}
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                  />
                </th>
              ) : null}
              {visibleFields.map((field) => (
                <th key={field.id} className={headerCellClass} title={field.headerHint}>
                  {headerContent(field)}
                </th>
              ))}
              {rowActions ? (
                <th className={`${headerCellClass} w-12`}>
                  <span className="sr-only">{rowActionsLabel}</span>
                </th>
              ) : null}
            </tr>
            {headerRow ? (
              <tr>
                {multiple ? <th className={`${headerCellClass} w-9`} /> : null}
                {visibleFields.map((field) => (
                  <th key={field.id} className={headerCellClass}>
                    {headerRow(field)}
                  </th>
                ))}
                {rowActions ? <th className={`${headerCellClass} w-12`} /> : null}
              </tr>
            ) : null}
          </thead>
        ) : null}
        <tbody>
          {sections.flatMap((section) => [
            ...(groupBy
              ? [
                  <tr key={`group:${sectionKey(section)}`}>
                    <td colSpan={tableColumnCount} className="border-b border-border px-3 pb-2 pt-4">
                      {sectionHeading(section)}
                    </td>
                  </tr>,
                ]
              : []),
            ...section.rows.map((row) => {
            const clickable = rowPropsFor(row);
            return (
              <tr
                key={row.id}
                data-state={isSelected(row) ? "selected" : undefined}
                className={"onClick" in clickable ? "cursor-pointer" : undefined}
                {...clickable}
                {...rowAttributes?.(row.original)}
              >
                {multiple ? (
                  <td className={cellClass} onClick={(e) => e.stopPropagation()}>
                    {selectCheckbox(row)}
                  </td>
                ) : null}
                {visibleFields.map((field) => (
                  <td key={field.id} className={cellClass} title={field.hint?.(row.original)}>
                    {renderField(field, row.original)}
                  </td>
                ))}
                {rowActions ? <td className={`${cellClass} w-12`}>{actionsSlot(row.original, "flex justify-end")}</td> : null}
              </tr>
            );
          }),
          ])}
        </tbody>
      </UI.Text>
    </div>
    {showPager ? tableFooter(table) : null}
    </>
  );

  /* ------------------------------------------------------------ cards */

  const titleField = fieldsWithCardRole(fields, "title")[0];
  const cardFields = fieldsWithCardRole(fields, "field");
  const noteFields = fieldsWithCardRole(fields, "note");
  const actionsField = fieldsWithCardRole(fields, "actions")[0];

  const cards = (
    <Box
      direction="column"
      gap={compact ? 2 : 3}
      className={compact ? "p-3 md:hidden" : "md:hidden"}
      data-testid={cardsTestId}
      {...cardsAttributes}
    >
      {isLoading &&
        [0, 1, 2].map((i) => (
          <Box key={i} direction="column" gap={2} className="rounded-lg border border-[var(--border)] p-3">
            <UI.Skeleton height={18} width="full" />
            <UI.Skeleton height={14} width="full" />
          </Box>
        ))}

      {!isLoading && error && (
        <UI.Alert variant="destructive" role="alert">
          {errorMessage ?? texts.errorLoadingData}
        </UI.Alert>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <UI.Text variant="muted" size="sm">
          {emptyMessage ?? texts.dataNotFound}
        </UI.Text>
      )}

      {!isLoading &&
        !error &&
        sections.map((section) => (
          <React.Fragment key={sectionKey(section)}>
          {groupBy ? sectionHeading(section) : null}
          {section.rows.map((row) => {
          const onActivate = activate(row.original);
          const clickable = onActivate ? clickableProps<HTMLDivElement>(onActivate, true) : {};
          const title = titleField ? renderField(titleField, row.original) : null;
          // div, not p: a cell may hold block content (a stack, a badge row).
          const titleText = (
            <UI.Text as="div" size={compact ? "sm" : undefined} weight="medium" className="min-w-0 break-words">
              {title}
            </UI.Text>
          );
          return (
            <Box
              key={row.id}
              direction="column"
              gap={compact ? 1.5 : 2}
              className={`min-w-0 rounded-lg border ${compact ? "border-border" : "border-[var(--border)]"} p-3${onActivate ? " cursor-pointer" : ""}`}
              data-state={isSelected(row) ? "selected" : undefined}
              {...clickable}
              {...cardAttributes?.(row.original)}
            >
              {multiple || compact || rowActions ? (
                <Box direction="row" align="start" gap={2} className="min-w-0">
                  {multiple ? (
                    <Box onClick={(e: React.MouseEvent) => e.stopPropagation()} className="pt-0.5">
                      {selectCheckbox(row)}
                    </Box>
                  ) : null}
                  <div className="min-w-0 flex-1">{titleText}</div>
                  {rowActions ? actionsSlot(row.original, "-my-1 shrink-0") : null}
                </Box>
              ) : (
                titleText
              )}

              {cardFields.map((field) => (
                <Box key={field.id} direction="row" gap={2} className={compact ? "min-w-0 flex-wrap" : "flex-wrap"}>
                  <UI.Text as="span" variant="muted" size="sm" className="shrink-0">
                    {field.label ?? field.id}:
                  </UI.Text>
                  <UI.Text as="div" size="sm" className="break-words min-w-0">
                    {renderField(field, row.original)}
                  </UI.Text>
                </Box>
              ))}

              {noteFields.map((field) => (
                <UI.Text key={field.id} as="span" size="xs" variant="muted">
                  {field.label ?? field.id}: {renderField(field, row.original)}
                </UI.Text>
              ))}

              {actionsField && (
                <Box direction="row" gap={2} className="pt-1">
                  {renderField(actionsField, row.original)}
                </Box>
              )}
            </Box>
          );
          })}
          </React.Fragment>
        ))}

      {showPager && !isLoading && !error && rows.length > 0 && paging.mode !== "none" && (paging.mode === "server-more" || pageCount > 1) && (
        <ListPager
          page={pageIndex + 1}
          totalPages={paging.mode === "server-more" ? undefined : pageCount}
          hasPrev={canPrev}
          hasNext={canNext}
          onPrev={() => goTo(pageIndex - 1)}
          onNext={() => goTo(pageIndex + 1)}
          labels={{ previous: texts.previous, next: texts.next, page: texts.page }}
          className="pt-1"
        />
      )}
    </Box>
  );

  /* ------------------------------------------------------------ tiles */

  const tileTitle = fieldsWithTileRole(fields, "title")[0];
  const tileMedia = fieldsWithTileRole(fields, "media")[0];
  const tileBadge = fieldsWithTileRole(fields, "badge")[0];
  const tileMeta = fieldsWithTileRole(fields, "meta");

  const tiles = isLoading ? (
    <TileGrid data-testid={tilesTestId}>
      {[0, 1, 2].map((i) => (
        <UI.Skeleton key={i} height={96} width="full" />
      ))}
    </TileGrid>
  ) : error ? (
    <UI.Alert variant="destructive" role="alert">
      {errorMessage ?? texts.errorLoadingData}
    </UI.Alert>
  ) : rows.length === 0 ? (
    <UI.Text variant="muted" size="sm">
      {emptyMessage ?? texts.dataNotFound}
    </UI.Text>
  ) : (
    <Box direction="column" gap={6} className="min-w-0" data-testid={groupBy ? tilesTestId : undefined}>
      {sections.map((section) => (
        <Box key={sectionKey(section)} direction="column" gap={3} className="min-w-0">
          {groupBy ? sectionHeading(section) : null}
          <TileGrid data-testid={groupBy ? undefined : tilesTestId}>
            {section.rows.map((row) => {
              const href = rowHref?.(row.original);
              const control = (
                <Tile
                  title={tileTitle ? renderField(tileTitle, row.original) : ""}
                  media={tileMedia ? renderField(tileMedia, row.original) : undefined}
                  badge={tileBadge ? renderField(tileBadge, row.original) : undefined}
                  meta={tileMeta.map((field) => renderField(field, row.original))}
                  selected={selection.mode !== "none" && isSelected(row)}
                  href={href}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={rowActions ? (rowActionsPlacement === "title" ? "h-full [&_[data-slot=tile-title]]:pr-8" : "h-full") : undefined}
                  {...(rowActions ? tileControlAttributes?.(row.original) : rowAttributes?.(row.original))}
                />
              );
              if (!rowActions) return <React.Fragment key={row.id}>{control}</React.Fragment>;
              // A tile is one control (a link or a button), so the actions
              // cannot sit inside it: they sit beside it in a frame, over the
              // top-right corner of the media.
              return (
                <div key={row.id} className="relative min-w-0" data-data-view-tile-frame="" {...rowAttributes?.(row.original)}>
                  {control}
                  {actionsSlot(
                    row.original,
                    // "title": the title line's middle is 12px padding + a 16px
                    // meta line + a 4px gap + half the 20px title above the bottom.
                    rowActionsPlacement === "title" ? "absolute bottom-[28px] right-2 z-10" : "absolute right-2 top-2 z-10"
                  )}
                </div>
              );
            })}
          </TileGrid>
        </Box>
      ))}
    </Box>
  );

  /* ------------------------------------------------------------ frame */

  const desktopError = (
    <div className="flex items-center justify-center p-8">
      <p className="text-destructive">{errorMessage || texts.errorLoadingData}</p>
    </div>
  );

  return (
    <Box direction="column" gap={4} className="min-w-0">
      {/*
        One toolbar for every branch (EP-186, pattern 1): search, filters,
        the count. It used to be drawn twice — the kit table's own search and
        a raw <input type="search"> above the cards — and the filters with it.
      */}
      {hasToolbar ? (
        <Box direction="row" align="center" gap={3} wrap data-testid={toolbarTestId}>
          {drawSearch && onSearchChange ? (
            <Box className="min-w-[12rem] max-w-sm flex-1">
              <UI.FormControl.SearchField
                value={searchValue}
                onChange={onSearchChange}
                placeholder={searchLabel}
                ariaLabel={searchLabel}
                clearLabel={texts.clearSearch}
                inputProps={searchTestId ? ({ "data-testid": searchTestId } as InputTestHook) : undefined}
              />
            </Box>
          ) : null}
          {drawFilters ? filters : null}
          {drawCount && count ? (
            <UI.Text as="span" size="sm" variant="muted" className="ml-auto tabular-nums" data-testid={countTestId}>
              {texts.listCount(count)}
            </UI.Text>
          ) : null}
        </Box>
      ) : null}

      {notice}

      {bulkActions}

      {body ??
        (view === "tiles" ? (
          tiles
        ) : (
          <>
            {/* Desktop and tablet: the table */}
            <Box className="hidden md:block" data-testid={tableTestId} {...tableAttributes}>
              {error ? desktopError : compact ? compactTable : kitTable}
            </Box>

            {/* Narrow screens: cards over the same rows */}
            {cards}
          </>
        ))}
    </Box>
  );
}

/**
 * The admin's list with its strings from the next-intl catalogue. Every
 * list screen goes through it, so the pager and the empty / error lines
 * never fall back to English defaults (SDL-458).
 */
export function DataView<TRow>(props: DataViewProps<TRow> & { texts?: Partial<DataViewTexts> }) {
  const t = useTranslations("common");
  const { texts: override, ...rest } = props;
  const texts: DataViewTexts = {
    searchPlaceholder: t("searchPlaceholder"),
    clearSearch: t("clearSearch"),
    errorLoadingData: t("errorLoadingData"),
    dataNotFound: t("dataNotFound"),
    previous: t("previous"),
    next: t("next"),
    shown: t("shown"),
    of: t("of"),
    page: t("page"),
    listCount: ({ shown, total }) => t("listCount", { shown, total }),
    selectAll: t("selectAll"),
    selectRow: t("selectRow"),
    ...override,
  };
  return <DataViewBase {...rest} texts={texts} />;
}
