import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { permissionApi } from "../api";
import type {
  Permission,
  CreatePermissionRequest,
  UpdatePermissionRequest,
  PermissionResponse,
  PermissionsResponse,
} from "../model/types";

export const permissionKeys = {
  all: ["permissions"] as const,
  lists: () => [...permissionKeys.all, "list"] as const,
  list: (filters?: string) => [...permissionKeys.lists(), { filters }] as const,
  details: () => [...permissionKeys.all, "detail"] as const,
  detail: (id: string) => [...permissionKeys.details(), id] as const,
};

/**
 * Параметры для получения разрешений с пагинацией, фильтрацией и сортировкой
 */
export interface GetPermissionsParams {
  page?: number;
  limit?: number;
  cursor?: string; // ID последнего элемента предыдущей страницы (для cursor-based pagination)
  search?: string;
  method?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

/**
 * Hook для получения всех разрешений с поддержкой пагинации, фильтрации и сортировки
 */
export function usePermissions(params?: GetPermissionsParams) {
  return useQuery({
    queryKey: permissionKeys.list(params ? JSON.stringify(params) : undefined),
    queryFn: () => permissionApi.getAllPermissions(params),
    staleTime: 5 * 60 * 1000, // 5 минут
  });
}

/**
 * Hook для получения разрешения по ID
 */
export function usePermission(id: string) {
  return useQuery({
    queryKey: permissionKeys.detail(id),
    queryFn: () => permissionApi.getPermissionById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для создания разрешения
 */
export function useCreatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePermissionRequest) =>
      permissionApi.createPermission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: permissionKeys.lists() });
    },
  });
}

/**
 * Hook для обновления разрешения
 */
export function useUpdatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdatePermissionRequest;
    }) => permissionApi.updatePermission(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: permissionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: permissionKeys.detail(id) });
    },
  });
}

/**
 * Hook для удаления разрешения
 */
export function useDeletePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => permissionApi.deletePermission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: permissionKeys.lists() });
    },
  });
}


