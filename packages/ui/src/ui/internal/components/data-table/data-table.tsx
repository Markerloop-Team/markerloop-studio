"use client";

import { ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Table as TanstackTable,
} from "@tanstack/react-table";
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table";
import { Input } from "../input";
import { Button } from "../button";
import { Skeleton } from "../skeleton";

/** `data-*` attributes a host may stamp on a body row. */
export type DataTableRowAttributes = Record<`data-${string}`, string | undefined>;

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  error?: Error | null;
  errorMessage?: string;
  emptyMessage?: string;
  // Поиск
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showSearch?: boolean;
  // Фильтры (опциональные дополнительные фильтры)
  filters?: ReactNode;
  // Пагинация
  pageSize?: number;
  showPagination?: boolean;
  paginationInfo?: (table: TanstackTable<TData>) => ReactNode;
  // Серверная пагинация
  manualPagination?: boolean;
  pageCount?: number;
  pageIndex?: number;
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  // Сортировка
  sorting?: SortingState;
  onSortingChange?: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
  // Серверная сортировка
  manualSorting?: boolean;
  // Дополнительные опции таблицы
  manualFiltering?: boolean;
  /**
   * Extra attributes for each body row (`<tr>`), e.g. a host's test hook
   * `{ "data-testid": "address-row", "data-route-id": id }`.
   */
  getRowProps?: (row: TData) => DataTableRowAttributes;
  // Тексты для локализации
  texts?: {
    searchPlaceholder?: string;
    clearSearch?: string;
    errorLoadingData?: string;
    dataNotFound?: string;
    previous?: string;
    next?: string;
    shown?: string;
    of?: string;
    page?: string;
  };
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  error = null,
  errorMessage,
  emptyMessage,
  searchPlaceholder,
  searchValue = "",
  onSearchChange,
  showSearch = true,
  filters,
  pageSize = 10,
  showPagination = true,
  paginationInfo,
  manualPagination = false,
  pageCount: externalPageCount,
  pageIndex: externalPageIndex,
  onPaginationChange,
  sorting = [],
  onSortingChange,
  manualSorting = false,
  manualFiltering = true,
  getRowProps,
  texts = {},
}: DataTableProps<TData, TValue>) {
  // Дефолтные тексты
  const defaultTexts = {
    searchPlaceholder: texts.searchPlaceholder || "Search...",
    clearSearch: texts.clearSearch || "Clear search",
    errorLoadingData: texts.errorLoadingData || "Error loading data",
    dataNotFound: texts.dataNotFound || "No data found",
    previous: texts.previous || "Previous",
    next: texts.next || "Next",
    shown: texts.shown || "Shown",
    of: texts.of || "of",
    page: texts.page || "Page",
  };
  
  // Вычисляем количество страниц
  const pageCount = externalPageCount ?? (manualPagination ? 1 : Math.ceil(data.length / pageSize));
  const totalRows = manualPagination ? (externalPageCount ?? 0) * pageSize : data.length;
  const currentPageIndex = externalPageIndex ?? 0;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    onSortingChange: onSortingChange,
    onGlobalFilterChange: onSearchChange,
    manualPagination,
    manualSorting,
    pageCount,
    state: {
      sorting,
      globalFilter: searchValue,
      pagination: {
        pageIndex: currentPageIndex,
        pageSize,
      },
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
    manualFiltering,
    onPaginationChange: (updater) => {
      if (onPaginationChange) {
        const currentState = table.getState().pagination;
        const newState = typeof updater === "function" ? updater(currentState) : updater;
        onPaginationChange(newState.pageIndex, newState.pageSize);
      }
    },
  });

  // Состояние ошибки
  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-destructive">
          {errorMessage || defaultTexts.errorLoadingData}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Поиск и фильтры */}
      {(showSearch || filters) && (
        <div className="flex flex-wrap items-center gap-4">
          {showSearch && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder || defaultTexts.searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-9"
              />
              {searchValue && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => onSearchChange?.("")}
                  aria-label={defaultTexts.clearSearch}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          {filters}
        </div>
      )}

      {/* Таблица */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-2">
                          {canSort ? (
                            <button
                              type="button"
                              className="flex items-center gap-2 py-2 -my-2 min-h-9 rounded-sm hover:text-foreground transition-colors outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                              onClick={() => header.column.toggleSorting()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {{
                                asc: <ArrowUp className="h-4 w-4" />,
                                desc: <ArrowDown className="h-4 w-4" />,
                              }[header.column.getIsSorted() as string] ?? (
                                <ArrowUpDown className="h-4 w-4 opacity-50" />
                              )}
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  {...getRowProps?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyMessage || defaultTexts.dataNotFound}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Пагинация - показываем всегда, если есть данные */}
      {showPagination && (
        <div className="flex items-center justify-between">
          {paginationInfo ? (
            <div className="flex items-center justify-between w-full">
              <div>{paginationInfo(table)}</div>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    {defaultTexts.previous}
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {table.getState().pagination.pageIndex + 1} / {pageCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    {defaultTexts.next}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                {defaultTexts.shown} {table.getRowModel().rows.length} {defaultTexts.of}{" "}
                {totalRows}
                {pageCount > 1 && (
                  <span className="ml-2">
                    ({defaultTexts.page} {table.getState().pagination.pageIndex + 1} {defaultTexts.of}{" "}
                    {pageCount})
                  </span>
                )}
              </div>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    {defaultTexts.previous}
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {table.getState().pagination.pageIndex + 1} / {pageCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    {defaultTexts.next}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
