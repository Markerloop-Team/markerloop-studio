import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@/widgets/collections";

import {
  collectionsWorkspacesApi,
  type WorkspaceCreatePayload,
  type WorkspaceUpdatePayload,
} from "@/shared/lib/api/collections-client";

export const workspaceKeys = {
  all: ["collections", "workspaces"] as const,
  lists: () => [...workspaceKeys.all, "list"] as const,
  details: () => [...workspaceKeys.all, "detail"] as const,
  detail: (id: string) => [...workspaceKeys.details(), id] as const,
  /** The trash (SDL-660) — its own key, never a filter on lists(). */
  deleted: () => [...workspaceKeys.all, "deleted"] as const,
  usage: (id: string) => [...workspaceKeys.all, "usage", id] as const,
  slugCheck: (slug: string) => [...workspaceKeys.all, "slug-check", slug] as const,
};

/**
 * Workspaces of the current actor. The backend scopes the list by the
 * JWT user (no owner param on the wire), so the only client-side knob
 * is `enabled` — pass false until auth state is known.
 */
export function useWorkspaces(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: () => collectionsWorkspacesApi.list(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: id
      ? workspaceKeys.detail(id)
      : workspaceKeys.details(),
    queryFn: () => collectionsWorkspacesApi.get(id as string),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation<Workspace, Error, WorkspaceCreatePayload>({
    mutationFn: (payload) => collectionsWorkspacesApi.create(payload),
    onSuccess: (workspace) => {
      // Into the cached list at once (SDL-759): the caller navigates to the
      // new workspace next, and until the re-read lands an empty list would
      // read as "no workspace" and the section would draw its empty state.
      qc.setQueryData<Workspace[]>(workspaceKeys.lists(), (old) =>
        old && !old.some((w) => w.id === workspace.id) ? [...old, workspace] : old ?? [workspace]
      );
      qc.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation<
    Workspace,
    Error,
    { id: string; payload: WorkspaceUpdatePayload }
  >({
    mutationFn: ({ id, payload }) =>
      collectionsWorkspacesApi.update(id, payload),
    onSuccess: (workspace) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.lists() });
      qc.setQueryData(workspaceKeys.detail(workspace.id), workspace);
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; permanent?: boolean }>({
    mutationFn: ({ id, permanent }) =>
      collectionsWorkspacesApi.delete(id, { permanent }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.lists() });
      qc.invalidateQueries({ queryKey: workspaceKeys.deleted() });
      qc.removeQueries({ queryKey: workspaceKeys.detail(id) });
    },
  });
}

/** Workspaces in the trash, with days_left (SDL-660, SDL-666). */
export function useDeletedWorkspaces(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: workspaceKeys.deleted(),
    queryFn: () => collectionsWorkspacesApi.listDeleted(),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useRestoreWorkspace() {
  const qc = useQueryClient();
  return useMutation<Workspace, Error, string>({
    mutationFn: (id) => collectionsWorkspacesApi.restore(id),
    // Returned, so mutateAsync resolves only after both lists are re-read:
    // the caller selects the restored workspace next, and a stale list
    // would not contain it yet (SDL-666 review).
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: workspaceKeys.lists() }),
        qc.invalidateQueries({ queryKey: workspaceKeys.deleted() }),
      ]),
  });
}

/**
 * Whether `slug` is free for a new workspace (GET /v1/workspaces/name-check,
 * SDL-758). Pass the DEBOUNCED value: every keystroke is not a request. null
 * or an empty string = no request. The answer is advice, not a reservation.
 */
export function useWorkspaceSlugCheck(slug: string | null) {
  return useQuery({
    queryKey: workspaceKeys.slugCheck(slug ?? ""),
    queryFn: () => collectionsWorkspacesApi.checkSlug(slug as string),
    enabled: !!slug,
    staleTime: 10 * 1000,
    retry: false,
  });
}
