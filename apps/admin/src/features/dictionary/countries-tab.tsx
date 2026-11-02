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
import { Edit } from "lucide-react";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { Country, CountryWithTranslations } from "@/entities/dictionary/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { EditTranslationDialog } from "./edit-translation-dialog";
import { useTranslations } from "@/shared/hooks";

export function CountriesTab() {
  const t = useTranslations("common");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryWithTranslations | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Загружаем страны для всех языков
  const { data: countriesRu, isLoading: loadingRu } = useQuery({
    queryKey: ["countries", "ru-RU"],
    queryFn: () => dictionaryApi.getCountries("ru-RU"),
  });

  const { data: countriesKk, isLoading: loadingKk } = useQuery({
    queryKey: ["countries", "kk-KZ"],
    queryFn: () => dictionaryApi.getCountries("kk-KZ"),
  });

  const { data: countriesEn, isLoading: loadingEn } = useQuery({
    queryKey: ["countries", "en-US"],
    queryFn: () => dictionaryApi.getCountries("en-US"),
  });

  // Объединяем данные стран с переводами
  const countriesWithTranslations = useMemo<CountryWithTranslations[]>(() => {
    if (!countriesRu || !countriesKk || !countriesEn) return [];

    const countryMap = new Map<string, CountryWithTranslations>();

    // Создаем мапу из русских стран
    countriesRu.forEach((country) => {
      countryMap.set(country.code, {
        ...country,
        translations: {
          ru: country.name,
        },
      });
    });

    // Добавляем казахские переводы
    countriesKk.forEach((country) => {
      const existing = countryMap.get(country.code);
      if (existing) {
        existing.translations.kk = country.name;
      }
    });

    // Добавляем английские переводы
    countriesEn.forEach((country) => {
      const existing = countryMap.get(country.code);
      if (existing) {
        existing.translations.en = country.name;
      }
    });

    return Array.from(countryMap.values());
  }, [countriesRu, countriesKk, countriesEn]);

  const isLoading = loadingRu || loadingKk || loadingEn;

  // Фильтрация данных
  const filteredCountries = useMemo(() => {
    if (!countriesWithTranslations.length) return [];

    let filtered = [...countriesWithTranslations];

    if (globalFilter) {
      const searchLower = globalFilter.toLowerCase();
      filtered = filtered.filter(
        (country) =>
          country.code.toLowerCase().includes(searchLower) ||
          country.translations.ru?.toLowerCase().includes(searchLower) ||
          country.translations.kk?.toLowerCase().includes(searchLower) ||
          country.translations.en?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [countriesWithTranslations, globalFilter]);

  const handleEdit = (country: CountryWithTranslations) => {
    setSelectedCountry(country);
    setEditDialogOpen(true);
  };

  const columns = useMemo<ColumnDef<CountryWithTranslations>[]>(
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
        accessorKey: "translations.ru",
        header: t("russian") as string,
        cell: ({ row }) => {
          const translation = row.original.translations.ru;
          return translation ? (
            <UI.Text as="span">{translation}</UI.Text>
          ) : (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          );
        },
      },
      {
        accessorKey: "translations.kk",
        header: t("kazakh") as string,
        cell: ({ row }) => {
          const translation = row.original.translations.kk;
          return translation ? (
            <UI.Text as="span">{translation}</UI.Text>
          ) : (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          );
        },
      },
      {
        accessorKey: "translations.en",
        header: t("english") as string,
        cell: ({ row }) => {
          const translation = row.original.translations.en;
          return translation ? (
            <UI.Text as="span">{translation}</UI.Text>
          ) : (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          );
        },
      },
      {
        id: "actions",
        header: t("actions") as string,
        cell: ({ row }) => {
          const country = row.original;
          return (
            <UI.Button
              variant="ghost"
              size="icon"
              aria-label={t("editTranslations") as string}
              onClick={() => handleEdit(country)}
            >
              <Edit size={16} />
            </UI.Button>
          );
        },
      },
    ],
    [t]
  );

  const table = useReactTable({
    data: filteredCountries,
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
        ariaLabel={t("searchByCodeOrName") as string}
        maxWidth={384}
      />

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
                  {t("countriesNotFound") as string}
                </UI.Table.Cell>
              </UI.Table.Row>
            )}
          </UI.Table.Body>
        </UI.Table.Root>
      </Box>

      <Box direction="row" align="center" justify="between">
        <UI.Text variant="muted" size="sm">
          {t("shown") as string} {table.getRowModel().rows.length}{" "}
          {t("of") as string} {filteredCountries.length}{" "}
          {t("countriesCount") as string}
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

      {selectedCountry && (
        <EditTranslationDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          type="country"
          code={selectedCountry.code}
          translations={selectedCountry.translations}
        />
      )}
    </Box>
  );
}

