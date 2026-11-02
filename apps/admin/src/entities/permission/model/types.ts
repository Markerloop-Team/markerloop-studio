export interface Permission {
  id: string;
  code: string;
  method: string;
  path: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePermissionRequest {
  code: string;
  method: string;
  path: string;
  description?: string;
}

export interface UpdatePermissionRequest {
  code?: string;
  method?: string;
  path?: string;
  description?: string;
}

export interface PermissionResponse {
  id: string;
  code: string;
  method: string;
  path: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// Backend возвращает структуру с разрешениями и метаданными
export interface PermissionsResponse {
  permissions: Permission[];
  count: number;
  total: number;
  page?: number;
  limit?: number;
}

export interface PermissionsResponseWithMeta {
  data: PermissionsResponse;
  meta?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

