"use client";

// Components of a workspace (SDL-719, EP-145) — pages-service `blocks`, named
// "Components" everywhere a person reads it. The transport is the studio
// package's `createPagesComponentsApi` (SDL-718: POST with a `key`, the id is
// the service's); the admin builds it with its workspace-token fetch in
// widgets/pages/page-editor.tsx (`createAdminPagesComponentsApi`), and this
// module is the query layer over it:
//
// - the list for the Insert modal's "Your components" tab;
// - the schemas a page's `Ref` nodes point at, so the canvas draws the
//   Component instead of the "not found" plate. Nested refs are followed:
//   each loaded schema adds the ids IT references on the next render.

import * as React from "react";
import { useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import { collectRefBlockIds, type SaunaBlockMap, type SaunaSchema } from "@markerloop/engine";
import type { PagesComponentsApi } from "@markerloop/studio";

export const pagesComponentKeys = {
  all: (workspaceId: string) => ["pages", "components", workspaceId] as const,
  list: (workspaceId: string) => [...pagesComponentKeys.all(workspaceId), "list"] as const,
  schema: (workspaceId: string, blockId: string) =>
    [...pagesComponentKeys.all(workspaceId), "schema", blockId] as const,
};

/**
 * The Blocks tab's queries (SDL-721). Kept here, not in blocks.ts, so the
 * places that change usage (save as component, page save, address delete)
 * can invalidate `all` without an import cycle.
 */
export const pagesBlockKeys = {
  all: (ws: string) => ["pages", "blocks", ws] as const,
  list: (ws: string) => ["pages", "blocks", ws, "list"] as const,
  detail: (ws: string, id: string) => ["pages", "blocks", ws, "detail", id] as const,
};

/** A Component's schema is read again after this long; a new Component is seeded at once. */
export const COMPONENT_STALE_MS = 30_000;

/**
 * Every Component id a page needs drawn: the ones the page references, plus —
 * transitively — the ones referenced by Components already known (`known`).
 * An id whose schema is not known yet adds nothing beyond itself: its own
 * references are found once it loads.
 */
export function refBlockIdsToLoad(
  schema: SaunaSchema,
  known: (blockId: string) => SaunaSchema | null | undefined
): string[] {
  const seen = new Set<string>();
  let frontier = collectRefBlockIds(schema);
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const loaded = known(id);
      if (loaded) next.push(...collectRefBlockIds(loaded));
    }
    frontier = next;
  }
  return [...seen];
}

/**
 * The block map the renderer takes (`SaunaRenderer blocks`) for one page.
 * A Component that does not exist (`load` → null) is absent from the map, so
 * the renderer draws its "missing" plate — never nothing.
 */
export function usePagesComponentBlocks(
  workspaceId: string,
  api: Pick<PagesComponentsApi, "load"> | null,
  schema: SaunaSchema
): SaunaBlockMap {
  const queryClient = useQueryClient();
  const known = (id: string) =>
    queryClient.getQueryData<SaunaSchema | null>(pagesComponentKeys.schema(workspaceId, id));
  const ids = api ? refBlockIdsToLoad(schema, known) : [];
  const idsKey = ids.join("\n");
  // A stable `combine`: TanStack re-runs it — and hands back a NEW map — only
  // when the results or the function change, so the canvas and the file
  // resolver keyed on this map do not re-render on every editor render.
  const combine = React.useCallback(
    (results: UseQueryResult<SaunaSchema | null>[]): SaunaBlockMap => {
      const keys = idsKey ? idsKey.split("\n") : [];
      const map: Record<string, SaunaSchema> = {};
      results.forEach((r, i) => {
        if (r.data && keys[i]) map[keys[i]] = r.data;
      });
      return map;
    },
    [idsKey]
  );
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: pagesComponentKeys.schema(workspaceId, id),
      queryFn: () => api!.load(id),
      staleTime: COMPONENT_STALE_MS,
      retry: false,
    })),
    combine,
  });
}

/**
 * A Component this tab just created: its schema goes into the cache before
 * the page's `Ref` to it is drawn (no "missing" flash, no extra read), and
 * the list is read again so the Insert modal offers it.
 */
export function seedCreatedComponent(
  queryClient: QueryClient,
  workspaceId: string,
  blockId: string,
  schema: SaunaSchema
): void {
  queryClient.setQueryData(pagesComponentKeys.schema(workspaceId, blockId), schema);
  void queryClient.invalidateQueries({ queryKey: pagesComponentKeys.list(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
}
