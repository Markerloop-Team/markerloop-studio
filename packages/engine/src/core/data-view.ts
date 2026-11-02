// DataView — the first widget Element (EP-117 "Elements", SDL-639).
//
// A DataView shows records of ONE collection: a list with a sort, a base
// filter and tab presets ("Unread" / "All" for the Messages feed). The data
// source is part of the Element's props — the binding lives on the node, as
// the properties canvas of SDL-595 draws it, not on the page
// (`collection_binding` is untouched) and not as a `$bind` marker.
//
// The props are a contract with a version (EP-128): `propsVersion: 1` here,
// stored by the node as `SaunaNodeConfig.propsVersion` (absent = 1). What
// the contract allows is EXACTLY what collections-service's `GET /records`
// can serve (`collections-service/internal/handlers/record_filters.go`,
// `repository/record_query.go`):
//
//   - `collection_id` picks the collection. `workspace_id` is the scope the
//     collection lives in — the page's workspace, what the admin's every
//     scoped call carries — and is NOT a `GET /records` param (the service
//     checks ownership by the chain workspace → collection; the gateway route
//     `/api/v1/records` carries no scope kind — `gw-service/internal/config/routes.go`).
//     There is no project — SDL-617 removed it, and a `project_id` here is
//     refused, not ignored;
//   - `sort_by` is `created_at`, `updated_at` or a field key, `sort_order`
//     asc|desc;
//   - a filter is `filter[<field_key>][<op>]=<value>` with op in
//     eq|ne|gt|gte|lt|lte|in|like|null — several filters AND together. `in`
//     takes one comma-separated string (the gateway collapses repeated query
//     params to the first), `null` takes true|false;
//   - `limit` is 1..100.
//
// Nothing beyond that is expressible on purpose: an operator the service
// cannot serve would validate here and 400 there. `dataViewQuery` is the
// proof — it turns the props into that query, and the tests pin the form.
//
// Server-safe (zod only), like the rest of `core`. The component is
// `../react/data-view`; wiring into the admin's catalog is a later task.

import { z } from "zod";

import { defineBlock } from "./define-block";

export const DATA_VIEW_PROPS_VERSION = 1;

/** The one data source kind this version knows. */
export const DATA_VIEW_SOURCE_KINDS = ["collection"] as const;

/** Exactly the operators `record_query.go` allows — do not add one it cannot serve. */
export const DATA_VIEW_FILTER_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "like", "null"] as const;
export type DataViewFilterOp = (typeof DATA_VIEW_FILTER_OPS)[number];

export const DATA_VIEW_SORT_DIRECTIONS = ["asc", "desc"] as const;

/** The service's limit range, `GET /records?limit=`. */
export const DATA_VIEW_LIMIT = { min: 1, max: 100, initial: 20 } as const;

/** A field key as collections-service accepts it (`fieldKeyRe`), or one of the two timestamps. */
const fieldKey = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, "field key: lowercase letter, then [a-z0-9_], up to 63 chars");

/** One `filter[field][op]=value`. `value` is what goes on the wire, so a primitive; `null` takes a boolean. */
export const DataViewFilterClause = z
  .strictObject({
    field: fieldKey,
    op: z.enum(DATA_VIEW_FILTER_OPS),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })
  .superRefine((clause, ctx) => {
    if (clause.op === "null" && typeof clause.value !== "boolean") {
      ctx.addIssue({ code: "custom", path: ["value"], message: "op null takes a boolean (true = is null)" });
    }
  });
export type DataViewFilterClause = z.output<typeof DataViewFilterClause>;

/** Several clauses AND together, as several `filter[...]` params do on the service. */
export const DataViewFilter = z.array(DataViewFilterClause);

export const DataViewSource = z.strictObject({
  kind: z.enum(DATA_VIEW_SOURCE_KINDS),
  workspace_id: z.uuid(),
  collection_id: z.uuid(),
  /**
   * The collection's `key` (SDL-679). Optional and additive: the admin reads
   * by `collection_id`, but the anonymous plane a published page reads
   * (`/v1/data/<workspace>/<key>`) addresses a collection by key only.
   * A node bound before SDL-679 has none — on the site it draws the
   * "collection unavailable" stub until the author re-picks the collection.
   */
  collection_key: fieldKey.optional(),
});

export const DataViewPreset = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  filter: DataViewFilter,
});
export type DataViewPreset = z.output<typeof DataViewPreset>;

