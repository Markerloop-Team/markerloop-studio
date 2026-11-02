"use client";

import { SectionHeader } from "@/shared/components/section-header";
import { Globe, MapPin, Languages } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function DictionaryPage() {
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");

  return (
    <Box gap={5}>
      <SectionHeader title={tNav("dictionary")} description={t("dictionaryManagement")} />

      <Box variant="grid" gap={4} columns={1} mdColumns={3}>
        <UI.Link
          variant="action-card"
          href="/dictionary/countries"
          icon={Globe}
          title={t("countries") as string}
          description={t("manageCountriesTranslations") as string}
        />
        <UI.Link
          variant="action-card"
          href="/dictionary/cities"
          icon={MapPin}
          title={t("cities") as string}
          description={t("manageCitiesTranslations") as string}
        />
        <UI.Link
          variant="action-card"
          href="/dictionary/languages"
          icon={Languages}
          title={t("languages") as string}
          description={t("manageLanguagesSystem") as string}
        />
      </Box>
    </Box>
  );
}
