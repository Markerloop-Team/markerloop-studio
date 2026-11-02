import { useRef } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  collectionsApi,
  type CollectionCreatePayload,
  type CollectionListParams,
  type CollectionUpdatePayload,
} from "@/shared/lib/api/collections-client";

export const collectionKeys = {
  all: ["collections", "collections"] as const,
  lists: () => [...collectionKeys.all, "list"] as const,
  list: (params: CollectionListParams) =>
    [...collectionKeys.lists(), params] as const,
  details: () => [...collectionKeys.all, "detail"] as const,
  detail: (id: string) => [...collectionKeys.details(), id] as const,
};

/**
 * Paged collection list of one workspace. Resolves to {data, meta} —
 * the caller drives pagination from meta.total_pages instead of the
 * old "full batch means there is more" heuristic.
 */
export function useCollections(params: CollectionListParams | null) {
  return useQuery({
    queryKey: params
      ? collectionKeys.list(params)
      : collectionKeys.lists(),
    queryFn: () => collectionsApi.list(params as CollectionListParams),
    enabled: !!params?.workspace_id,
    staleTime: 5 * 60 * 1000,
  });
}

/** What one workspace's collection listing currently says. */
export interface WorkspaceListProbe {
  /** Ids on the listing's first page; undefined while it has no data. */
  collectionIds: readonly string[] | undefined;
  /** The first fetch is still in flight. */
  inFlight: boolean;
}

/** The last workspace a collection was found in. */
export interface StickyCollectionWorkspace {
  collectionId: string;
  workspaceId: string;
}

/**
 * Pure core of `useCollectionWorkspaceId`, exported for the smoke.
 *
 * `ordered[i]` is the workspace `probes[i]` lists. A hit in a listing wins;
 * without one, a `sticky` answer for the SAME collection is kept — once a
 * collection has been seen in a workspace, a later moment in which no
 * listing shows it is a listing in flux, not a move (collections do not
 * move between workspaces), so the id must not fall back to null.
 */
export function resolveCollectionWorkspace(
  collectionId: string | null | undefined,
  ordered: readonly string[],
  probes: readonly WorkspaceListProbe[],
  sticky: StickyCollectionWorkspace | null
): { workspaceId: string | null; isResolving: boolean } {
  if (!collectionId) return { workspaceId: null, isResolving: true };
  for (let i = 0; i < ordered.length; i++) {
    if (probes[i]?.collectionIds?.includes(collectionId)) {
      return { workspaceId: ordered[i], isResolving: false };
    }
  }
  if (sticky && sticky.collectionId === collectionId) {
    return { workspaceId: sticky.workspaceId, isResolving: false };
  }
  return {
    workspaceId: null,
    isResolving: probes.some((p) => p.inFlight),
  };
}

/**
 * The workspace a collection lives in (SDL-621).
 *
 * A collection's JSON names its storage project, not its workspace, and
 * the admin no longer reads projects. So the answer is found the way the
 * UI already knows the world: list the collections of each of the actor's
 * workspaces (the `preferred` one — usually `?ws=` — first in the array,
 * though all run in parallel) and pick the one that contains this id.
 * The lists share their cache keys with the overview and the sidebar
 * (same params), so on a normal navigation this costs no extra request.
 *
 * `workspaceId` is null until found; `isResolving` stays true while the
 * collection id is unknown or any listing is still in flight, so callers
 * can tell "still looking" from "not in any of your workspaces". A
 * workspace whose listing fails (a member without owner rights) is
 * skipped, not fatal.
 *
 * STICKY: once found for a collection id, the answer is kept until the
 * id changes, even if a later render has no listing that shows it (a
 * refetch, a transient failure, the actor's workspace list changing
 * under it). Callers build write URLs from this id, and a null here used
 * to become `/v1/workspaces/null/...` (403).
 *
 * KNOWN LIMITATION: only the first page (`limit`, 100 on the pages) of
 * each workspace is searched, so a collection past it in a larger
 * workspace resolves to null. The real fix is `workspace_id` in the
 * collection JSON (collections-service, SDL-617 plan §8 — listed for
 * 617a, not shipped); once it is there this hook collapses to reading
 * that field. `limit` must match the pages' page size for the cache to
 * be shared.
 */
export function useCollectionWorkspaceId(
  collectionId: string | null | undefined,
  workspaceIds: readonly string[],
  preferred: string | null,
  limit: number
): { workspaceId: string | null; isResolving: boolean } {
  const ordered = preferred && workspaceIds.includes(preferred)
    ? [preferred, ...workspaceIds.filter((id) => id !== preferred)]
    : [...workspaceIds];
  const results = useQueries({
    queries: ordered.map((workspaceId) => {
      const params: CollectionListParams = { workspace_id: workspaceId, limit };
      return {
        queryKey: collectionKeys.list(params),
        queryFn: () => collectionsApi.list(params),
        enabled: !!collectionId,
        staleTime: 5 * 60 * 1000,
        retry: false,
      };
    }),
  });
  const probes: WorkspaceListProbe[] = results.map((r) => ({
    collectionIds: r.data?.data.map((c) => c.id),
    inFlight: r.isPending && r.fetchStatus !== "idle",
  }));
  // A ref, not state: the answer is a fact already on screen, remembering
  // it must not cost a render. Written only when a listing proves it, so
  // a render React discards can at worst record a true fact early.
  const sticky = useRef<StickyCollectionWorkspace | null>(null);
  const resolved = resolveCollectionWorkspace(
    collectionId,
    ordered,
    probes,
    sticky.current
  );
  if (collectionId && resolved.workspaceId) {
    sticky.current = { collectionId, workspaceId: resolved.workspaceId };
  }
  return resolved;
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: id
      ? collectionKeys.detail(id)
      : collectionKeys.details(),
    queryFn: () => collectionsApi.get(id as string),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CollectionCreatePayload) =>
      collectionsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionKeys.lists() });
    },
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CollectionUpdatePayload;
    }) => collectionsApi.update(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: collectionKeys.lists() });
      qc.invalidateQueries({ queryKey: collectionKeys.detail(id) });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionKeys.lists() });
    },
  });
}
