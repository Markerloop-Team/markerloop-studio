import { apiClient } from "@/shared/lib/api/client";
import { normalizeArrayResponse } from "@/shared/lib/api/response-normalizer";
import type {
  Role,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleResponse,
  RolesResponse,
} from "../model/types";
import type { Permission } from "@/entities/permission/model";

export const roleApi = {
  /**
   * Получить все роли
   * @param params - Параметры пагинации, фильтрации и сортировки
   */
  getAllRoles: async (params?: {
    page?: number;
    limit?: number;
    cursor?: string; // ID последнего элемента предыдущей страницы (для cursor-based pagination)
    search?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<RolesResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.cursor) queryParams.append("cursor", params.cursor);
    if (params?.search) queryParams.append("search", params.search);
    if (params?.sort_by) queryParams.append("sort_by", params.sort_by);
    if (params?.sort_order) queryParams.append("sort_order", params.sort_order);

    const queryString = queryParams.toString();
    const endpoint = `/v1/roles${queryString ? `?${queryString}` : ""}`;

    const response = await apiClient.get<RolesResponse | Role[] | { roles: Role[] }>(endpoint);
    
    // Если ответ уже в формате RolesResponse
    if (response && typeof response === "object" && "roles" in response && "count" in response) {
      return response as RolesResponse;
    }
    
    // Если ответ - массив ролей (старый формат)
    if (Array.isArray(response)) {
      return {
        roles: response,
        count: response.length,
        total: response.length,
      };
    }
    
    // Если ответ обернут в объект с roles
    if (response && typeof response === "object" && "roles" in response) {
      const data = response as { roles: Role[] };
      return {
        roles: Array.isArray(data.roles) ? data.roles : [],
        count: Array.isArray(data.roles) ? data.roles.length : 0,
        total: Array.isArray(data.roles) ? data.roles.length : 0,
      };
    }
    
    return {
      roles: [],
      count: 0,
      total: 0,
    };
  },

  /**
   * Получить роль по ID
   */
  getRoleById: async (id: string): Promise<RoleResponse> => {
    const response = await apiClient.get<RoleResponse>(`/v1/roles/${id}`);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Создать роль
   */
  createRole: async (data: CreateRoleRequest): Promise<RoleResponse> => {
    const response = await apiClient.post<RoleResponse>("/v1/roles", data);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Обновить роль
   */
  updateRole: async (id: string, data: UpdateRoleRequest): Promise<RoleResponse> => {
    const response = await apiClient.put<RoleResponse>(`/v1/roles/${id}`, data);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Удалить роль
   */
  deleteRole: async (id: string): Promise<void> => {
    await apiClient.delete(`/v1/roles/${id}`);
  },

  /**
   * Получить разрешения роли
   */
  getRolePermissions: async (roleId: string): Promise<Permission[]> => {
    const response = await apiClient.get<{ permissions: Permission[] } | Permission[]>(
      `/v1/roles/${roleId}/permissions`
    );
    return normalizeArrayResponse<Permission>(response);
  },

  /**
   * Назначить разрешение роли
   */
  assignPermissionToRole: async (
    roleId: string,
    permissionId: string
  ): Promise<void> => {
    await apiClient.post(`/v1/roles/${roleId}/permissions`, {
      permission_id: permissionId,
    });
  },

  /**
   * Удалить разрешение у роли
   */
  removePermissionFromRole: async (
    roleId: string,
    permissionId: string
  ): Promise<void> => {
    await apiClient.delete(`/v1/roles/${roleId}/permissions/${permissionId}`);
  },
};

