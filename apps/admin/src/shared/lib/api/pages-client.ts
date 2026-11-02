// Pages-layer HTTP client (SDL-605). Talks to pages-service through the
// gateway at /api/v1/pages/* — the editor routes are Required:false and
// scoped by workspace (ScopeWorkspace): the gateway checks the actor's
// membership in `workspace_id` and pages-service answers 403 on a mismatch.
//
// Where the scope travels matters and is not uniform:
//   - GET / PATCH / DELETE read it from the QUERY (`?workspace_id=`);
//   - POST routes / pages / blocks read it from the BODY (ScopeInBody at the
//     gateway). A POST without it in the body is refused by the gateway
//     before pages-service answers, with an error shape of its own;
//   - POST /pages/{id}/revisions/{n}/restore is the exception among POSTs:
//     the gateway route has no ScopeInBody and the handler declares
//     `workspace_id` as a query param, so it travels in the QUERY and the
//     body carries only `{version}`.
//
// The document body of a page (GET/PATCH /pages/pages/{id}) is NOT read here:
// the editor goes through `createPagesServiceProvider` from
// @markerloop/engine, which validates/migrates the schema and maps 409 to
// SaunaConflictError. Everything else about an address is here: the list, the
// create flow and (slice 3) its life cycle — publish/unpublish, path and tab
// title, delete.
//
// Every call names its workspace to apiClient (`{ workspaceId }`): it travels
// with this tab's workspace token for that workspace, not the session token
// (SDL-613 S6b).

import { apiClient } from "./client";

export type RouteStatus = "draft" | "published";

/** pages-service `models.Route` — the logic of a link: path, tab title, publication. */
export interface PagesRoute {
  id: string;
  workspace_id: string;
  path: string;
  title: string;
  status: RouteStatus;
  /**
   * "Pinned" (SDL-644): one flag per address, shared by every member and
   * every device of the workspace. Pinned pages are the sidebar's entry
   * points (SDL-645). Optional: an older service omits it — read as false.
   */
  pinned?: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  /**
   * When the publication snapshot in force was taken (SDL-676); `null` when a
   * visitor has nothing to see. Only GET /routes/{id} carries it — the list
   * and the PATCH answers do not, so absent means "not known here".
   */
  published_at?: string | null;
  /**
   * A published address whose title or page moved on from the snapshot in
   * force (SDL-676): the site still shows the older version. Always false on
   * a draft. Same as `published_at`: only the single GET carries it.
   */
  has_unpublished_changes?: boolean;
}

