"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { Language } from "@/entities/dictionary/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";

export function LanguagesTab() {
  const t = useTranslations("common");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const { data: languages, isLoading } = useQuery({
    queryKey: ["languages", "ru-RU"],
    queryFn: () => dictionaryApi.getLanguages("ru-RU"),
  });

  // Фильтрация данных
  const filteredLanguages = useMemo(() => {
    if (!languages || !Array.isArray(languages)) return [];

    let filtered = [...languages];

    if (globalFilter) {
      const searchLower = globalFilter.toLowerCase();
      filtered = filtered.filter(
        (lang) =>
          lang.code.toLowerCase().includes(searchLower) ||
          lang.name.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [languages, globalFilter]);

  const columns = useMemo<ColumnDef<Language>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("code") as string,
        cell: ({ row }) => (
          <UI.Text as="span" variant="mono" size="sm" weight="medium">
            {String(row.getValue("code") ?? "")}
          </UI.Text>
        ),
      },
      {
        accessorKey: "name",
        header: t("name") as string,
        cell: ({ row }) => <UI.Text as="span">{String(row.getValue("name") ?? "")}</UI.Text>,
      },
    ],
    [t]
  );

  const table = useReactTable({
    data: filteredLanguages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    manualFiltering: true,
  });

  return (
    <Box gap={4}>
      <UI.FormControl.SearchField
        value={globalFilter}
        onChange={setGlobalFilter}
        onClear={() => setGlobalFilter("")}
        placeholder={t("searchByCodeOrName") as string}
        ariaLabel={t("clearSearch") as string}
        maxWidth={384}
      />

      {/* Таблица */}
      <Box variant="panel">
        <UI.Table.Root>
          <UI.Table.Header>
            {table.getHeaderGroups().map((headerGroup) => (
              <UI.Table.Row key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <UI.Table.Head key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </UI.Table.Head>
                ))}
              </UI.Table.Row>
            ))}
          </UI.Table.Header>
          <UI.Table.Body>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <UI.Table.Row key={i}>
                  {columns.map((_, j) => (
                    <UI.Table.Cell key={j}>
                      <UI.Skeleton height={16} width="full" />
                    </UI.Table.Cell>
                  ))}
                </UI.Table.Row>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <UI.Table.Row
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <UI.Table.Cell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </UI.Table.Cell>
                  ))}
                </UI.Table.Row>
              ))
            ) : (
              <UI.Table.Row>
                <UI.Table.Cell colSpan={columns.length} height={96} align="center">
                  {t("languagesNotFound") as string}
                </UI.Table.Cell>
              </UI.Table.Row>
            )}
          </UI.Table.Body>
        </UI.Table.Root>
      </Box>

      {/* Пагинация */}
      <Box direction="row" align="center" justify="between">
        <UI.Text variant="muted" size="sm">
          {t("shown") as string} {table.getRowModel().rows.length}{" "}
          {t("of") as string} {filteredLanguages.length}{" "}
          {t("languagesCount") as string}
        </UI.Text>
        <Box direction="row" align="center" gap={2}>
          <UI.Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {t("previous") as string}
          </UI.Button>
          <UI.Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t("next") as string}
          </UI.Button>
        </Box>
      </Box>
    </Box>
  );
}

