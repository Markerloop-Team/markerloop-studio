"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useTranslations } from "@/shared/hooks";
import { X } from "lucide-react";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { City, CityWithTranslations } from "@/entities/dictionary/model";
import { useLanguages, getLanguageCodes } from "@/shared/hooks/use-languages";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { DataView, type DataViewField, type DataViewSort } from "@/shared/components/data-view";
import { ListPage, ListRowActions } from "@/shared/components/list-page";
import { EditTranslationDialog } from "@/features/dictionary/edit-translation-dialog";
import { validateCountryCode } from "@/shared/lib/validation/dictionary";
import { toast } from "sonner";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function CitiesPage() {
  const t = useTranslations("common");
  const tCrumbs = useTranslations("navigation");
  const tNav = useTranslations("navigation");
  const tDialog = useTranslations("common.dialogs.dictionary");
  const [sorting, setSorting] = useState<DataViewSort[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<CityWithTranslations | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Загружаем языки из справочника
  const { data: languages } = useLanguages("ru-RU");
  const languageCodes = getLanguageCodes(languages);

  // Загружаем страны для выбора
  const { data: countries, error: countriesError } = useQuery({
    queryKey: ["countries", "ru-RU"],
    queryFn: () => dictionaryApi.getCountries("ru-RU"),
  });

  // Валидация кода страны
  const isValidCountryCode = selectedCountryCode === "" || validateCountryCode(selectedCountryCode);

  // Оптимизированная загрузка городов для всех языков параллельно
  const citiesQueries = useQueries({
    queries: languageCodes.map((lang) => ({
      queryKey: ["cities", selectedCountryCode, lang],
      queryFn: () => dictionaryApi.getCities(selectedCountryCode, lang),
      enabled: !!selectedCountryCode && isValidCountryCode && languageCodes.includes(lang),
      retry: 1,
    })),
  });

  // Извлекаем данные и состояния загрузки
  const citiesData = useMemo(() => {
    const result: Record<string, City[]> = {};
    citiesQueries.forEach((query, index) => {
      const lang = languageCodes[index];
      if (query.data) {
        result[lang] = query.data;
      }
    });
    return result;
  }, [citiesQueries, languageCodes]);

  const isLoading = citiesQueries.some((query) => query.isLoading);
  const hasError = citiesQueries.some((query) => query.error);
  const error = countriesError || (hasError && selectedCountryCode ? citiesQueries.find((q) => q.error)?.error || null : null);

  // Обработка ошибок
  useEffect(() => {
    if (countriesError) {
      toast.error(t("errorLoadingUsers"));
    }
  }, [countriesError, t]);

  useEffect(() => {
    if (hasError && selectedCountryCode) {
      const errorQuery = citiesQueries.find((q) => q.error);
      if (errorQuery?.error) {
        toast.error(t("errorLoadingUsers"));
      }
    }
  }, [hasError, selectedCountryCode, citiesQueries, t]);

  // Объединяем данные городов с переводами
  const citiesWithTranslations = useMemo<CityWithTranslations[]>(() => {
    if (!selectedCountryCode || !languageCodes.length || !isValidCountryCode) {
      return [];
    }

    const cityMap = new Map<string, CityWithTranslations>();

    // Добавляем переводы для каждого языка
    languageCodes.forEach((lang) => {
      const baseLang = lang.split("-")[0] as "ru" | "kk" | "en";
      const cities = citiesData[lang];
      
      if (cities) {
        cities.forEach((city) => {
          const existing = cityMap.get(city.code);
          if (existing) {
            existing.translations[baseLang] = city.name;
          } else {
            cityMap.set(city.code, {
              ...city,
              translations: {
                [baseLang]: city.name,
              },
            });
          }
        });
      }
    });

    return Array.from(cityMap.values());
  }, [selectedCountryCode, languageCodes, citiesData, isValidCountryCode]);

  // Фильтрация данных
  const filteredCities = useMemo(() => {
    if (!citiesWithTranslations.length) return [];

    let filtered = [...citiesWithTranslations];

    if (globalFilter) {
      const searchLower = globalFilter.toLowerCase();
      filtered = filtered.filter(
        (city) =>
          city.code.toLowerCase().includes(searchLower) ||
          Object.values(city.translations).some((translation) =>
            typeof translation === "string" && translation.toLowerCase().includes(searchLower)
          )
      );
    }

    return filtered;
  }, [citiesWithTranslations, globalFilter]);

  const handleEdit = useCallback((city: CityWithTranslations) => {
    setSelectedCity(city);
    setEditDialogOpen(true);
  }, []);

  // The fields follow the dynamic list of languages: the code is the card's
  // title, the country code and each translation are table columns and card
  // fields.
  const fields = useMemo<DataViewField<CityWithTranslations>[]>(() => {
    const result: DataViewField<CityWithTranslations>[] = [
      {
        id: "code",
        label: t("code"),
        value: (city) => city.code,
        render: (city) => (
          <UI.Text as="span" variant="mono" size="sm" weight="medium">
            {String(city.code ?? "")}
          </UI.Text>
        ),
        card: "title",
      },
      {
        id: "country_code",
        label: t("countryCode"),
        value: (city) => city.country_code,
        render: (city) => (
          <UI.Text as="span" variant="mono" size="sm">
            {String(city.country_code ?? "")}
          </UI.Text>
        ),
        card: "field",
      },
    ];

    languageCodes.forEach((lang) => {
      const baseLang = lang.split("-")[0] as "ru" | "kk" | "en";
      const langLabel = languages?.find((l) => l.code === lang)?.name || lang;

      result.push({
        id: `translations_${baseLang}`,
        label: `${langLabel} (${lang})`,
        value: (city) => city.translations[baseLang],
        render: (city) => {
          const translation = city.translations[baseLang];
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
      render: (city) => (
        <ListRowActions onEdit={() => handleEdit(city)} editLabel={t("editTranslations")} />
      ),
      card: "actions",
    });

    return result;
  }, [languageCodes, languages, t, handleEdit]);

  // Фильтр по стране
  const countryFilter = (
    <Box direction="row" align="center" gap={4}>
      <UI.FormControl.Select.Root
        value={selectedCountryCode} 
        onValueChange={(value: string) => {
          // Валидация перед установкой
          if (value === "" || validateCountryCode(value)) {
            setSelectedCountryCode(value);
            setGlobalFilter(""); // Сбрасываем поиск при смене страны
          } else {
            toast.error(`${t("error")}: ${tDialog("invalidCountryCode")}`);
          }
        }}
      >
        <UI.FormControl.Select.Trigger width={250}>
          <UI.FormControl.Select.Value placeholder={t("selectCountry")} />
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
          {t("resetFilter")}
        </UI.Button>
      )}
    </Box>
  );

  return (
    <ListPage
      crumbs={[{ label: tCrumbs("dictionary") as string, href: "/dictionary" }, { label: t("cities") as string }]}
      title={t("cities")} description={t("manageCitiesTranslations")}>
      {!selectedCountryCode ? (
        <Box gap={4}>
          {countryFilter}
          <UI.EmptyState paddingY={8}>{t("selectCountryToView")}</UI.EmptyState>
        </Box>
      ) : (
        <DataView
          fields={fields}
          data={filteredCities}
          getRowId={(city) => `${city.code}.${city.country_code}`}
          isLoading={isLoading}
          error={error}
          errorMessage={t("errorLoadingUsers")}
          emptyMessage={t("citiesNotFound")}
          searchPlaceholder={t("searchByCodeOrName")}
          searchValue={globalFilter}
          onSearchChange={setGlobalFilter}
          filters={countryFilter}
          sort={sorting}
          onSortChange={setSorting}
          paging={{ mode: "client", pageSize: 10 }}
          paginationInfo={({ shown }) => (
            <UI.Text variant="muted" size="sm">
              {t("shown")} {shown} {t("of")} {filteredCities.length}{" "}
              {t("citiesCount")}
            </UI.Text>
          )}
        />

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
    </ListPage>
  );
}
