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
import { Edit, X } from "lucide-react";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { City, CityWithTranslations, Country } from "@/entities/dictionary/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { EditTranslationDialog } from "./edit-translation-dialog";
import { useTranslations } from "@/shared/hooks";

export function CitiesTab() {
  const t = useTranslations("common");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<CityWithTranslations | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Загружаем страны для выбора
  const { data: countries } = useQuery({
    queryKey: ["countries", "ru-RU"],
    queryFn: () => dictionaryApi.getCountries("ru-RU"),
  });

  // Загружаем города для выбранной страны (для всех языков)
  const { data: citiesRu, isLoading: loadingRu } = useQuery({
    queryKey: ["cities", selectedCountryCode, "ru-RU"],
    queryFn: () => dictionaryApi.getCities(selectedCountryCode, "ru-RU"),
    enabled: !!selectedCountryCode,
  });

  const { data: citiesKk, isLoading: loadingKk } = useQuery({
    queryKey: ["cities", selectedCountryCode, "kk-KZ"],
    queryFn: () => dictionaryApi.getCities(selectedCountryCode, "kk-KZ"),
    enabled: !!selectedCountryCode,
  });

  const { data: citiesEn, isLoading: loadingEn } = useQuery({
    queryKey: ["cities", selectedCountryCode, "en-US"],
    queryFn: () => dictionaryApi.getCities(selectedCountryCode, "en-US"),
    enabled: !!selectedCountryCode,
  });

  // Объединяем данные городов с переводами
  const citiesWithTranslations = useMemo<CityWithTranslations[]>(() => {
    if (!citiesRu || !citiesKk || !citiesEn) return [];

    const cityMap = new Map<string, CityWithTranslations>();

    // Создаем мапу из русских городов
    citiesRu.forEach((city) => {
      cityMap.set(city.code, {
        ...city,
        translations: {
          ru: city.name,
        },
      });
    });

    // Добавляем казахские переводы
    citiesKk.forEach((city) => {
      const existing = cityMap.get(city.code);
      if (existing) {
        existing.translations.kk = city.name;
      }
    });

    // Добавляем английские переводы
    citiesEn.forEach((city) => {
      const existing = cityMap.get(city.code);
      if (existing) {
        existing.translations.en = city.name;
      }
    });

    return Array.from(cityMap.values());
  }, [citiesRu, citiesKk, citiesEn]);

  const isLoading = loadingRu || loadingKk || loadingEn;

  // Фильтрация данных
  const filteredCities = useMemo(() => {
    if (!citiesWithTranslations.length) return [];

    let filtered = [...citiesWithTranslations];

    if (globalFilter) {
      const searchLower = globalFilter.toLowerCase();
      filtered = filtered.filter(
        (city) =>
          city.code.toLowerCase().includes(searchLower) ||
          city.translations.ru?.toLowerCase().includes(searchLower) ||
          city.translations.kk?.toLowerCase().includes(searchLower) ||
          city.translations.en?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [citiesWithTranslations, globalFilter]);

  const handleEdit = (city: CityWithTranslations) => {
    setSelectedCity(city);
    setEditDialogOpen(true);
  };

  const columns = useMemo<ColumnDef<CityWithTranslations>[]>(
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
        accessorKey: "country_code",
        header: t("countryCode") as string,
        cell: ({ row }) => (
          <UI.Text as="span" variant="mono" size="sm">
            {String(row.getValue("country_code") ?? "")}
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
          const city = row.original;
          return (
            <UI.Button
              variant="ghost"
              size="icon"
              aria-label={t("editTranslations") as string}
              onClick={() => handleEdit(city)}
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
    data: filteredCities,
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
      {/* Фильтр по стране */}
      <Box direction="row" align="center" gap={4}>
        <UI.FormControl.Select.Root value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
          <UI.FormControl.Select.Trigger width={250}>
            <UI.FormControl.Select.Value placeholder={t("selectCountry") as string} />
          </UI.FormControl.Select.Trigger>
          <UI.FormControl.Select.Content>
            {countries?.map((country) => (
              <UI.FormControl.Select.Item key={country.code} value={country.code}>
                {country.code} - {country.name}
              </UI.FormControl.Select.Item>
            ))}
          </UI.FormControl.Select.Content>
        </UI.FormControl.Select.Root>

        {selectedCountryCode && (
          <UI.Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCountryCode("");
              setGlobalFilter("");
            }}
          >
            <X size={16} />
            {t("resetFilter") as string}
          </UI.Button>
        )}
      </Box>

      {!selectedCountryCode ? (
        <UI.EmptyState paddingY={8}>{t("selectCountryToView") as string}</UI.EmptyState>
      ) : (
        <>
          {/* Поиск */}
          <UI.FormControl.SearchField
            value={globalFilter}
            onChange={setGlobalFilter}
            onClear={() => setGlobalFilter("")}
            placeholder={t("searchByCodeOrName") as string}
            ariaLabel={t("searchByCodeOrName") as string}
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
                      {t("citiesNotFound") as string}
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
              {t("of") as string} {filteredCities.length}{" "}
              {t("citiesCount") as string}
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
        </>
      )}

      {/* Диалог редактирования переводов */}
      {selectedCity && (
        <EditTranslationDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          type="city"
          code={`${selectedCity.code}.${selectedCity.country_code}`}
          translations={selectedCity.translations}
        />
      )}
    </Box>
  );
}

