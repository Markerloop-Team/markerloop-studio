import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  collectionsInvitesApi,
  collectionsWorkspaceMembersApi,
  requireWorkspaceId,
  type InviteCreatePayload,
  type InviteCreated,
} from "@/shared/lib/api/collections-client";

import { memberKeys } from "./use-members";

/**
 * Workspace settings → Members (SDL-615).
 *
 * The profiles list lives under `memberKeys.lists()`, so the existing
 * `useRemoveMember` refreshes it without knowing it exists.
 */
export const workspaceMemberKeys = {
  list: (workspaceId: string, include: "profiles" | "none") =>
    [...memberKeys.lists(), workspaceId, include] as const,
};

export const inviteKeys = {
  all: ["collections", "invites"] as const,
  list: (workspaceId: string) => [...inviteKeys.all, workspaceId] as const,
};

export function useWorkspaceMembers(
  workspaceId: string | null | undefined,
  include?: "profiles"
) {
  return useQuery({
    queryKey: workspaceMemberKeys.list(workspaceId ?? "", include ?? "none"),
    queryFn: () =>
      collectionsWorkspaceMembersApi.list(workspaceId as string, include),
    enabled: !!workspaceId,
    // Who has access right now — the one question this screen answers.
    staleTime: 0,
    retry: false,
  });
}

/**
 * Invites of a workspace. Owner-only on the server (a member gets 403), so
 * the caller passes `enabled: false` for anyone else rather than rendering
 * the refusal.
 */
export function useInvites(
  workspaceId: string | null | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: inviteKeys.list(workspaceId ?? ""),
    queryFn: () => collectionsInvitesApi.list(workspaceId as string),
    enabled: enabled && !!workspaceId,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateInvite(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<InviteCreated, Error, InviteCreatePayload>({
    mutationFn: (payload) =>
      collectionsInvitesApi.create(
        requireWorkspaceId(workspaceId ?? null),
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inviteKeys.all });
    },
  });
}

export function useResendInvite(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<InviteCreated, Error, string>({
    mutationFn: (inviteId) =>
      collectionsInvitesApi.resend(
        requireWorkspaceId(workspaceId ?? null),
        inviteId
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inviteKeys.all });
    },
  });
}

export function useRevokeInvite(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (inviteId) =>
      collectionsInvitesApi.revoke(
        requireWorkspaceId(workspaceId ?? null),
        inviteId
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inviteKeys.all });
    },
  });
}