/** pages-service `models.Page` — the composition living at a route. */
export interface PagesPage {
  id: string;
  workspace_id: string;
  route_id: string;
  label: string;
  /**
   * @deprecated since SDL-690 (pages-service !28): still read and written by
   * the service for compatibility, but new code describes the page's data in
   * the document's root `queries` slot (`SaunaSchema.queries`).
   */
  collection_binding?: Record<string, unknown> | null;
  body: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * pages-service `models.PageRevision` — one row of the append-only journal.
 * `note`: "" = an edit, "created", "restored from revision N"; anything else
 * is a note this service does not write.
 */
export interface PagesRevision {
  id: string;
  workspace_id: string;
  page_id: string;
  revision_number: number;
  body_snapshot: Record<string, unknown> | null;
  author_user_id?: string | null;
  note: string;
  created_at: string;
}

/** A page of the journal, newest first (`limit` 50 by default, 200 max). */
export interface PagesRevisionList {
  items: PagesRevision[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateRoutePayload {
  workspace_id: string;
  path: string;
  title: string;
}

/**
 * PATCH /v1/pages/routes/{id}. Every field is optional except `version`:
 * pages-service compares it with the row's and answers 409
 * `route_version_conflict` (carrying the current route) on a mismatch.
 */
export interface UpdateRoutePayload {
  path?: string;
  title?: string;
  status?: RouteStatus;
  pinned?: boolean;
  version: number;
}

export interface CreatePagePayload {
  workspace_id: string;
  route_id: string;
  label: string;
  body: unknown;
}

function scoped(path: string, workspaceId: string, extra?: Record<string, string>): string {
  const usp = new URLSearchParams({ workspace_id: workspaceId, ...extra });
  return `${path}?${usp.toString()}`;
}

/**
 * A list answer is an array — except when the service serialises an empty
 * Go slice as `null`, which apiClient then hands back as the whole envelope.
 * Anything that is not an array is an empty list, never a crash.
 */
function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A page whose draft body holds a `Ref` to a Block (pages-service SDL-721). */
export interface PagesBlockUsagePage {
  id: string;
  route_id: string;
  path: string;
  title: string;
}

/** Another Block whose schema holds a `Ref` to a Block. */
export interface PagesBlockUsageBlock {
  id: string;
  name: string;
}

/**
 * Where a Block is used: draft page bodies and other Blocks of the workspace.
 * Publication snapshots, other workspaces and a Block's ref to itself do not
 * count. `count` = pages + blocks.
 */
export interface PagesBlockUsage {
  pages: PagesBlockUsagePage[];
  blocks: PagesBlockUsageBlock[];
  count: number;
}

/** One row of GET /v1/pages/blocks: the Block plus how many places use it. */
export interface PagesBlock {
  id: string;
  workspace_id?: string;
  key: string;
  name: string;
  version?: number;
  created_at?: string;
  updated_at?: string;
  usage_count?: number;
  /**
   * The Component's group (pages-service EP-175): a label, null or absent =
   * «No group». Absent on an older pages-service — the list still works.
   */
  group?: string | null;
  /** Author of the latest journal row (EP-175, list only); null/absent = unknown. */
  updated_by?: string | null;
  /** The Component's tree — the list carries it (the tile preview draws it). */
  schema?: unknown;
}

/** GET /v1/pages/blocks/{id}: the Block and its usage. */
export interface PagesBlockDetail extends PagesBlock {
  usage?: PagesBlockUsage;
}

/** pages-service `models.BlockRevision` — one row of a Component's journal (EP-187). */
export interface PagesBlockRevision {
  id: string;
  block_id: string;
  revision_number: number;
  author_user_id?: string | null;
  note: string;
  created_at: string;
}

/** A page of a Component's journal, newest first. */
export interface PagesBlockRevisionList {
  items: PagesBlockRevision[];
  total: number;
}

/** GET /v1/pages/usage (pages-service SDL-662). limit 0 = the quota is off. */
export interface PagesUsage {
  routes: { used: number; limit: number };
}

export const pagesApi = {
  usage(workspaceId: string): Promise<PagesUsage> {
    return apiClient.get<PagesUsage>(scoped("/v1/pages/usage", workspaceId), { workspaceId });
  },

  async listRoutes(workspaceId: string): Promise<PagesRoute[]> {
    return asList<PagesRoute>(await apiClient.get<unknown>(scoped("/v1/pages/routes", workspaceId), { workspaceId }));
  },

  getRoute(workspaceId: string, id: string): Promise<PagesRoute> {
    return apiClient.get<PagesRoute>(scoped(`/v1/pages/routes/${encodeURIComponent(id)}`, workspaceId), { workspaceId });
  },

  createRoute(payload: CreateRoutePayload): Promise<PagesRoute> {
    return apiClient.post<PagesRoute>("/v1/pages/routes", payload, { workspaceId: payload.workspace_id });
  },

  updateRoute(workspaceId: string, id: string, payload: UpdateRoutePayload): Promise<PagesRoute> {
    return apiClient.patch<PagesRoute>(scoped(`/v1/pages/routes/${encodeURIComponent(id)}`, workspaceId), payload, {
      workspaceId,
    });
  },

  deleteRoute(workspaceId: string, id: string): Promise<unknown> {
    return apiClient.delete<unknown>(scoped(`/v1/pages/routes/${encodeURIComponent(id)}`, workspaceId), { workspaceId });
  },

  async listPages(workspaceId: string, routeId?: string): Promise<PagesPage[]> {
    const url = scoped("/v1/pages/pages", workspaceId, routeId ? { route_id: routeId } : undefined);
    return asList<PagesPage>(await apiClient.get<unknown>(url, { workspaceId }));
  },

  createPage(payload: CreatePagePayload): Promise<PagesPage> {
    return apiClient.post<PagesPage>("/v1/pages/pages", payload, { workspaceId: payload.workspace_id });
  },

  async listPageRevisions(
    workspaceId: string,
    pageId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<PagesRevisionList> {
    const extra: Record<string, string> = {};
    if (opts.limit !== undefined) extra.limit = String(opts.limit);
    if (opts.offset !== undefined) extra.offset = String(opts.offset);
    const list = await apiClient.get<PagesRevisionList>(
      scoped(`/v1/pages/pages/${encodeURIComponent(pageId)}/revisions`, workspaceId, extra),
      { workspaceId }
    );
    // The service starts from an empty slice, so `items` is `[]`, not null;
    // the guard only keeps a malformed answer from crashing the screen.
    return { ...list, items: asList<PagesRevision>(list?.items), total: Number(list?.total ?? 0) };
  },

  getPageRevision(workspaceId: string, pageId: string, n: number): Promise<PagesRevision> {
    return apiClient.get<PagesRevision>(
      scoped(`/v1/pages/pages/${encodeURIComponent(pageId)}/revisions/${n}`, workspaceId),
      { workspaceId }
    );
  },

  async listBlocks(workspaceId: string): Promise<PagesBlock[]> {
    return asList<PagesBlock>(await apiClient.get<unknown>(scoped("/v1/pages/blocks", workspaceId), { workspaceId }));
  },

  getBlock(workspaceId: string, id: string): Promise<PagesBlockDetail> {
    return apiClient.get<PagesBlockDetail>(scoped(`/v1/pages/blocks/${encodeURIComponent(id)}`, workspaceId), {
      workspaceId,
    });
  },

  /**
   * DELETE of a Block. Without `force` pages-service refuses a Block that is
   * still referenced: 409 `block_in_use` with the places in `data`
   * (`pagesBlockInUse`). `force` deletes anyway; the refs draw "missing".
   */
  deleteBlock(workspaceId: string, id: string, force = false): Promise<unknown> {
    return apiClient.delete<unknown>(
      scoped(`/v1/pages/blocks/${encodeURIComponent(id)}`, workspaceId, force ? { force: "true" } : undefined),
      { workspaceId }
    );
  },

  /**
   * Rename a Component (EP-187): PATCH with the name and the Block's current
   * `version` — the same version the editor's auto-save holds, so the caller
   * hands the answer's version back to it.
   */
  renameBlock(workspaceId: string, id: string, name: string, version: number): Promise<PagesBlock> {
    return apiClient.patch<PagesBlock>(
      scoped(`/v1/pages/blocks/${encodeURIComponent(id)}`, workspaceId),
      { name, version },
      { workspaceId }
    );
  },

  /**
   * Name and / or group of a Component (EP-175): PATCH under the Block's
   * `version`. `group: null` (or "") clears the group; an absent field is
   * left as it is.
   */
  updateBlockMeta(
    workspaceId: string,
    id: string,
    patch: { name?: string; group?: string | null },
    version: number
  ): Promise<PagesBlock> {
    return apiClient.patch<PagesBlock>(
      scoped(`/v1/pages/blocks/${encodeURIComponent(id)}`, workspaceId),
      { ...patch, version },
      { workspaceId }
    );
  },

  /** A Component's journal (EP-187), newest first. */
  async listBlockRevisions(workspaceId: string, id: string): Promise<PagesBlockRevisionList> {
    const list = await apiClient.get<PagesBlockRevisionList>(
      scoped(`/v1/pages/blocks/${encodeURIComponent(id)}/revisions`, workspaceId),
      { workspaceId }
    );
    return { items: asList<PagesBlockRevision>(list?.items), total: Number(list?.total ?? 0) };
  },

  /** Restore a Component's revision `n` under its current `version` (query scope, like the page's). */
  restoreBlockRevision(workspaceId: string, id: string, n: number, version: number): Promise<PagesBlock> {
    return apiClient.post<PagesBlock>(
      scoped(`/v1/pages/blocks/${encodeURIComponent(id)}/revisions/${n}/restore`, workspaceId),
      { version },
      { workspaceId }
    );
  },

  /** Restore = a new edit carrying revision `n`'s snapshot, under `version`. */
  restorePageRevision(workspaceId: string, pageId: string, n: number, version: number): Promise<PagesPage> {
    return apiClient.post<PagesPage>(
      scoped(`/v1/pages/pages/${encodeURIComponent(pageId)}/revisions/${n}/restore`, workspaceId),
      { version },
      { workspaceId }
    );
  },
};

/**
 * The domain error code pages-service puts in `error` of its envelope
 * (`route_path_taken`, `invalid_route_path`, `page_route_taken`, …). apiClient
 * keeps the parsed error body on `data`.
 */
export function pagesErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : null;
}

/** The HTTP status apiClient keeps on the error it throws. */
export function pagesHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * The client-side mirror of pages-service `models.NormalizeRoutePath`: trim,
 * a leading slash is mandatory, trailing slashes go (except at the root).
 *
 * It exists so the screen can tell a real rename from a no-op: the service
 * normalises before it compares, and a path that normalises to the current
 * one is dropped from the update entirely (route_handler.go Update). Without
 * the mirror, "/about/" typed over "/about" would raise the "old links will
 * break" warning for a change that never happens — and a warning that lies in
 * the cheap case stops being read in the expensive one.
 *
 * `null` = the service would refuse it (empty, no leading slash, a reserved
 * character — see {@link hasReservedAddressChars}).
 */
export function normalizeAddressPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("/")) return null;
  if (hasReservedAddressChars(trimmed)) return null;
  if (trimmed.length === 1) return trimmed;
  const cut = trimmed.replace(/\/+$/, "");
  const path = cut === "" ? "/" : cut;
  // The service refuses whitespace left before a trailing slash ("/a /")
  // rather than storing a path that would not survive a second pass.
  return path === path.trim() ? path : null;
}

/**
 * pages-service refuses ":" and "{" anywhere in an address (SDL-690,
 * `reservedPathChars` in `NormalizeRoutePath`, 400 `invalid_route_path`):
 * they are other routers' parameter syntax (/:slug, /{slug}) and the format
 * keeps them free for its own route parameters. A dynamic segment is written
 * as `[slug]`. Mirrored here so the form can say so before the request, and
 * so a server refusal can be told apart from the other `invalid_route_path`
 * reasons by what was typed.
 */
export const RESERVED_ADDRESS_CHARS = [":", "{"] as const;

export function hasReservedAddressChars(raw: string): boolean {
  return RESERVED_ADDRESS_CHARS.some((ch) => raw.includes(ch));
}

/**
 * Which sentence a server `invalid_route_path` gets. The code carries several
 * reasons (reserved character, whitespace before a trailing slash, …); the
 * reserved one is the one a person acts on directly, and it is told apart by
 * what was sent — the reason in `message` is English for developers.
 */
export function invalidRoutePathMessageKey(sentPath: string): "reserved" | "invalid" {
  return hasReservedAddressChars(sentPath) ? "reserved" : "invalid";
}

/**
 * The current page a 409 `page_version_conflict` carries in `data` of its
 * envelope (apiClient keeps the whole envelope on the error's `data`).
 */
export function pagesConflictPage(error: unknown): PagesPage | null {
  if (pagesErrorCode(error) !== "page_version_conflict") return null;
  const envelope = (error as { data?: { data?: unknown } }).data;
  const page = envelope?.data;
  if (!page || typeof page !== "object" || typeof (page as { version?: unknown }).version !== "number") return null;
  return page as PagesPage;
}

/**
 * The current route a 409 `route_version_conflict` carries in `data` of its
 * envelope (route_handler.go `respondRouteError` passes `current`). Same
 * shape as `pagesConflictPage`, a different code and a different entity —
 * one editor holds both versions at once (the page's, saved by the
 * auto-saver, and the route's, changed by publish and by the settings
 * dialog), and telling their conflicts apart is the whole point.
 */
export function pagesConflictRoute(error: unknown): PagesRoute | null {
  if (pagesErrorCode(error) !== "route_version_conflict") return null;
  const envelope = (error as { data?: { data?: unknown } }).data;
  const route = envelope?.data;
  if (!route || typeof route !== "object" || typeof (route as { version?: unknown }).version !== "number") return null;
  return route as PagesRoute;
}

/** The current Block a 409 `block_version_conflict` carries in `data` (block_handler.go). */
export function pagesConflictBlock(error: unknown): PagesBlock | null {
  if (pagesErrorCode(error) !== "block_version_conflict") return null;
  const envelope = (error as { data?: { data?: unknown } }).data;
  const block = envelope?.data;
  if (!block || typeof block !== "object" || typeof (block as { version?: unknown }).version !== "number") return null;
  return block as PagesBlock;
}

function asBlockUsage(value: unknown): PagesBlockUsage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { pages?: unknown; blocks?: unknown; count?: unknown };
  const pages = asList<PagesBlockUsagePage>(v.pages);
  const blocks = asList<PagesBlockUsageBlock>(v.blocks);
  const count = typeof v.count === "number" ? v.count : pages.length + blocks.length;
  return { pages, blocks, count };
}

/**
 * The places a 409 `block_in_use` carries in `data` of its envelope
 * (block_handler.go Delete: `{usage, usage_count}`), or `null` for any other
 * error. A refusal without a readable list still counts as "in use" — with an
 * empty list, so the dialog asks before forcing instead of failing silently.
 */
export function pagesBlockInUse(error: unknown): PagesBlockUsage | null {
  if (pagesErrorCode(error) !== "block_in_use") return null;
  const envelope = (error as { data?: { data?: unknown } }).data;
  const inner = envelope?.data as { usage?: unknown; usage_count?: unknown } | undefined;
  const usage = asBlockUsage(inner?.usage);
  if (usage) return usage;
  const count = typeof inner?.usage_count === "number" ? inner.usage_count : 0;
  return { pages: [], blocks: [], count };
}

/** Block usage out of a GET /v1/pages/blocks/{id} answer, never null. */
export function pagesBlockUsageOf(detail: PagesBlockDetail | null | undefined): PagesBlockUsage {
  return asBlockUsage(detail?.usage) ?? { pages: [], blocks: [], count: 0 };
}
