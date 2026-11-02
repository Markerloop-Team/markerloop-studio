export interface Role {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface RoleResponse {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// Backend возвращает структуру с ролями и метаданными
export interface RolesResponse {
  roles: Role[];
  count: number;
  total: number;
  page?: number;
  limit?: number;
}

export interface RolesResponseWithMeta {
  data: RolesResponse;
  meta?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

