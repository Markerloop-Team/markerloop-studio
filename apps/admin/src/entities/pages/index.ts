"use client";

// Pages entity (SDL-605): the addresses (`route`) of a workspace and the page
// (`page`) living at each of them, over pages-service through the gateway.
//
// The unit of the section is the ADDRESS, not the page: `route` carries the
// link logic (path, tab title, publication), `page` only the composition.
// pages-service enforces one page per route today (`page_route_taken`), so an
// address resolves to at most one page; the list still counts them.

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEmptySaunaSchema, createSaunaNodeId, type SaunaSchema } from "@markerloop/engine";

import {
  pagesApi,
  pagesConflictRoute,
  pagesHttpStatus,
  type PagesPage,
  type PagesRevisionList,
  type PagesRoute,
  type RouteStatus,
} from "@/shared/lib/api/pages-client";
import { isGatewayRouteMissing } from "@/shared/lib/api/client";
import { userApi } from "@/entities/user/api";
import { userKeys } from "@/entities/user/hooks";
import { pagesBlockKeys } from "./components";

export type {
  PagesPage,
  PagesRevision,
  PagesRevisionList,
  PagesRoute,
  RouteStatus,
} from "@/shared/lib/api/pages-client";
export {
  hasReservedAddressChars,
  invalidRoutePathMessageKey,
  normalizeAddressPath,
  pagesConflictPage,
  pagesConflictRoute,
  pagesErrorCode,
  pagesHttpStatus,
} from "@/shared/lib/api/pages-client";
export * from "./revision-diff";
export * from "./components";
export * from "./blocks";

export const pagesKeys = {
  all: ["pages"] as const,
  routes: (ws: string) => ["pages", "routes", ws] as const,
  route: (ws: string, id: string) => ["pages", "route", ws, id] as const,
  pages: (ws: string) => ["pages", "pages", ws] as const,
  pageOfRoute: (ws: string, routeId: string) => ["pages", "page-of-route", ws, routeId] as const,
  /** The editor's document (engine provider read) of one page. */
  document: (ws: string, pageId: string) => ["pages", "document", ws, pageId] as const,
  /** The page at an address together with its journal, read at one moment. */
  history: (ws: string, routeId: string) => ["pages", "history", ws, routeId] as const,
  revision: (ws: string, pageId: string, n: number) => ["pages", "revision", ws, pageId, n] as const,
};

