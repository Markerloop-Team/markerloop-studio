import type { Permission } from "@/entities/permission/model";

/**
 * Объединяет разрешения из нескольких массивов, убирая дубликаты
 * Применяет принцип DRY для переиспользования логики объединения
 * 
 * @param permissionsArrays - массив массивов разрешений для объединения
 * @returns массив уникальных разрешений
 */
export function mergePermissions(permissionsArrays: Permission[][]): Permission[] {
  const permissionMap = new Map<string, Permission>();
  
  permissionsArrays.forEach((permissions) => {
    permissions.forEach((permission) => {
      // Используем ID как уникальный ключ
      if (!permissionMap.has(permission.id)) {
        permissionMap.set(permission.id, permission);
      }
    });
  });
  
  return Array.from(permissionMap.values());
}

/**
 * Объединяет разрешения пользователя из ролей и прямых разрешений
 * 
 * @param rolePermissions - разрешения из ролей пользователя
 * @param directPermissions - прямые разрешения пользователя (если есть)
 * @returns объединенный массив разрешений без дубликатов
 */
export function mergeUserPermissions(
  rolePermissions: Permission[],
  directPermissions: Permission[] = []
): Permission[] {
  return mergePermissions([rolePermissions, directPermissions]);
}

