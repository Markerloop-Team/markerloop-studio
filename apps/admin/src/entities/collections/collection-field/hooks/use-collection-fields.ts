import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  collectionsFieldsApi,
  type FieldCreatePayload,
  type FieldUpdatePayload,
} from "@/shared/lib/api/collections-client";

export const collectionFieldKeys = {
  all: ["collections", "collection-fields"] as const,
  lists: () => [...collectionFieldKeys.all, "list"] as const,
  list: (collectionId: string) =>
    [...collectionFieldKeys.lists(), collectionId] as const,
};

export function useCollectionFields(collectionId: string | null) {
  return useQuery({
    queryKey: collectionId
      ? collectionFieldKeys.list(collectionId)
      : collectionFieldKeys.lists(),
    queryFn: () => collectionsFieldsApi.list(collectionId as string),
    enabled: !!collectionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCollectionField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      payload,
    }: {
      collectionId: string;
      payload: FieldCreatePayload;
    }) => collectionsFieldsApi.create(collectionId, payload),
    onSuccess: (_, { collectionId }) => {
      qc.invalidateQueries({
        queryKey: collectionFieldKeys.list(collectionId),
      });
    },
  });
}

export function useUpdateCollectionField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      fieldId,
      payload,
    }: {
      collectionId: string;
      fieldId: string;
      payload: FieldUpdatePayload;
    }) => collectionsFieldsApi.update(collectionId, fieldId, payload),
    onSuccess: (_, { collectionId }) => {
      qc.invalidateQueries({
        queryKey: collectionFieldKeys.list(collectionId),
      });
    },
  });
}

export function useDeleteCollectionField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      fieldId,
    }: {
      collectionId: string;
      fieldId: string;
    }) => collectionsFieldsApi.delete(collectionId, fieldId),
    onSuccess: (_, { collectionId }) => {
      qc.invalidateQueries({
        queryKey: collectionFieldKeys.list(collectionId),
      });
    },
  });
}