export function useRoutes(workspaceId: string | null) {
  return useQuery({
    queryKey: pagesKeys.routes(workspaceId ?? ""),
    queryFn: () => pagesApi.listRoutes(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function usePages(workspaceId: string | null) {
  return useQuery({
    queryKey: pagesKeys.pages(workspaceId ?? ""),
    queryFn: () => pagesApi.listPages(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useRoute(workspaceId: string | null, routeId: string) {
  return useQuery({
    queryKey: pagesKeys.route(workspaceId ?? "", routeId),
    queryFn: () => pagesApi.getRoute(workspaceId!, routeId),
    enabled: !!workspaceId && !!routeId,
    retry: false,
  });
}

/** The page at an address, or `null` when the address has none yet. */
export function usePageOfRoute(workspaceId: string | null, routeId: string) {
  return useQuery({
    queryKey: pagesKeys.pageOfRoute(workspaceId ?? "", routeId),
    queryFn: async (): Promise<PagesPage | null> => {
      const pages = await pagesApi.listPages(workspaceId!, routeId);
      return pages[0] ?? null;
    },
    enabled: !!workspaceId && !!routeId,
    retry: false,
  });
}

/**
 * The document a new address starts with: root `Page` → `Section` → an h1
 * carrying the title the author typed. Same seed as the reference's
 * `seedPageSchema` (apps/studio/src/lib/create-document.ts).
 *
 * Never an empty `{}`: pages-service accepts any JSON body, but the editor's
 * provider validates the schema on read, and a page created with `{}` could
 * not be opened afterwards.
 */
export function seedPageSchema(title: string): SaunaSchema {
  const schema = createEmptySaunaSchema("Page");
  const sectionId = createSaunaNodeId();
  const headingId = createSaunaNodeId();
  schema.nodes[sectionId] = {
    type: "Section",
    props: { background: "default", align: "left", padding: "lg" },
    children: [headingId],
  };
  schema.nodes[headingId] = { type: "Text", props: { level: "h1", text: title } };
  schema.parents[sectionId] = schema.rootId;
  schema.parents[headingId] = sectionId;
  const root = schema.nodes[schema.rootId];
  if (root) root.children = [sectionId];
  return schema;
}

export type CreateAddressArgs = { workspaceId: string; path: string; title: string };

/**
 * "New address" = two requests: the route, then its page. If the page fails
 * after the route succeeded, the route is deleted again (pages cascade by FK,
 * DELETE needs no version) — otherwise the list would show an address that
 * opens nothing.
 */
export async function createAddress(args: CreateAddressArgs): Promise<{ route: PagesRoute; page: PagesPage }> {
  const route = await pagesApi.createRoute({
    workspace_id: args.workspaceId,
    path: args.path,
    title: args.title,
  });
  try {
    const page = await pagesApi.createPage({
      workspace_id: args.workspaceId,
      route_id: route.id,
      label: args.title,
      body: seedPageSchema(args.title),
    });
    return { route, page };
  } catch (e) {
    await pagesApi.deleteRoute(args.workspaceId, route.id).catch(() => undefined);
    throw e;
  }
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAddress,
    onSettled: (_data, _error, args) => {
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.pages(args.workspaceId) });
    },
  });
}

/* -------------------------------------------------- the address's life cycle */

/**
 * One answer about a route lands in every place that shows it: the address
 * screen, the list and the row the editor's header reads.
 */
function writeRoute(qc: ReturnType<typeof useQueryClient>, workspaceId: string, route: PagesRoute): void {
  qc.setQueryData(pagesKeys.route(workspaceId, route.id), route);
  qc.setQueryData<PagesRoute[]>(pagesKeys.routes(workspaceId), (old) =>
    old ? old.map((r) => (r.id === route.id ? route : r)) : old
  );
}

export type UpdateRouteArgs = {
  workspaceId: string;
  routeId: string;
  /** The version the person's screen was showing — never a fresh re-read. */
  version: number;
  path?: string;
  title?: string;
  status?: RouteStatus;
};

/**
 * PATCH of an address, without a retry.
 *
 * Path and tab title are TEXT: a silent retry under the version the service
 * hands back with the 409 would write this screen's text over the rename
 * someone else just made. So the conflict is handed to the caller, with the
 * current route already in the cache — the form refills from it and the
 * person decides. (`setRouteStatus` below may retry precisely because a
 * status flip overwrites nothing.)
 */
export function useUpdateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: UpdateRouteArgs) => {
      const payload = { version: args.version } as {
        version: number;
        path?: string;
        title?: string;
        status?: RouteStatus;
      };
      if (args.path !== undefined) payload.path = args.path;
      if (args.title !== undefined) payload.title = args.title;
      if (args.status !== undefined) payload.status = args.status;
      return pagesApi.updateRoute(args.workspaceId, args.routeId, payload);
    },
    onSuccess: (route, args) => {
      writeRoute(qc, args.workspaceId, route);
      // A new title on a published address is an unpublished change
      // (SDL-676): the detail fields only the single GET carries are re-read.
      void qc.invalidateQueries({ queryKey: pagesKeys.route(args.workspaceId, route.id) });
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.pages(args.workspaceId) });
    },
    onError: (error, args) => {
      // The 409 carries the row as it is now: keeping it means the next
      // attempt starts from the truth instead of from a stale version.
      const actual = pagesConflictRoute(error);
      if (actual) writeRoute(qc, args.workspaceId, actual);
    },
  });
}

export type SetRouteStatusArgs = {
  workspaceId: string;
  routeId: string;
  version: number;
  status: RouteStatus;
};

/**
 * Publish / unpublish. One field, and an idempotent one: if the 409 says the
 * address is ALREADY in the wanted state, someone else did exactly this and
 * there is nothing left to do; otherwise exactly one retry under the version
 * the service returned. A second 409 is an error — never a loop.
 *
 * Outside the hook so `smoke:pages` can execute it the way it executes
 * `createAddress`: the branch that matters here is one no type-check reaches.
 */
export async function setRouteStatus(args: SetRouteStatusArgs): Promise<PagesRoute> {
  try {
    return await pagesApi.updateRoute(args.workspaceId, args.routeId, {
      status: args.status,
      version: args.version,
    });
  } catch (error) {
    const actual = pagesConflictRoute(error);
    if (!actual) throw error;
    if (actual.status === args.status) return actual;
    return pagesApi.updateRoute(args.workspaceId, args.routeId, {
      status: args.status,
      version: actual.version,
    });
  }
}

export type RepublishRouteArgs = { workspaceId: string; routeId: string; version: number };

/**
 * "Update publication" (SDL-687 over SDL-676): PATCH status=published on an
 * address that is ALREADY published. pages-service takes a new snapshot on
 * every status=published, so this is how the author ships edits to the site.
 *
 * Not `setRouteStatus`: there a 409 whose route is already published means
 * "done, someone did it" — here it means nothing of the kind, the new snapshot
 * has not been taken. So: one retry under the version the 409 returns, as long
 * as the address is still published. If it was unpublished elsewhere in the
 * meantime, the conflict is handed to the caller — putting a page back on the
 * site is not what "update" asked for.
 */
