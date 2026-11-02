import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  collectionsMembersApi,
  requireWorkspaceId,
  type MemberPutPayload,
} from "@/shared/lib/api/collections-client";

export const memberKeys = {
  all: ["collections", "members"] as const,
  lists: () => [...memberKeys.all, "list"] as const,
  list: (workspaceId: string) =>
    [...memberKeys.lists(), workspaceId] as const,
};

/**
 * Members of a workspace that hold a role, read by workspace
 * (SDL-617: `/workspaces/:id/members` with `role_id`). Not paged
 * server-side.
 *
 * `staleTime: 0`, like grants and the token inventory: this list is the
 * answer to "who reads this project with which role right now", and the
 * screen it renders on is the one place that question is being asked.
 */
export function useProjectMembers(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: workspaceId ? memberKeys.list(workspaceId) : memberKeys.lists(),
    queryFn: () => collectionsMembersApi.list(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 0,
    // A missing gateway route or a revoked session is not worth
    // retrying — a retry only delays the explanation.
    retry: false,
  });
}

/**
 * Upsert a membership. One mutation covers both "add" and "change
 * role" because the server has one endpoint for both: `(workspace,
 * user)` is the key, so a second PUT for the same user is a role
 * change, not a duplicate.
 */
export function usePutMember(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, MemberPutPayload>({
    mutationFn: (payload) =>
      collectionsMembersApi.put(
        requireWorkspaceId(workspaceId ?? null),
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memberKeys.lists() });
    },
  });
}

export function useRemoveMember(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (userId) =>
      collectionsMembersApi.delete(
        requireWorkspaceId(workspaceId ?? null),
        userId
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memberKeys.lists() });
    },
  });
}
