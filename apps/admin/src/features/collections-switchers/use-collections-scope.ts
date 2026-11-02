"use client";

// Workspace scope shared by the collections section pages (SDL-217).
// Extracted from the pre-split /admin/collections monolith so the
// overview and the per-collection workplace resolve the scope
// identically. Since SDL-621 the workspace IS the scope: there is no
// project level in the UI and no ?proj= param.
//
//   - selection comes from the ?ws= search param, falling back to the
//     first available row so the page is useful when the user lands
//     without it;
//   - the URL is reconciled to the resolved selection, keeping shared
//     links explicit;
//   - nothing is created behind the person's back: an account without a
//     workspace gets selectedWorkspace = null and the section draws its
//     empty state (SDL-759 removed the silent bootstrap of "My Workspace").
//
// The workplace page passes `pin` — the workspace the collection being
// viewed actually lives in. A pinned id wins over both the URL and the
// first-row fallback: the collection is the source of truth for its
// scope.

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuthStore } from "@/shared/store/auth-store";
import { useWorkspaces } from "@/entities/collections/workspace";

export const WS_PARAM = "ws";

export interface CollectionsScopePin {
  workspaceId?: string | null;
}

export function useCollectionsScope(opts?: { pin?: CollectionsScopePin }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userId = useAuthStore((s) => s.userId);

  const wsIdFromUrl = searchParams.get(WS_PARAM);
  const pinnedWs = opts?.pin?.workspaceId ?? null;

  const workspacesQuery = useWorkspaces({ enabled: !!userId });
  const workspaces = workspacesQuery.data ?? [];
  const selectedWorkspace =
    (pinnedWs ? workspaces.find((w) => w.id === pinnedWs) : undefined) ??
    workspaces.find((w) => w.id === wsIdFromUrl) ??
    workspaces[0] ??
    null;

  const updateUrlParams = useCallback(
    (next: { ws?: string | null }) => {
      // Live params, not the searchParams closure: this hook's replace
      // races the page's own writers (?record, ?tab), and a render-time
      // snapshot can be arbitrarily old — it silently drops whatever the
      // other writer committed since this render (the stale-snapshot
      // stomp of MR !89, here across the module boundary, SDL-229 №2).
      //
      // This narrows the window rather than closing it: window.location
      // is written by Next's HistoryUpdater on commit, so an *in-flight*
      // replace is invisible to both this read and useSearchParams
      // alike. Two writers firing inside one transition can still stomp.
      // Closing that needs a single owner of the query string for this
      // section, not a fresher read — see the note on the reconcile
      // effect below.
      const sp = new URLSearchParams(window.location.search);
      if (next.ws !== undefined) {
        if (next.ws === null) sp.delete(WS_PARAM);
        else sp.set(WS_PARAM, next.ws);
      }
      // A pre-SDL-621 link may still carry ?proj=; it names nothing now.
      sp.delete("proj");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  // Reconcile URL with the resolved selection so subsequent shares
  // are explicit even when the user landed without params.
  const pinPending = opts?.pin !== undefined && !pinnedWs;
  const staleProjParam = searchParams.has("proj");
  useEffect(() => {
    // A pinned caller (the workplace) derives the workspace from the
    // collection itself, which takes a fetch. Until it resolves,
    // selectedWorkspace is the first-row fallback; publishing it would
    // stamp a foreign scope into the URL (SDL-229 №4).
    if (pinPending) return;
    if (!selectedWorkspace) return;
    if (wsIdFromUrl !== selectedWorkspace.id || staleProjParam) {
      updateUrlParams({ ws: selectedWorkspace.id });
    }
  }, [
    pinPending,
    selectedWorkspace,
    wsIdFromUrl,
    staleProjParam,
    updateUrlParams,
  ]);

  return {
    workspaces,
    workspacesQuery,
    selectedWorkspace,
    updateUrlParams,
  };
}
