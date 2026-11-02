import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccessToken, IssuedToken } from "@/widgets/collections";

import {
  collectionsTokensApi,
  requireWorkspaceId,
  type TokenCreatePayload,
  type TokenRotatePayload,
} from "@/shared/lib/api/collections-client";

export const tokenKeys = {
  all: ["collections", "tokens"] as const,
  lists: () => [...tokenKeys.all, "list"] as const,
  list: (workspaceId: string) => [...tokenKeys.lists(), workspaceId] as const,
};

/**
 * Tokens of one workspace. Not paged server-side.
 *
 * `staleTime: 0` on purpose, unlike the rest of this module: a token
 * list is a credential inventory, and showing a five-minute-old view
 * of which credentials are live is the wrong default for the one
 * screen where "was this revoked?" is the question being asked.
 */
export function useProjectTokens(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: workspaceId ? tokenKeys.list(workspaceId) : tokenKeys.lists(),
    queryFn: () =>
      collectionsTokensApi.list(requireWorkspaceId(workspaceId ?? null)),
    enabled: !!workspaceId,
    staleTime: 0,
    // A missing gateway route (404) and a revoked session are not worth
    // retrying; a token inventory that silently retries also delays the
    // moment the user sees why it is empty.
    retry: false,
  });
}

// The IssuedToken these mutations resolve with carries the plaintext
// secret. It is returned to the caller and deliberately NOT written
// anywhere cached: no setQueryData, no store, no log. The caller is
// expected to hand it to a one-shot UI surface and call `.reset()` so
// it does not linger in mutation state either.
//
// `workspaceId` is null while the collection page is still resolving the
// collection's workspace; `requireWorkspaceId` refuses before any request
// rather than addressing `/v1/workspaces/null/...` (SDL-621).

export function useCreateToken(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation<IssuedToken, Error, TokenCreatePayload>({
    mutationFn: (payload) =>
      collectionsTokensApi.create(requireWorkspaceId(workspaceId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tokenKeys.lists() });
    },
  });
}

export function useRotateToken(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    IssuedToken,
    Error,
    { tokenId: string; payload?: TokenRotatePayload }
  >({
    mutationFn: ({ tokenId, payload }) =>
      collectionsTokensApi.rotate(
        requireWorkspaceId(workspaceId),
        tokenId,
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tokenKeys.lists() });
    },
  });
}

export function useRevokeToken(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation<AccessToken, Error, string>({
    mutationFn: (tokenId) =>
      collectionsTokensApi.revoke(requireWorkspaceId(workspaceId), tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tokenKeys.lists() });
    },
  });
}
