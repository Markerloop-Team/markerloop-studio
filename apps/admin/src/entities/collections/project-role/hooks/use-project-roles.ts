import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  collectionsRolesApi,
  requireWorkspaceId,
  type RoleCreatePayload,
  type RoleUpdatePayload,
} from "@/shared/lib/api/collections-client";
import type { ProjectRole } from "@/widgets/collections";

import { grantKeys } from "@/entities/collections/grant";

export const projectRoleKeys = {
  all: ["collections", "project-roles"] as const,
  lists: () => [...projectRoleKeys.all, "list"] as const,
  list: (workspaceId: string) => [...projectRoleKeys.lists(), workspaceId] as const,
};

/**
 * Roles of a workspace. Read by the token issue form (which may only
 * offer `consumer` roles) and by the Access tab, which also writes.
 */
export function useProjectRoles(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: workspaceId
      ? projectRoleKeys.list(workspaceId)
      : projectRoleKeys.lists(),
    queryFn: () =>
      collectionsRolesApi.list(requireWorkspaceId(workspaceId ?? null)),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// The writes below take the workspace as `string | null`: the collection
// page may hold null while it resolves the collection's workspace, and
// `requireWorkspaceId` refuses before any request instead of sending
// `/v1/workspaces/null/roles` (SDL-621).

export function useCreateProjectRole(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation<ProjectRole, Error, RoleCreatePayload>({
    mutationFn: (payload) =>
      collectionsRolesApi.create(requireWorkspaceId(workspaceId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectRoleKeys.lists() });
    },
  });
}

export function useUpdateProjectRole(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    ProjectRole,
    Error,
    { roleId: string; payload: RoleUpdatePayload }
  >({
    mutationFn: ({ roleId, payload }) =>
      collectionsRolesApi.update(
        requireWorkspaceId(workspaceId),
        roleId,
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectRoleKeys.lists() });
    },
  });
}

/**
 * Deleting a role cascades its grants away server-side, so the grant
 * lists of every collection in the project are stale the moment this
 * resolves — invalidate them too, or the matrix keeps rendering
 * checkboxes for a role that no longer exists.
 */
export function useDeleteProjectRole(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (roleId) =>
      collectionsRolesApi.delete(requireWorkspaceId(workspaceId), roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectRoleKeys.lists() });
      qc.invalidateQueries({ queryKey: grantKeys.lists() });
    },
  });
}
