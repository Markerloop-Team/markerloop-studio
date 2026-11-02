import { apiClient } from "@/shared/lib/api/client";
import type {
  Permission,
  CreatePermissionRequest,
  UpdatePermissionRequest,
  PermissionResponse,
  PermissionsResponse,
} from "../model/types";

export const permissionApi = {
  /**
   * Получить все разрешения
   * @param params - Параметры пагинации, фильтрации и сортировки
   */
  getAllPermissions: async (params?: {
    page?: number;
    limit?: number;
    cursor?: string; // ID последнего элемента предыдущей страницы (для cursor-based pagination)
    search?: string;
    method?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<PermissionsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.cursor) queryParams.append("cursor", params.cursor);
    if (params?.search) queryParams.append("search", params.search);
    if (params?.method) queryParams.append("method", params.method);
    if (params?.sort_by) queryParams.append("sort_by", params.sort_by);
    if (params?.sort_order) queryParams.append("sort_order", params.sort_order);

    const queryString = queryParams.toString();
    const endpoint = `/v1/permissions${queryString ? `?${queryString}` : ""}`;

    const response = await apiClient.get<PermissionsResponse | Permission[] | { permissions: Permission[] }>(endpoint);
    
    // Если ответ уже в формате PermissionsResponse
    if (response && typeof response === "object" && "permissions" in response && "count" in response) {
      return response as PermissionsResponse;
    }
    
    // Если ответ - массив разрешений (старый формат)
    if (Array.isArray(response)) {
      return {
        permissions: response,
        count: response.length,
        total: response.length,
      };
    }
    
    // Если ответ обернут в объект с permissions
    if (response && typeof response === "object" && "permissions" in response) {
      const data = response as { permissions: Permission[] };
      return {
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
        count: Array.isArray(data.permissions) ? data.permissions.length : 0,
        total: Array.isArray(data.permissions) ? data.permissions.length : 0,
      };
    }
    
    return {
      permissions: [],
      count: 0,
      total: 0,
    };
  },

  /**
   * Получить разрешение по ID
   */
  getPermissionById: async (id: string): Promise<PermissionResponse> => {
    const response = await apiClient.get<PermissionResponse>(`/v1/permissions/${id}`);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Создать разрешение
   */
  createPermission: async (
    data: CreatePermissionRequest
  ): Promise<PermissionResponse> => {
    const response = await apiClient.post<PermissionResponse>("/v1/permissions", data);
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Обновить разрешение
   */
  updatePermission: async (
    id: string,
    data: UpdatePermissionRequest
  ): Promise<PermissionResponse> => {
    const response = await apiClient.put<PermissionResponse>(
      `/v1/permissions/${id}`,
      data
    );
    if (response && typeof response === "object" && "id" in response) {
      return response;
    }
    throw new Error("Invalid response format from server");
  },

  /**
   * Удалить разрешение
   */
  deletePermission: async (id: string): Promise<void> => {
    await apiClient.delete(`/v1/permissions/${id}`);
  },
};

