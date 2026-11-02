import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  collectionsRecordsApi,
  type RecordCreatePayload,
  type RecordListParams,
  type RecordUpdatePayload,
} from "@/shared/lib/api/collections-client";

export const recordKeys = {
  all: ["collections", "records"] as const,
  lists: () => [...recordKeys.all, "list"] as const,
  list: (params: RecordListParams) =>
    [...recordKeys.lists(), params] as const,
  details: () => [...recordKeys.all, "detail"] as const,
  detail: (id: string) => [...recordKeys.details(), id] as const,
};

/**
 * Paged record list. Resolves to {data, meta}; pagination is driven
 * by meta (page/limit/total/total_pages) — the old hasMore-by-full-
 * batch heuristic is gone deliberately.
 */
export function useRecords(params: RecordListParams | null) {
  return useQuery({
    queryKey: params
      ? recordKeys.list(params)
      : recordKeys.lists(),
    queryFn: () => collectionsRecordsApi.list(params as RecordListParams),
    enabled: !!params?.collection_id,
    staleTime: 30 * 1000,
  });
}

export function useRecord(id: string | undefined) {
  return useQuery({
    queryKey: id ? recordKeys.detail(id) : recordKeys.details(),
    queryFn: () => collectionsRecordsApi.get(id as string),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecordCreatePayload) =>
      collectionsRecordsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.lists() });
    },
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: RecordUpdatePayload;
    }) => collectionsRecordsApi.update(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: recordKeys.lists() });
      qc.invalidateQueries({ queryKey: recordKeys.detail(id) });
    },
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collectionsRecordsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.lists() });
    },
  });
}