export const DataViewPropsSchema = z
  .strictObject({
    source: DataViewSource,
    /** Field keys drawn per record, in order. Empty = nothing bound yet. */
    fields: z.array(fieldKey),
    sort: z.strictObject({
      field: fieldKey,
      direction: z.enum(DATA_VIEW_SORT_DIRECTIONS),
    }),
    /** Applied to every preset — the tabs narrow it further. */
    filter: DataViewFilter,
    /** Tabs. The first is the initial one; no presets = one unnamed list. */
    presets: z.array(DataViewPreset),
    limit: z.number().int().min(DATA_VIEW_LIMIT.min).max(DATA_VIEW_LIMIT.max),
  })
  .superRefine((props, ctx) => {
    const seen = new Set<string>();
    props.presets.forEach((p, i) => {
      if (seen.has(p.id)) ctx.addIssue({ code: "custom", path: ["presets", i, "id"], message: `duplicate preset id "${p.id}"` });
      seen.add(p.id);
    });
    // One `filter[field][op]` per query: the service reads a map and the
    // gateway keeps the first repeated param, so a second clause with the
    // same field and op would be dropped on the wire, never ANDed. Refused
    // here, within the base filter and between the base and each preset.
    const wireKey = (c: DataViewFilterClause) => `filter[${c.field}][${c.op}]`;
    const refuseClashes = (clauses: readonly DataViewFilterClause[], path: (string | number)[], taken: ReadonlySet<string>) => {
      const keys = new Set(taken);
      clauses.forEach((c, i) => {
        const key = wireKey(c);
        if (keys.has(key)) ctx.addIssue({ code: "custom", path: [...path, i], message: `${key} given twice — the service takes one value per field and op` });
        keys.add(key);
      });
    };
    refuseClashes(props.filter, ["filter"], new Set());
    const base = new Set(props.filter.map(wireKey));
    props.presets.forEach((p, i) => refuseClashes(p.filter, ["presets", i, "filter"], base));
  });
export type DataViewProps = z.output<typeof DataViewPropsSchema>;

/**
 * What a NEW node starts with: everything but the source. A DataView with
 * no collection is an UNBOUND one — `parseElementProps` reports it at
 * `$.props.source`, the component draws its unbound frame, and the
 * properties panel (a later task) is where the author picks the collection.
 * The alternative, a placeholder uuid, would validate a node that can never
 * fetch anything.
 */
export const DATA_VIEW_INITIAL_PROPS: Omit<DataViewProps, "source"> = {
  fields: [],
  sort: { field: "created_at", direction: "desc" },
  filter: [],
  presets: [],
  limit: DATA_VIEW_LIMIT.initial,
};

export const DataViewBlock = defineBlock({
  type: "DataView",
  displayName: "Data view",
  propsVersion: DATA_VIEW_PROPS_VERSION,
  staticProps: DataViewPropsSchema,
  meta: {
    category: "Data",
    description: "Records of a collection as a list, with a sort, a filter and tab presets.",
    initialProps: DATA_VIEW_INITIAL_PROPS,
  },
});

/** The widget Elements; pair with `WIDGET_REGISTRY` from `@markerloop/engine/react`. */
export const WIDGET_BLOCKS = [DataViewBlock] as const;

/** The query `GET /records` is given for one preset (or the base list when `presetId` is absent). */
export type DataViewQuery = Record<string, string>;

/**
 * Turns parsed props into the `GET /records` query — the same keys, the
 * same value forms (`in` comma-joined as authored, `null` as "true"/"false").
 * The base filter and the preset's are both sent; the service ANDs them.
 * `workspace_id` is not in it: it is the scope, not a records-list param.
 *
 * Throws on a preset id the props do not have: the caller asked for a tab
 * that does not exist, and an unfiltered list in its place would be the
 * silent failure `parseRecordFilters` refuses on its side.
 */
export function dataViewQuery(props: DataViewProps, presetId?: string): DataViewQuery {
  const preset = presetId === undefined ? undefined : props.presets.find((p) => p.id === presetId);
  if (presetId !== undefined && !preset) throw new Error(`DataView has no preset "${presetId}"`);
  const query: DataViewQuery = {
    collection_id: props.source.collection_id,
    sort_by: props.sort.field,
    sort_order: props.sort.direction,
    limit: String(props.limit),
  };
  for (const clause of [...props.filter, ...(preset?.filter ?? [])]) {
    const key = `filter[${clause.field}][${clause.op}]`;
    if (key in query) throw new Error(`DataView query: ${key} given twice`);
    query[key] = String(clause.value);
  }
  return query;
}

/**
 * Where the anonymous data plane serves one DataView list: the path BELOW the
 * API base (`/data/<workspace>/<key>`) + query. The base carries the version
 * prefix and differs by caller: the site's server reads in-cluster
 * (`http://gateway-service/api/v1`), the browser reads the public API host
 * (`https://api.<base>/v1` — that host maps `/v1/*` onto the gateway's
 * `/api/v1/*`; `/api/v1/...` there is a bare 404, measured 5 Oct 2026).
 */
export type PublicDataViewRequest = { path: string; query: DataViewQuery };

/**
 * The props → the anonymous `GET <base>/data/<workspace>/<collection key>`
 * request (SDL-679): the same sort, filter and limit as `dataViewQuery`,
 * minus `collection_id` — on this plane the collection is the path's key.
 * `null` when the node carries no `collection_key`: there is nothing to ask
 * for, and the caller draws the "unavailable" stub.
 */
export function publicDataViewRequest(props: DataViewProps, presetId?: string): PublicDataViewRequest | null {
  const key = props.source.collection_key;
  if (key === undefined) return null;
  const { collection_id: _omitted, ...query } = dataViewQuery(props, presetId);
  void _omitted;
  return {
    path: `/data/${encodeURIComponent(props.source.workspace_id)}/${encodeURIComponent(key)}`,
    query,
  };
}

/**
 * One stable string per distinct public list: the server-loaded first page
 * is handed to the client keyed by it, so the component finds its own page
 * without a node id (a published page carries none).
 */
export function publicDataViewKey(request: PublicDataViewRequest): string {
  const params = new URLSearchParams(Object.entries(request.query).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return `${request.path}?${params.toString()}`;
}
