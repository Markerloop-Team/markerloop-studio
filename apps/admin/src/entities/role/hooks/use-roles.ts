import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roleApi } from "../api";
import type {
  Role,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleResponse,
  RolesResponse,
} from "../model/types";
import type { Permission } from "@/entities/permission/model";

export const roleKeys = {
  all: ["roles"] as const,
  lists: () => [...roleKeys.all, "list"] as const,
  list: (filters?: string) => [...roleKeys.lists(), { filters }] as const,
  details: () => [...roleKeys.all, "detail"] as const,
  detail: (id: string) => [...roleKeys.details(), id] as const,
  permissions: (id: string) => [...roleKeys.detail(id), "permissions"] as const,
};

/**
 * Параметры для получения ролей с пагинацией, фильтрацией и сортировкой
 */
export interface GetRolesParams {
  page?: number;
  limit?: number;
  cursor?: string; // ID последнего элемента предыдущей страницы (для cursor-based pagination)
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

/**
 * Hook для получения всех ролей с поддержкой пагинации, фильтрации и сортировки
 */
export function useRoles(params?: GetRolesParams) {
  return useQuery({
    queryKey: roleKeys.list(params ? JSON.stringify(params) : undefined),
    queryFn: () => roleApi.getAllRoles(params),
    staleTime: 5 * 60 * 1000, // 5 минут
  });
}

/**
 * Hook для получения роли по ID
 */
export function useRole(id: string) {
  return useQuery({
    queryKey: roleKeys.detail(id),
    queryFn: () => roleApi.getRoleById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для создания роли
 */
export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoleRequest) => roleApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Hook для обновления роли
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleRequest }) =>
      roleApi.updateRole(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(id) });
    },
  });
}

/**
 * Hook для удаления роли
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => roleApi.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
    },
  });
}

/**
 * Hook для получения разрешений роли
 */
export function useRolePermissions(roleId: string) {
  return useQuery({
    queryKey: roleKeys.permissions(roleId),
    queryFn: () => roleApi.getRolePermissions(roleId),
    enabled: !!roleId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для назначения разрешения роли
 */
export function useAssignPermissionToRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      permissionId,
    }: {
      roleId: string;
      permissionId: string;
    }) => roleApi.assignPermissionToRole(roleId, permissionId),
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({
        queryKey: roleKeys.permissions(roleId),
      });
    },
  });
}

/**
 * Hook для удаления разрешения у роли
 */
export function useRemovePermissionFromRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      permissionId,
    }: {
      roleId: string;
      permissionId: string;
    }) => roleApi.removePermissionFromRole(roleId, permissionId),
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({
        queryKey: roleKeys.permissions(roleId),
      });
    },
  });
}


