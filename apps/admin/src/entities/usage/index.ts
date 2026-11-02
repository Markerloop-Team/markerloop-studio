import { useQuery } from "@tanstack/react-query";

import { fileKeys } from "@/entities/files";
import { pagesKeys } from "@/entities/pages";
import { workspaceKeys } from "@/entities/collections/workspace";
import { collectionsWorkspacesApi } from "@/shared/lib/api/collections-client";
import { filesApi, type FileScope } from "@/shared/lib/api/files-client";
import { pagesApi } from "@/shared/lib/api/pages-client";

import { usageNumber } from "./model";

export * from "./model";

/**
 * Usage keys hang under the lists they count, so every write that already
 * invalidates a list (upload, delete, create address) re-reads the usage too.
 */
export const usageKeys = {
  files: (ws: string) => [...fileKeys.lists(), "usage", ws] as const,
  routes: (ws: string) => [...pagesKeys.routes(ws), "usage"] as const,
  workspace: (ws: string) => workspaceKeys.usage(ws),
};

const USAGE_STALE_MS = 30 * 1000;

/** GET /v1/files/usage — bytes, number of files, one-file ceiling. */
export function useFilesUsage(scope: FileScope | null) {
  return useQuery({
    queryKey: usageKeys.files(scope?.workspace_id ?? ""),
    queryFn: () => filesApi.usage(scope as FileScope),
    enabled: !!scope,
    staleTime: USAGE_STALE_MS,
    retry: false,
  });
}

/** GET /v1/pages/usage — addresses; only where the pages section exists. */
export function usePagesUsage(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: usageKeys.routes(workspaceId ?? ""),
    queryFn: () => pagesApi.usage(workspaceId as string),
    enabled: enabled && !!workspaceId,
    staleTime: USAGE_STALE_MS,
    retry: false,
  });
}

/** GET /v1/workspaces/:id/usage — workspaces, collections, records. */
export function useWorkspaceUsageQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: usageKeys.workspace(workspaceId ?? ""),
    queryFn: () => collectionsWorkspacesApi.usage(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: USAGE_STALE_MS,
    retry: false,
  });
}

/**
 * The three numbers the shell shows next to its items and on the home
 * (EP-157): addresses, collections, files of one workspace. Read through the
 * usage handles above — the same cached queries as the usage panel, so they
 * cost no request per render. A number the person cannot read is `null`,
 * never 0: files usage answers the owner only (gateway ScopeOwnerOnly), so a
 * member is not asked; any failure is null too.
 */
export type WorkspaceCounts = { pages: number | null; collections: number | null; files: number | null };

export function useWorkspaceCounts(
  workspace: { id: string; owner_user_id?: string | null } | null,
  options: { pages: boolean; userId: string | null }
): WorkspaceCounts & { loading: boolean } {
  const id = workspace?.id ?? null;
  const isOwner = !!options.userId && workspace?.owner_user_id === options.userId;
  const usage = useWorkspaceUsageQuery(id);
  const pages = usePagesUsage(id, options.pages);
  const files = useFilesUsage(isOwner && id ? { workspace_id: id } : null);
  return {
    // The bodies are read defensively: a service (or a stub) that answers 200
    // without the counter — `{}`, `[]`, `{ routes: null }` — must give `null`,
    // not a TypeError that takes the whole shell into the error boundary.
    pages: options.pages ? usageNumber(pages.data, "routes", "used") : null,
    collections: usageNumber(usage.data, "collections", "used"),
    files: isOwner ? usageNumber(files.data, "files", "used") : null,
    loading: usage.isLoading || (options.pages && pages.isLoading) || (isOwner && files.isLoading),
  };
}
