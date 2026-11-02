"use client";

// The entry point of a pinned feed (SDL-645, EP-130): pinned pages in the
// sidebar, the unread count of the pinned feed on the home page. Rules live
// in ./model (pure, executed by smoke/pinned-feed.tsx); this file only wires
// them to the queries the rest of the admin already makes.

import { useQueries } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { useAuthStore } from "@/shared/store/auth-store";
import { useWorkspaces } from "@/entities/collections/workspace";
import { pagesKeys, useRoutes, type PagesPage, type PagesRoute } from "@/entities/pages";
import { pagesApi } from "@/shared/lib/api/pages-client";
import { apiErrorCode, collectionsRecordsApi } from "@/shared/lib/api/collections-client";
import { collectionFieldKeys, collectionsFieldsApi } from "@/entities/collections/collection-field";
// The widget's own rule for "this collection has a read mark" (SDL-641): one
// definition, so the entry point and the feed never disagree on what a feed is.
import { declaresReadField } from "@/widgets/pages/data-view-write";

import {
  badgeCount,
  feedCounterKey,
  findFeedDataView,
  isNotAFeedError,
  pinnedLabel,
  pinnedRoutes,
  recordHeading,
  unreadQuery,
  type FeedCount,
} from "./model";

export * from "./model";

/** Same cadence as the feed itself (DATA_VIEW_REFRESH_MS). */
const REFRESH_MS = 45 * 1000;

/**
 * The workspace the entry point speaks for: `?ws=` when the screen carries
 * one, else the first workspace — the same resolution as the sections'
 * `useCollectionsScope`, but read-only: the sidebar never rewrites the URL.
 */
export function useEntryWorkspaceId(enabled = true): string | null {
  const userId = useAuthStore((s) => s.userId);
  const searchParams = useSearchParams();
  // No pages section on this contour → nothing to pin, nothing to fetch.
  const workspaces = useWorkspaces({ enabled: enabled && !!userId }).data ?? [];
  const fromUrl = searchParams?.get("ws") ?? null;
  return (workspaces.find((w) => w.id === fromUrl) ?? workspaces[0] ?? null)?.id ?? null;
}

export type PinnedEntry = {
  route: PagesRoute;
  label: string;
  /** The feed on this page: its unread count, or null when the page has no bound DataView. */
  hasFeed: boolean;
  count: FeedCount;
  badge: number | null;
  /** The newest unread record's heading, when the count is known and positive. */
  latest: string | null;
};

/**
 * Pinned pages of a workspace, each with its feed's unread count. The route
 * list shares its cache with the pages section; the page body shares the
 * view screen's `pageOfRoute` key; the count shares the DataView counter's
 * prefix, so a read mark in the feed re-reads it.
 */
export function usePinnedEntries(workspaceId: string | null, enabled = true): {
  entries: PinnedEntry[];
  isLoading: boolean;
} {
  const routes = useRoutes(enabled ? workspaceId : null);
  const pinned = pinnedRoutes(routes.data);

  const pages = useQueries({
    queries: pinned.map((route) => ({
      queryKey: pagesKeys.pageOfRoute(workspaceId ?? "", route.id),
      queryFn: async (): Promise<PagesPage | null> => {
        const list = await pagesApi.listPages(workspaceId!, route.id);
        return list[0] ?? null;
      },
      enabled: enabled && !!workspaceId,
      retry: false,
      staleTime: 60 * 1000,
    })),
  });

  // Candidates: a bound DataView on a collection of THIS workspace.
  const candidates = pinned.map((_, i) => findFeedDataView(pages[i]?.data?.body ?? null, workspaceId));

  // A candidate is a feed only if its collection declares `read_at` — the
  // same schema read the widget itself makes (shared cache key).
  const fields = useQueries({
    queries: candidates.map((props) => ({
      queryKey: props ? collectionFieldKeys.list(props.source.collection_id) : collectionFieldKeys.lists(),
      queryFn: () => collectionsFieldsApi.list(props!.source.collection_id),
      enabled: enabled && props !== null,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const feeds = candidates.map((props, i) => {
    const f = fields[i];
    return props && f?.data && declaresReadField(f.data) ? props : null;
  });

  const counts = useQueries({
    queries: feeds.map((props) => {
      const query = props ? unreadQuery(props) : {};
      return {
        queryKey: feedCounterKey(query),
        queryFn: () => collectionsRecordsApi.query(query),
        enabled: enabled && props !== null,
        retry: false,
        // A failed count is not re-requested by every screen that mounts the
        // sidebar; the interval below retries a transient failure, and a
        // 400 unknown_filter_field is not retried at all.
        retryOnMount: false,
        staleTime: 30 * 1000,
        // A 400 unknown_filter_field will not heal by itself: stop polling it.
        refetchInterval: (q: { state: { error: unknown } }) =>
          isNotAFeedError(apiErrorCode(q.state.error)) ? false : REFRESH_MS,
        refetchOnWindowFocus: "always" as const,
      };
    }),
  });

  const entries = pinned.map((route, i): PinnedEntry => {
    const c = counts[i];
    // The service says the collection cannot be filtered by the read mark:
    // not a feed (stop polling a guaranteed 400, let the next page speak).
    const notAFeed = c?.error ? isNotAFeedError(apiErrorCode(c.error)) : false;
    const props = notAFeed ? null : feeds[i];
    const count: FeedCount = !props ? null : c?.data ? c.data.meta.total : c?.error ? null : "loading";
    const first = c?.data?.data?.[0];
    return {
      route,
      label: pinnedLabel(route),
      hasFeed: props !== null,
      count,
      badge: badgeCount(count),
      latest: props && typeof count === "number" && count > 0 ? recordHeading(props, first?.data) : null,
    };
  });

  return { entries, isLoading: routes.isLoading };
}

/** The first pinned page that carries a feed — the one the home page counts. */
export function useHomeFeed(enabled = true): { workspaceId: string | null; entry: PinnedEntry | null; isLoading: boolean } {
  const workspaceId = useEntryWorkspaceId(enabled);
  const { entries, isLoading } = usePinnedEntries(workspaceId, enabled);
  return { workspaceId, entry: entries.find((e) => e.hasFeed) ?? null, isLoading };
}
