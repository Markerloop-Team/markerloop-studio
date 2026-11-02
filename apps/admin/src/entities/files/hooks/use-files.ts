import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  filesApi,
  type FileListParams,
  type FilePatchPayload,
  type FileScope,
  type PresignedURL,
  type ReplaceFileResult,
  type StoredFile,
} from "@/shared/lib/api/files-client";

import { absoluteFileUrl } from "../lib/absolute-url";
import { useFilesDeliveryBase } from "../lib/delivery-context";

export const fileKeys = {
  all: ["files"] as const,
  lists: () => [...fileKeys.all, "list"] as const,
  list: (params: FileListParams) => [...fileKeys.lists(), params] as const,
  details: () => [...fileKeys.all, "detail"] as const,
  detail: (id: string) => [...fileKeys.details(), id] as const,
  urls: () => [...fileKeys.all, "url"] as const,
  /** Every cached URL of one file — the prefix to invalidate. */
  url: (id: string) => [...fileKeys.urls(), id] as const,
  /** Where one file is used (SDL-649). */
  links: (id: string) => [...fileKeys.all, "links", id] as const,
  /** One file's URL as resolved for one delivery host (see fileUrlQuery). */
  resolvedUrl: (id: string, deliveryBase: string) => [...fileKeys.url(id), deliveryBase] as const,
};

/**
 * The one query behind a file's URL (SDL-624). Every consumer — the pages
 * canvas, the image picker, the /files library, the collections assets tab —
 * builds its query from here, so one cache entry always holds one shape.
 *
 * files-service answers a private file with a signed absolute link and a
 * public one with the relative `/files/<id>`. The relative one is made
 * absolute against the delivery host HERE, in the query function, not by
 * each reader: a reader that forgot to (the picker, until 26 Sep 2026) put
 * the cached relative path into <img src>, the admin host answered 307 and
 * the thumbnail broke. The host is part of the key, so a screen without it
 * (base "") can never hand its relative value to a screen with it, or the
 * other way round; `fileKeys.url(id)` stays the prefix that invalidates all.
 */
export function fileUrlQuery(id: string, scope: FileScope | null, deliveryBase: string) {
  const base = deliveryBase.trim().replace(/\/+$/, "");
  return {
    queryKey: fileKeys.resolvedUrl(id, base),
    queryFn: async (): Promise<PresignedURL> => {
      const res = await filesApi.url(id, scope as FileScope);
      return { ...res, url: absoluteFileUrl(res.url, base) };
    },
  };
}

/** Paged library listing for one workspace. Soft-deleted rows never appear. */
export function useFiles(params: FileListParams | null) {
  return useQuery({
    queryKey: params ? fileKeys.list(params) : fileKeys.lists(),
    queryFn: () => filesApi.list(params as FileListParams),
    enabled: !!params?.workspace_id,
    staleTime: 30 * 1000,
  });
}

export function useFile(id: string | null, scope: FileScope | null) {
  return useQuery({
    queryKey: id ? fileKeys.detail(id) : fileKeys.details(),
    queryFn: () => filesApi.get(id as string, scope as FileScope),
    enabled: !!id && !!scope,
    staleTime: 60 * 1000,
  });
}

/**
 * Resolves one file to a URL it can actually be rendered with.
 *
 * A private file comes back as a short-lived signed link, so the query is
 * given a staleTime well under the service's presign TTL (15m) — a cached
 * link that outlives its signature renders as a broken image with no error
 * anywhere.
 */
export function useFileURL(id: string | null, scope: FileScope | null) {
  const deliveryBase = useFilesDeliveryBase();
  return useQuery({
    ...fileUrlQuery(id ?? "", scope, deliveryBase),
    enabled: !!id && !!scope,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Where a file is used (SDL-649). No staleTime: the usage index syncs after a
 * record is saved, so every open of the details asks again.
 */
export function useFileLinks(id: string | null, scope: FileScope | null) {
  return useQuery({
    queryKey: id ? fileKeys.links(id) : [...fileKeys.all, "links"],
    queryFn: () => filesApi.links(id as string, scope as FileScope),
    enabled: !!id && !!scope,
    staleTime: 0,
  });
}

export function usePatchFile(scope: FileScope | null) {
  const qc = useQueryClient();
  return useMutation<
    StoredFile,
    Error,
    { id: string; payload: FilePatchPayload }
  >({
    mutationFn: ({ id, payload }) =>
      filesApi.patch(id, scope as FileScope, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fileKeys.lists() });
    },
  });
}

/**
 * Replace a file in every live place (SDL-651). The caller shows the places
 * before and the per-place outcome after; this only sends and refreshes what
 * the replace moved: both files' usages (the index is rebuilt by each place
 * owner after its commit, so the first re-read may still lag) and the list.
 */
export function useReplaceFile(scope: FileScope | null) {
  const qc = useQueryClient();
  return useMutation<ReplaceFileResult, Error, { id: string; withId: string }>({
    mutationFn: ({ id, withId }) => filesApi.replace(id, scope as FileScope, withId),
    onSuccess: (_res, { id, withId }) => {
      void qc.invalidateQueries({ queryKey: fileKeys.links(id) });
      void qc.invalidateQueries({ queryKey: fileKeys.links(withId) });
      void qc.invalidateQueries({ queryKey: fileKeys.lists() });
    },
  });
}

/**
 * Soft delete. `force` is the second pass after the caller has shown the
 * 409 list of referencing records and the user chose to break them; the
 * mutation itself never decides that.
 */
export function useDeleteFile(scope: FileScope | null) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: string; links_broken: number },
    Error,
    { id: string; force?: boolean }
  >({
    mutationFn: ({ id, force }) =>
      filesApi.remove(id, scope as FileScope, force ?? false),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fileKeys.lists() });
    },
  });
}
