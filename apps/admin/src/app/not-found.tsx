"use client";

import Link from "next/link";
import { Box, Button, EmptyState, Text } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { PRODUCT_HOME } from "@/shared/config/product-routes";

export default function NotFound() {
  const t = useTranslations("common");

  return (
    <Box align="center" justify="center" className="min-h-dvh p-6">
      <Box variant="panel" padding={6} className="w-full max-w-xl">
        <EmptyState paddingY={10}>
          <Text as="h1" size="2xl" weight="bold">
            {t("notFoundTitle") as string}
          </Text>
          <Text variant="muted">{t("notFoundHint") as string}</Text>
          <Button asChild>
            <Link href={PRODUCT_HOME}>{t("goHome") as string}</Link>
          </Button>
        </EmptyState>
      </Box>
    </Box>
  );
}
