// Records the acceptance of a rules edition (SDL-665 → user-service SDL-659):
// PUT /users/my {policy_accepted_version}; the server stamps policy_accepted_at.
import { apiClient } from "@/shared/lib/api/client";
import type { User } from "@/entities/user/model";

// The same keys and endpoints as shared/hooks/use-auth.ts: one cache entry.
export const CURRENT_USER_QUERY_KEY = ["user", "me"] as const;
export const CURRENT_ACCESS_QUERY_KEY = ["user", "my-access"] as const;

export function fetchCurrentUser(): Promise<User> {
  return apiClient.get<User>("/v1/users/my");
}

export function fetchCurrentAccess(): Promise<{ roles: string[]; permissions: string[] }> {
  return apiClient.get<{ roles: string[]; permissions: string[] }>("/v1/users/my/access");
}

export function acceptPolicyEdition(version: string): Promise<User> {
  return apiClient.put<User>("/v1/users/my", {
    policy_accepted_version: version,
  });
}
