"use client";

import { X } from "lucide-react";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

interface UserFiltersProps {
  emailVerifiedFilter: string;
  dateFilter: string;
  onEmailVerifiedFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onResetFilters: () => void;
}

export function UserFilters({
  emailVerifiedFilter,
  dateFilter,
  onEmailVerifiedFilterChange,
  onDateFilterChange,
  onResetFilters,
}: UserFiltersProps) {
  const t = useTranslations("common");

  const hasActiveFilters =
    emailVerifiedFilter !== "all" || dateFilter !== "all";

  return (
    <Box direction="row" wrap align="center" gap={4}>
      <UI.FormControl.Select.Root
        value={emailVerifiedFilter}
        onValueChange={onEmailVerifiedFilterChange}
      >
        <UI.FormControl.Select.Trigger width={180}>
          <UI.FormControl.Select.Value placeholder={t("emailVerifiedStatus")} />
        </UI.FormControl.Select.Trigger>
        <UI.FormControl.Select.Content>
          <UI.FormControl.Select.Item value="all">{t("all")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="verified">{t("verified")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="unverified">{t("unverified")}</UI.FormControl.Select.Item>
        </UI.FormControl.Select.Content>
      </UI.FormControl.Select.Root>
      <UI.FormControl.Select.Root value={dateFilter} onValueChange={onDateFilterChange}>
        <UI.FormControl.Select.Trigger width={180}>
          <UI.FormControl.Select.Value placeholder={t("dateCreated")} />
        </UI.FormControl.Select.Trigger>
        <UI.FormControl.Select.Content>
          <UI.FormControl.Select.Item value="all">{t("all")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="today">{t("today")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="week">{t("week")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="month">{t("month")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="year">{t("year")}</UI.FormControl.Select.Item>
        </UI.FormControl.Select.Content>
      </UI.FormControl.Select.Root>
      {hasActiveFilters && (
        <UI.Button variant="outline" size="sm" onClick={onResetFilters}>
          <X size={16} />
          {t("resetFilters")}
        </UI.Button>
      )}
    </Box>
  );
}