export async function republishRoute(args: RepublishRouteArgs): Promise<PagesRoute> {
  try {
    return await pagesApi.updateRoute(args.workspaceId, args.routeId, { status: "published", version: args.version });
  } catch (error) {
    const actual = pagesConflictRoute(error);
    if (!actual || actual.status !== "published") throw error;
    return pagesApi.updateRoute(args.workspaceId, args.routeId, { status: "published", version: actual.version });
  }
}

export function useRepublishRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: republishRoute,
    onSuccess: (route, args) => {
      writeRoute(qc, args.workspaceId, route);
      void qc.invalidateQueries({ queryKey: pagesKeys.route(args.workspaceId, route.id) });
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
    },
    onError: (error, args) => {
      const actual = pagesConflictRoute(error);
      if (actual) writeRoute(qc, args.workspaceId, actual);
    },
  });
}

/**
 * A save of the page of a PUBLISHED address leaves the site behind: pages-service
 * compares the page version with the snapshot's (PublicationState), so after
 * any successful save the answer is "true" without asking. Written into the
 * cached detail so the editor says so at once, not on the next re-read.
 */
export async function markUnpublishedChanges(
  qc: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  routeId: string
): Promise<void> {
  // A GET of the route already in flight would land after this write and
  // put the older answer back. Cancelled FIRST: a cancel reverts the query to
  // its state before that fetch, so cancelling after the write would undo it.
  await qc.cancelQueries({ queryKey: pagesKeys.route(workspaceId, routeId) });
  qc.setQueryData<PagesRoute>(pagesKeys.route(workspaceId, routeId), (old) =>
    old && old.status === "published" && old.has_unpublished_changes !== true
      ? { ...old, has_unpublished_changes: true }
      : old
  );
}

export type SetRoutePinnedArgs = { workspaceId: string; routeId: string; version: number; pinned: boolean };

/**
 * Pin or unpin an address (SDL-645 over SDL-644's flag). Like the status flip
 * it overwrites no text, so a 409 is retried once under the version the
 * service hands back — unless the other write already set the same flag.
 */
export async function setRoutePinned(args: SetRoutePinnedArgs): Promise<PagesRoute> {
  try {
    return await pagesApi.updateRoute(args.workspaceId, args.routeId, { pinned: args.pinned, version: args.version });
  } catch (error) {
    const actual = pagesConflictRoute(error);
    if (!actual) throw error;
    if ((actual.pinned ?? false) === args.pinned) return actual;
    return pagesApi.updateRoute(args.workspaceId, args.routeId, { pinned: args.pinned, version: actual.version });
  }
}

export function useSetRoutePinned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setRoutePinned,
    onSuccess: (route, args) => {
      writeRoute(qc, args.workspaceId, route);
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
    },
    onError: (error, args) => {
      const actual = pagesConflictRoute(error);
      if (actual) writeRoute(qc, args.workspaceId, actual);
    },
  });
}

export function useSetRouteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setRouteStatus,
    onSuccess: (route, args) => {
      writeRoute(qc, args.workspaceId, route);
      // published_at / has_unpublished_changes come only with the single GET.
      void qc.invalidateQueries({ queryKey: pagesKeys.route(args.workspaceId, route.id) });
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
    },
    onError: (error, args) => {
      const actual = pagesConflictRoute(error);
      if (actual) writeRoute(qc, args.workspaceId, actual);
    },
  });
}

export type DeleteAddressArgs = {
  workspaceId: string;
  routeId: string;
  /** Known page of the address — its cached document goes with the route. */
  pageId?: string | null;
};

/**
 * Delete an address. The page inside it, its revisions and its blocks
 * cascade in the database, so one DELETE is the whole operation and it needs
 * no version.
 *
 * pages-service's OWN 404 is success, not a failure: the address is gone,
 * which is what was asked. Reporting an error there would leave the person
 * inside the editor of something that no longer exists.
 *
 * The gateway's 404 is the opposite and must not be swallowed. gw-service
 * registers no NoRoute handler, so a DELETE it does not publish comes back as
 * gin's bare text `404 page not found` (and an ingress in front answers an
 * HTML page) — the request never reached the service, the address is still
 * there, and treating it as "deleted" would close the dialog, drop the cache
 * and send the person to a list where the row is still standing, with not one
 * word of error. `isGatewayRouteMissing` is the same distinction the
 * collections tabs already draw; the service's own 404 always carries the
 * envelope, so it is an OBJECT in `data`.
 */
