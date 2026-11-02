"use client";

// The collections the pages editor offers to the DataView settings panel
// (SDL-642). `@markerloop/studio` cannot import the admin's data client, so
// the editor fetches the page's workspace collections here and hands them to
// `SaunaStudio` as `dataSources`. Same query keys as the Collections section,
// so a collection created there shows up here from the shared cache.

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StudioCollectionField, StudioDataSources } from "@markerloop/studio";
import { collectionsFieldsApi, type CollectionListParams } from "@/shared/lib/api/collections-client";
import { useCollections } from "@/entities/collections/collection";
import { collectionFieldKeys } from "@/entities/collections/collection-field";

/** The service's page cap: one page is every collection a workspace realistically has. */
const COLLECTIONS_PAGE = 100;

export function collectionsListParams(workspaceId: string): CollectionListParams {
  return { workspace_id: workspaceId, page: 1, limit: COLLECTIONS_PAGE, sort_by: "name", sort_order: "asc" };
}

export function usePagesDataSources(workspaceId: string | null): StudioDataSources {
  const qc = useQueryClient();
  const list = useCollections(workspaceId ? collectionsListParams(workspaceId) : null);
  const loadFields = React.useCallback(
    async (collectionId: string): Promise<readonly StudioCollectionField[]> => {
      const fields = await qc.fetchQuery({
        queryKey: collectionFieldKeys.list(collectionId),
        queryFn: () => collectionsFieldsApi.list(collectionId),
        staleTime: 5 * 60 * 1000,
      });
      return fields.map((f) => ({ key: f.key, name: f.name, type: f.type }));
    },
    [qc]
  );
  const { refetch } = list;
  const onRetry = React.useCallback(() => void refetch(), [refetch]);
  const collections = React.useMemo(
    () => (list.data?.data ?? []).map((c) => ({ id: c.id, name: c.name, key: c.key })),
    [list.data]
  );
  const status: StudioDataSources["status"] = list.data ? "ready" : list.isError ? "error" : "loading";
  return React.useMemo(
    () => ({ workspaceId, status, collections, onRetry, loadFields }),
    [workspaceId, status, collections, onRetry, loadFields]
  );
}
