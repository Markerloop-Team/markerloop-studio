"use client";

import { useAuthStore } from "@/shared/store/auth-store";

/**
 * Проверяет наличие конкретного permission по code
 */
export function useHasPermission(code: string): boolean {
  const { permissions, roles } = useAuthStore();
  // superadmin имеет все разрешения
  if (roles.includes("superadmin")) return true;
  return permissions.includes(code);
}

/**
 * Проверяет наличие любого из указанных permissions
 */
export function useHasAnyPermission(codes: string[]): boolean {
  const { permissions, roles } = useAuthStore();
  if (roles.includes("superadmin")) return true;
  return codes.some((code) => permissions.includes(code));
}

/**
 * Проверяет наличие роли
 */
export function useHasRole(role: string): boolean {
  const { roles } = useAuthStore();
  return roles.includes(role);
}

/**
 * Возвращает true если пользователь superadmin
 */
export function useIsSuperAdmin(): boolean {
  return useHasRole("superadmin");
}
