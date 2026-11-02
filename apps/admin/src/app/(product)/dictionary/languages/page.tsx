"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@/shared/hooks";
import { dictionaryApi } from "@/entities/dictionary/api";
import type { Language } from "@/entities/dictionary/model";
import * as UI from "@markerloop/ui/ui";
import { DataView, type DataViewField, type DataViewSort } from "@/shared/components/data-view";
import { ListPage } from "@/shared/components/list-page";
import { toast } from "sonner";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function LanguagesPage() {
  const t = useTranslations("common");
  const tCrumbs = useTranslations("navigation");
  const [sorting, setSorting] = useState<DataViewSort[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const { data: languages, isLoading, error } = useQuery({
    queryKey: ["languages", "ru-RU"],
    queryFn: () => dictionaryApi.getLanguages("ru-RU"),
    retry: 1,
  });

  // Обработка ошибок
  useEffect(() => {
    if (error) {
      toast.error(t("errorLoadingPermissions"));
    }
  }, [error, t]);

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

  const fields = useMemo<DataViewField<Language>[]>(
    () => [
      {
        id: "code",
        label: t("code"),
        value: (lang) => lang.code,
        render: (lang) => (
          <UI.Text as="span" variant="mono" size="sm" weight="medium">
            {String(lang.code ?? "")}
          </UI.Text>
        ),
        card: "field",
      },
      {
        id: "name",
        label: t("name"),
        value: (lang) => lang.name,
        render: (lang) => <UI.Text as="span">{String(lang.name ?? "")}</UI.Text>,
        card: "title",
      },
    ],
    [t]
  );

  return (
    <ListPage
      crumbs={[{ label: tCrumbs("dictionary") as string, href: "/dictionary" }, { label: t("languages") as string }]}
      title={t("languages")} description={t("manageLanguagesSystem")}>
      <DataView
        fields={fields}
        data={filteredLanguages}
        getRowId={(lang) => lang.code}
        isLoading={isLoading}
        error={error}
        errorMessage={t("errorLoadingPermissions")}
        emptyMessage={t("languagesNotFound")}
        searchPlaceholder={t("searchByCodeOrName")}
        searchValue={globalFilter}
        onSearchChange={setGlobalFilter}
        sort={sorting}
        onSortChange={setSorting}
        paging={{ mode: "client", pageSize: 10 }}
        paginationInfo={({ shown }) => (
          <UI.Text variant="muted" size="sm">
            {t("shown")} {shown} {t("of")} {filteredLanguages.length}{" "}
            {t("languagesCount")}
          </UI.Text>
        )}
      />
    </ListPage>
  );
}
