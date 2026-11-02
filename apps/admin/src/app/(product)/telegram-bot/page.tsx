"use client";

import { SectionHeader } from "@/shared/components/section-header";
import { useTranslations } from "@/shared/hooks";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

export const dynamic = "force-dynamic";

export default function TelegramBotPage() {
  const tNav = useTranslations("navigation");
  const t = useTranslations("common");

  return (
    <Box gap={5}>
      <SectionHeader title={tNav("telegramBot") as string} description={t("inDevelopment") as string} />

      <UI.EmptyState>
        <UI.Text as="h2" size="lg" weight="semibold">
          {t("inDevelopment") as string}
        </UI.Text>
        <UI.Text size="sm">{t("featureComingSoon") as string}</UI.Text>
      </UI.EmptyState>
    </Box>
  );
}

