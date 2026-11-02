// The entry point of a pinned feed (SDL-645, EP-130) — the pure half.
//
// A page is "pinned" by a flag on its ADDRESS in pages-service (SDL-644), so
// the pin is the same on the iPad and the Mac. The sidebar lists pinned
// addresses; the home page shows how many records of the pinned feed are
// unread. "Unread" is `read_at` empty — the collection's own answer to
// `filter[read_at][null]=true`, counted by the service (`meta.total`), no
// backend of its own.
//
// No React and no fetch here: the smoke (smoke/pinned-feed.tsx) executes
// these rules directly.

import { DataViewPropsSchema, dataViewQuery, type DataViewProps } from "@markerloop/engine";

import type { PagesRoute } from "@/shared/lib/api/pages-client";

/** The declared read mark of a feed (SDL-641 `DATA_VIEW_READ_FIELD`). */
export const FEED_READ_FIELD = "read_at";

/** The unread filter, as collections-service spells it. */
export const UNREAD_FILTER_KEY = `filter[${FEED_READ_FIELD}][null]`;

/**
 * The query-key prefix of the DataView's counter (widgets/pages/data-view.tsx
 * `dataViewRecordKeys.counters()`). The entry point shares it on purpose: a
 * read mark in the feed invalidates that prefix, so the number in the sidebar
 * and on the home page is re-read by the same click. A copy, not an import —
 * features do not reach into widgets; smoke/pinned-feed.tsx pins the two equal.
 */
export const FEED_COUNTER_KEY_PREFIX = ["pages", "data-view", "records", "counter"] as const;

export function feedCounterKey(query: Readonly<Record<string, string>>) {
  return [...FEED_COUNTER_KEY_PREFIX, query] as const;
}

/** Pinned addresses, in a stable order: by tab title, then by path. */
export function pinnedRoutes(routes: ReadonlyArray<PagesRoute> | null | undefined): PagesRoute[] {
  return (routes ?? [])
    .filter((r) => r.pinned === true)
    .sort((a, b) => (a.title || a.path).localeCompare(b.title || b.path) || a.path.localeCompare(b.path));
}

/** What a pinned address is called in the menu: the tab title, else the path. */
export function pinnedLabel(route: Pick<PagesRoute, "title" | "path">): string {
  const title = route.title.trim();
  return title !== "" ? title : route.path;
}

type NodeLike = { type?: unknown; props?: unknown; children?: unknown };

/**
 * The DataViews of a page body, in document order (depth-first from the
 * root; unreachable nodes are not drawn and do not count), with their props
 * validated by the engine's own schema. Unbound DataViews are skipped.
 */
export function findFeedDataViews(body: unknown): DataViewProps[] {
  if (!body || typeof body !== "object") return [];
  const { rootId, nodes } = body as { rootId?: unknown; nodes?: unknown };
  if (!nodes || typeof nodes !== "object") return [];
  const table = nodes as Record<string, NodeLike>;

  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    const children = table[id]?.children;
    if (Array.isArray(children)) for (const c of children) if (typeof c === "string") walk(c);
  };
  if (typeof rootId === "string") walk(rootId);
  // Only what the page draws: a node the tree does not reach is not on screen.

  const found: DataViewProps[] = [];
  for (const id of order) {
    const node = table[id];
    if (node?.type !== "DataView") continue;
    const parsed = DataViewPropsSchema.safeParse(node.props);
    if (parsed.success) found.push(parsed.data);
  }
  return found;
}

/**
 * The feed candidate of a page: its first bound DataView reading a collection
 * of THIS workspace. A DataView bound to another workspace's collection is not
 * this workspace's feed — its count must not appear in this workspace's menu.
 */
export function findFeedDataView(body: unknown, workspaceId?: string | null): DataViewProps | null {
  for (const props of findFeedDataViews(body)) {
    if (workspaceId !== undefined && props.source.workspace_id !== workspaceId) continue;
    return props;
  }
  return null;
}

/**
 * A count answer that means "this collection is not a feed", not "try later".
 * A candidate is a feed only if its collection declares the read mark (the
 * widget's own `declaresReadField`, SDL-641, checked in ./index.ts); should
 * the schema and the service still disagree, the service's 400
 * `unknown_filter_field` demotes the page the same way.
 */
export function isNotAFeedError(code: string | undefined): boolean {
  return code === "unknown_filter_field";
}

/**
 * The one read the entry point makes: the feed's own base filter and sort,
 * plus "read_at is empty", one row. `meta.total` is the unread count; the row
 * is the newest unread record under the feed's sort. Preset filters are NOT
 * applied — the number is "unread of this feed", whichever tab is first.
 */
export function unreadQuery(props: DataViewProps): Record<string, string> {
  const query: Record<string, string> = { ...dataViewQuery(props) };
  query.limit = "1";
  query[UNREAD_FILTER_KEY] = "true";
  return query;
}

/** The heading of a record for the "latest" line: the feed's first field, when it is text. */
export function recordHeading(props: DataViewProps, data: Record<string, unknown> | null | undefined): string | null {
  const first = props.fields[0];
  if (!first || !data) return null;
  const value = data[first];
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

/** The count as the entry point shows it: a number, "loading", or unknown (null) — never a stale guess. */
export type FeedCount = number | "loading" | null;

/**
 * The sidebar badge: only a known, positive count. Zero is not a signal, and
 * an unknown count is not drawn (canvas A, `pinnedFor`).
 */
export function badgeCount(count: FeedCount): number | null {
  return typeof count === "number" && count > 0 ? count : null;
}
