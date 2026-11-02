export interface User {
  id: string;
  username: string;
  email: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  /** Accepted rules edition YYYY-MM-DD, null = never accepted (SDL-659). */
  policy_accepted_version?: string | null;
  /** Server time of the acceptance (SDL-659). */
  policy_accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  username: string;
  email?: string | null;
  password: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string | null;
  email_verified?: boolean;
}

export interface UsersResponse {
  users: User[];
  count: number;
  total: number;
  page?: number;
  limit?: number;
}

export interface UsersResponseWithMeta {
  data: UsersResponse;
  meta?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface UserResponse {
  id: string;
  username: string;
  email: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

