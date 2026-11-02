import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  collectionsGrantsApi,
  type GrantCreatePayload,
  type GrantUpdatePayload,
} from "@/shared/lib/api/collections-client";
import type { CollectionGrant } from "@/widgets/collections";

export const grantKeys = {
  all: ["collections", "grants"] as const,
  lists: () => [...grantKeys.all, "list"] as const,
  list: (collectionId: string) => [...grantKeys.lists(), collectionId] as const,
};

/**
 * Grants of one collection. Not paged server-side.
 *
 * `staleTime: 0`, like the token inventory and unlike the rest of the
 * module: this list answers "who can read this collection right now",
 * and a five-minute-old answer to that question is the wrong default
 * on the one screen where it is being asked.
 */
export function useCollectionGrants(collectionId: string | null | undefined) {
  return useQuery({
    queryKey: collectionId ? grantKeys.list(collectionId) : grantKeys.lists(),
    queryFn: () => collectionsGrantsApi.list(collectionId as string),
    enabled: !!collectionId,
    staleTime: 0,
    // A missing gateway route or a revoked session is not worth
    // retrying, and a retry only delays the moment the user sees why
    // the matrix is empty.
    retry: false,
  });
}

export function useCreateGrant(collectionId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<CollectionGrant, Error, GrantCreatePayload>({
    mutationFn: (payload) =>
      collectionsGrantsApi.create(collectionId as string, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: grantKeys.lists() });
    },
  });
}

export function useUpdateGrant(collectionId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<
    CollectionGrant,
    Error,
    { grantId: string; payload: GrantUpdatePayload }
  >({
    mutationFn: ({ grantId, payload }) =>
      collectionsGrantsApi.update(collectionId as string, grantId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: grantKeys.lists() });
    },
  });
}

export function useDeleteGrant(collectionId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (grantId) =>
      collectionsGrantsApi.delete(collectionId as string, grantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: grantKeys.lists() });
    },
  });
}
