import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userApi } from "../api";
import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UsersResponse,
  UserResponse,
} from "../model/types";
import type { Role } from "@/entities/role/model";
import type { Permission } from "@/entities/permission/model";
import type { ExternalAccount } from "../api/user-api";

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters?: string) => [...userKeys.lists(), { filters }] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  roles: (id: string) => [...userKeys.detail(id), "roles"] as const,
  permissions: (id: string) => [...userKeys.detail(id), "permissions"] as const,
  externalAccounts: (id: string) =>
    [...userKeys.detail(id), "external-accounts"] as const,
};

/**
 * Hook для получения всех пользователей с поддержкой фильтрации
 */
export function useUsers(params?: import("../api/user-api").GetUsersParams) {
  return useQuery({
    queryKey: userKeys.list(params ? JSON.stringify(params) : undefined),
    queryFn: () => userApi.getAllUsers(params),
    staleTime: 5 * 60 * 1000, // 5 минут
  });
}

/**
 * Hook для получения пользователя по ID
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => userApi.getUserById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для создания пользователя
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserRequest) => userApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook для обновления пользователя
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) =>
      userApi.updateUser(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
    },
  });
}

/**
 * Hook для удаления пользователя
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => userApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook для получения ролей пользователя
 */
export function useUserRoles(userId: string) {
  return useQuery({
    queryKey: userKeys.roles(userId),
    queryFn: () => userApi.getUserRoles(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для получения разрешений пользователя
 */
export function useUserPermissions(userId: string) {
  return useQuery({
    queryKey: userKeys.permissions(userId),
    queryFn: () => userApi.getUserPermissions(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для получения внешних аккаунтов пользователя
 */
export function useUserExternalAccounts(userId: string) {
  return useQuery({
    queryKey: userKeys.externalAccounts(userId),
    queryFn: () => userApi.getUserExternalAccounts(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook для создания внешнего аккаунта
 */
export function useCreateExternalAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      user_id: string;
      provider: "telegram" | "google" | "github" | "facebook";
      external_id: string;
      username?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
      provider_data?: string;
    }) => userApi.createExternalAccount(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: userKeys.externalAccounts(variables.user_id),
      });
    },
  });
}

/**
 * Hook для удаления внешнего аккаунта
 */
export function useDeleteExternalAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      userApi.deleteExternalAccount(id),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({
        queryKey: userKeys.externalAccounts(userId),
      });
    },
  });
}

/**
 * Hook для назначения роли пользователю
 */
export function useAssignRoleToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      userApi.assignRoleToUser(userId, roleId),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({
        queryKey: userKeys.roles(userId),
      });
    },
  });
}

/**
 * Hook для удаления роли у пользователя
 */
export function useRemoveRoleFromUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      userApi.removeRoleFromUser(userId, roleId),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({
        queryKey: userKeys.roles(userId),
      });
    },
  });
}