export async function deleteAddress(args: DeleteAddressArgs): Promise<void> {
  try {
    await pagesApi.deleteRoute(args.workspaceId, args.routeId);
  } catch (error) {
    if (pagesHttpStatus(error) !== 404 || isGatewayRouteMissing(error)) throw error;
  }
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAddress,
    onSuccess: (_void, args) => {
      qc.removeQueries({ queryKey: pagesKeys.route(args.workspaceId, args.routeId) });
      qc.removeQueries({ queryKey: pagesKeys.pageOfRoute(args.workspaceId, args.routeId) });
      qc.removeQueries({ queryKey: pagesKeys.history(args.workspaceId, args.routeId) });
      if (args.pageId) qc.removeQueries({ queryKey: pagesKeys.document(args.workspaceId, args.pageId) });
      // The page's Refs went with it: usage of the Blocks changed (SDL-721).
      void qc.invalidateQueries({ queryKey: pagesBlockKeys.all(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.pages(args.workspaceId) });
    },
  });
}

/* ------------------------------------------------------------ revisions */

export const REVISIONS_PAGE_SIZE = 50;

export type PageHistory = { page: PagesPage | null; journal: PagesRevisionList | null };

/**
 * The page at an address and the first page of its journal, read TOGETHER.
 *
 * The page's `version` is what a restore is sent under, and it must be the
 * version the person saw the journal at — not one re-read just before the
 * POST. Re-reading would make a restore silently write an old snapshot over
 * an edit made while the journal was open; pinned to the journal's moment,
 * that edit answers 409 and the screen says so (canvas SDL-596,
 * RestoreConflict). The page is read first: a journal newer than the version
 * can only produce a spurious conflict, never a lost edit.
 *
 * No background refetch: the version must not move under the screen.
 */
export function usePageHistory(workspaceId: string | null, routeId: string) {
  return useQuery({
    queryKey: pagesKeys.history(workspaceId ?? "", routeId),
    queryFn: async (): Promise<PageHistory> => {
      const pages = await pagesApi.listPages(workspaceId!, routeId);
      const page = pages[0] ?? null;
      if (!page) return { page: null, journal: null };
      const journal = await pagesApi.listPageRevisions(workspaceId!, page.id, { limit: REVISIONS_PAGE_SIZE });
      return { page, journal };
    },
    enabled: !!workspaceId && !!routeId,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
  });
}

/** One revision by number — only for one the loaded journal page lacks. */
export function usePageRevision(workspaceId: string | null, pageId: string | null, n: number | null, enabled: boolean) {
  return useQuery({
    queryKey: pagesKeys.revision(workspaceId ?? "", pageId ?? "", n ?? 0),
    queryFn: () => pagesApi.getPageRevision(workspaceId!, pageId!, n!),
    enabled: enabled && !!workspaceId && !!pageId && !!n && n > 0,
    retry: false,
    staleTime: Infinity,
  });
}

export type RestoreRevisionArgs = {
  workspaceId: string;
  routeId: string;
  pageId: string;
  n: number;
  /** The version the journal was read at — never a fresh re-read. */
  version: number;
};

export function useRestorePageRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: RestoreRevisionArgs) =>
      pagesApi.restorePageRevision(args.workspaceId, args.pageId, args.n, args.version),
    onSuccess: (page, args) => {
      qc.setQueryData(pagesKeys.pageOfRoute(args.workspaceId, args.routeId), page);
      // The next restore must carry the new version even before the journal
      // re-read lands.
      qc.setQueryData<PageHistory>(pagesKeys.history(args.workspaceId, args.routeId), (old) =>
        old ? { ...old, page } : old
      );
      // The editor's next open must read the restored body and its version,
      // or its first autosave would 409 against the restore.
      qc.removeQueries({ queryKey: pagesKeys.document(args.workspaceId, args.pageId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.history(args.workspaceId, args.routeId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.routes(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesKeys.pages(args.workspaceId) });
    },
    // A 409 deliberately writes nothing to the cache: the version stays the
    // one the journal was read at until the person refreshes, so a second
    // click cannot slip past the conflict.
  });
}

export type RevisionAuthor =
  /** `author_user_id` is empty — a row written without an actor. */
  | { state: "none" }
  | { state: "loading"; id: string }
  | { state: "known"; id: string; name: string }
  /** The lookup failed (account gone, or not readable by this admin). */
  | { state: "unresolved"; id: string };

/**
 * Author ids → people, one `GET /users/:id` per distinct author (same
 * approach as `useMemberUsers`). A failed lookup keeps the row rendering with
 * the raw id instead of taking the journal down.
 */
export function useRevisionAuthors(ids: ReadonlyArray<string | null | undefined>): (id: string | null | undefined) => RevisionAuthor {
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: userKeys.detail(id),
      queryFn: () => userApi.getUserById(id),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const byId = new Map<string, RevisionAuthor>();
  unique.forEach((id, i) => {
    const r = results[i];
    if (r?.data?.username) byId.set(id, { state: "known", id, name: r.data.username });
    else if (r?.isLoading) byId.set(id, { state: "loading", id });
    else byId.set(id, { state: "unresolved", id });
  });
  return (id) => (id ? (byId.get(id) ?? { state: "loading", id }) : { state: "none" });
}
