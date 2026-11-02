"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useTranslations } from "@/shared/hooks";
import type { PaginationState } from "@tanstack/react-table";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { Country, CountryWithTranslations } from "@/entities/dictionary/model";
import { useLanguages, getLanguageCodes } from "@/shared/hooks/use-languages";
import * as UI from "@markerloop/ui/ui";
import { DataView, type DataViewField, type DataViewSort } from "@/shared/components/data-view";
import { ListPage, ListRowActions } from "@/shared/components/list-page";
import { EditTranslationDialog } from "@/features/dictionary/edit-translation-dialog";
import { toast } from "sonner";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function CountriesPage() {
  const t = useTranslations("common");
  const tCrumbs = useTranslations("navigation");
  const [sorting, setSorting] = useState<DataViewSort[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [selectedCountry, setSelectedCountry] = useState<CountryWithTranslations | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Загружаем языки из справочника
  const { data: languages } = useLanguages("ru-RU");
  const languageCodes = getLanguageCodes(languages);
  const primaryLanguage = "ru-RU";

  // Формируем параметры запроса для основного языка
  const queryParams = useMemo(() => {
    const params: {
      page?: number;
      limit?: number;
      search?: string;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    } = {
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
    };

    if (globalFilter) {
      params.search = globalFilter;
    }

    if (sorting.length > 0) {
      const sort = sorting[0];
      params.sort_by = sort.field === "code" ? "code" : sort.field === "translations.ru" ? "name" : "code";
      params.sort_order = sort.direction;
    }

    return params;
  }, [pagination, globalFilter, sorting]);

  // Загружаем страны для основного языка с серверной пагинацией
  const { data: primaryCountries, isLoading: isLoadingPrimary, error: primaryError } = useQuery({
    queryKey: ["countries", primaryLanguage, queryParams],
    queryFn: () => dictionaryApi.getCountries(primaryLanguage, queryParams),
    retry: 1,
  });

  // Загружаем переводы для других языков (без пагинации, только для отображения)
  const translationsQueries = useQueries({
    queries: languageCodes
      .filter((lang) => lang !== primaryLanguage)
      .map((lang) => ({
        queryKey: ["countries", lang],
        queryFn: () => dictionaryApi.getCountries(lang),
        enabled: languageCodes.includes(lang) && !!primaryCountries,
        retry: 1,
      })),
  });

  // Извлекаем данные переводов
  const translationsData = useMemo(() => {
    const result: Record<string, Country[]> = {};
    translationsQueries.forEach((query, index) => {
      const lang = languageCodes.filter((l) => l !== primaryLanguage)[index];
      if (query.data) {
        result[lang] = query.data;
      }
    });
    return result;
  }, [translationsQueries, languageCodes, primaryLanguage]);

  const isLoading = isLoadingPrimary || translationsQueries.some((query) => query.isLoading);
  const error = primaryError || translationsQueries.find((q) => q.error)?.error || null;

  // Обработка ошибок
  useEffect(() => {
    if (error) {
      toast.error(t("errorLoadingRoles"));
    }
  }, [error, t]);

  // Обработка изменения пагинации
  const handlePaginationChange = useCallback((pageIndex: number, pageSize: number) => {
    setPagination({ pageIndex, pageSize });
  }, []);

  // Обработка изменения сортировки или фильтрации - сбрасываем на первую страницу
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [sorting, globalFilter]);

  // Объединяем данные стран с переводами
  const countriesWithTranslations = useMemo<CountryWithTranslations[]>(() => {
    if (!primaryCountries || !Array.isArray(primaryCountries)) return [];

    const countryMap = new Map<string, CountryWithTranslations>();

    // Добавляем данные основного языка
    primaryCountries.forEach((country) => {
      const baseLang = primaryLanguage.split("-")[0] as "ru" | "kk" | "en";
      countryMap.set(country.code, {
        ...country,
        translations: {
          [baseLang]: country.name,
        },
      });
    });

    // Добавляем переводы для других языков
    Object.entries(translationsData).forEach(([lang, countries]) => {
      const baseLang = lang.split("-")[0] as "ru" | "kk" | "en";
      countries.forEach((country) => {
        const existing = countryMap.get(country.code);
        if (existing) {
          existing.translations[baseLang] = country.name;
        }
      });
    });

    return Array.from(countryMap.values());
  }, [primaryCountries, translationsData, primaryLanguage]);

  const handleEdit = useCallback((country: CountryWithTranslations) => {
    setSelectedCountry(country);
    setEditDialogOpen(true);
  }, []);

  // The fields follow the dynamic list of languages: the code is the card's
  // title, each translation a table column and a card field. The ids keep
  // the column ids the table had (`translations_<lang>`).
  const fields = useMemo<DataViewField<CountryWithTranslations>[]>(() => {
    const result: DataViewField<CountryWithTranslations>[] = [
      {
        id: "code",
        label: t("code"),
        value: (country) => country.code,
        render: (country) => (
          <UI.Text as="span" variant="mono" size="sm" weight="medium">
            {String(country.code ?? "")}
          </UI.Text>
        ),
        card: "title",
      },
    ];

    languageCodes.forEach((lang) => {
      const baseLang = lang.split("-")[0] as "ru" | "kk" | "en";
      const langLabel = languages?.find((l) => l.code === lang)?.name || lang;

      result.push({
        id: `translations_${baseLang}`,
        label: `${langLabel} (${lang})`,
        value: (country) => country.translations[baseLang],
        render: (country) => {
          const translation = country.translations[baseLang];
          return translation ? (
            <UI.Text as="span">{translation}</UI.Text>
          ) : (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          );
        },
        card: "field",
      });
    });

    result.push({
      id: "actions",
      label: t("actions"),
      sortable: false,
      render: (country) => (
        <ListRowActions onEdit={() => handleEdit(country)} editLabel={t("editTranslations")} />
      ),
      card: "actions",
    });

    return result;
  }, [languageCodes, languages, t, handleEdit]);

  return (
    <ListPage
      crumbs={[{ label: tCrumbs("dictionary") as string, href: "/dictionary" }, { label: t("countries") as string }]}
      title={t("countries")} description={t("manageCountriesTranslations")}>
      <DataView
        fields={fields}
        data={countriesWithTranslations}
        getRowId={(country) => country.code}
        isLoading={isLoading}
        error={error}
        errorMessage={t("errorLoadingRoles")}
        emptyMessage={t("countriesNotFound")}
        searchPlaceholder={t("searchByCodeOrName")}
        searchValue={globalFilter}
        onSearchChange={setGlobalFilter}
        sort={sorting}
        onSortChange={setSorting}
        sortMode="server"
        paging={{
          mode: "server",
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
          total: primaryCountries?.length ?? 0,
          pageCount: Math.ceil((primaryCountries?.length ?? 0) / pagination.pageSize),
          onPageChange: (pageIndex) => handlePaginationChange(pageIndex, pagination.pageSize),
        }}
        paginationInfo={({ shown }) => (
          <UI.Text variant="muted" size="sm">
            {t("shown")} {shown} {t("of")}{" "}
            {primaryCountries?.length ?? 0} {t("countriesCount")}
          </UI.Text>
        )}
      />


      {/* Диалог редактирования переводов */}
      {selectedCountry && (
        <EditTranslationDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          type="country"
          code={selectedCountry.code}
          translations={selectedCountry.translations}
        />
      )}
    </ListPage>
  );
}
