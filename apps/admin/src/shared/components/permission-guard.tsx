"use client";

import { useAuthStore } from "@/shared/store/auth-store";
import { useTranslations } from "@/shared/hooks";
import { Box, Text } from "@markerloop/ui/ui";
import type { ReactNode } from "react";

interface PermissionGuardProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Показывает children только если у пользователя есть указанный permission.
 * Для оборачивания кнопок, секций, действий.
 */
export function PermissionGuard({ permission, children, fallback = null }: PermissionGuardProps) {
  const { permissions, roles } = useAuthStore();
  if (roles.includes("superadmin")) return <>{children}</>;
  if (permissions.includes(permission)) return <>{children}</>;
  return <>{fallback}</>;
}

interface PagePermissionGuardProps {
  permission: string;
  children: ReactNode;
}

/**
 * Guard для целой страницы — показывает "Нет доступа" если нет permission.
 */
export function PagePermissionGuard({ permission, children }: PagePermissionGuardProps) {
  const { permissions, roles } = useAuthStore();
  const t = useTranslations("common");

  if (roles.includes("superadmin")) return <>{children}</>;
  if (permissions.includes(permission)) return <>{children}</>;

  return (
    <Box variant="center" padding={8}>
      <Box gap={4} align="center">
        <Text size="xl" weight="semibold">{t("accessDenied") as string}</Text>
        <Text variant="muted">{t("noPermissionForPage") as string}</Text>
      </Box>
    </Box>
  );
}
