import { apiClient } from "@/shared/lib/api/client";
import { normalizeArrayResponse } from "@/shared/lib/api/response-normalizer";
import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UsersResponse,
  UserResponse,
  ApiResponse,
} from "../model/types";
import type { Role } from "@/entities/role/model";
import type { Permission } from "@/entities/permission/model";

export interface ExternalAccount {
  id: string;
  user_id: string;
  provider: "telegram" | "google" | "github" | "facebook";
  external_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider_data: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GetUsersParams {
  search?: string;
  email_verified?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  cursor?: string; // ID последнего элемента предыдущей страницы (для cursor-based pagination)
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export const userApi = {
  /**
   * Получить всех пользователей с поддержкой фильтрации
   */
  getAllUsers: async (params?: GetUsersParams): Promise<UsersResponse> => {
    // Строим query string из параметров
    const queryParams = new URLSearchParams();
    
    if (params?.search) {
      queryParams.append("search", params.search);
    }
    
    if (params?.email_verified !== undefined) {
      queryParams.append("email_verified", String(params.email_verified));
    }
    
    if (params?.date_from) {
      queryParams.append("date_from", params.date_from);
    }
    
    if (params?.date_to) {
      queryParams.append("date_to", params.date_to);
    }
    
    if (params?.page !== undefined) {
      queryParams.append("page", String(params.page));
    }
    
    if (params?.limit !== undefined) {
      queryParams.append("limit", String(params.limit));
    }
    
    if (params?.cursor) {
      queryParams.append("cursor", params.cursor);
    }
    
    if (params?.sort_by) {
      queryParams.append("sort_by", params.sort_by);
    }
    
    if (params?.sort_order) {
      queryParams.append("sort_order", params.sort_order);
    }
    
    const queryString = queryParams.toString();
    const endpoint = `/v1/users${queryString ? `?${queryString}` : ""}`;
    
    // API клиент уже возвращает data из ApiResponse, поэтому типизируем как UsersResponse
    const response = await apiClient.get<UsersResponse>(endpoint);
    // Убеждаемся, что возвращаем валидный объект
    if (response && typeof response === "object" && "users" in response) {
      return response;
    }
    // Дефолтное значение на случай, если структура ответа неожиданная
    return { users: [], count: 0, total: 0 };
  },

  /**
   * Получить пользователя по ID
   */
  getUserById: async (id: string): Promise<UserResponse> => {
    const response = await apiClient.get<UserResponse>(`/v1/users/${id}`);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Создать пользователя
   */
  createUser: async (
    data: CreateUserRequest
  ): Promise<UserResponse> => {
    const response = await apiClient.post<UserResponse>("/v1/users", data);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Обновить пользователя
   */
  updateUser: async (
    id: string,
    data: UpdateUserRequest
  ): Promise<UserResponse> => {
    const response = await apiClient.put<UserResponse>(`/v1/users/${id}`, data);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Удалить пользователя
   */
  deleteUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/v1/users/${id}`);
  },

  /**
   * Получить внешние аккаунты пользователя
   */
  getUserExternalAccounts: async (userId: string): Promise<ExternalAccount[]> => {
    const response = await apiClient.get<ExternalAccount[]>(`/v1/external-accounts/user/${userId}`);
    return normalizeArrayResponse<ExternalAccount>(response);
  },

  /**
   * Получить роли пользователя
   */
  getUserRoles: async (userId: string): Promise<Role[]> => {
    const response = await apiClient.get<{ roles: Role[] } | Role[]>(`/v1/users/${userId}/roles`);
    return normalizeArrayResponse<Role>(response);
  },

  /**
   * Получить разрешения пользователя
   */
  getUserPermissions: async (userId: string): Promise<Permission[]> => {
    const response = await apiClient.get<{ permissions: Permission[] } | Permission[]>(`/v1/users/${userId}/permissions`);
    return normalizeArrayResponse<Permission>(response);
  },

  /**
   * Создать внешний аккаунт
   */
  createExternalAccount: async (data: {
    user_id: string;
    provider: "telegram" | "google" | "github" | "facebook";
    external_id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    provider_data?: string;
  }): Promise<ExternalAccount> => {
    const response = await apiClient.post<ExternalAccount>("/v1/external-accounts", data);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Удалить внешний аккаунт
   */
  deleteExternalAccount: async (id: string): Promise<void> => {
    await apiClient.delete(`/v1/external-accounts/${id}`);
  },

  /**
   * Назначить роль пользователю
   */
  assignRoleToUser: async (userId: string, roleId: string): Promise<void> => {
    await apiClient.post(`/v1/users/${userId}/roles`, {
      role_id: roleId,
    });
  },

  /**
   * Удалить роль у пользователя
   */
  removeRoleFromUser: async (userId: string, roleId: string): Promise<void> => {
    await apiClient.delete(`/v1/users/${userId}/roles/${roleId}`);
  },
};
