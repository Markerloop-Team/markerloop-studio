// The field description of a DataView (EP-186): a screen describes each of
// its fields ONCE, and the one description draws the desktop table column,
// the tile and the mobile card. Before it, a screen described its table
// columns, its tiles and its mobile cards separately, and they drifted.
//
// Deliberately free of admin imports (no next-intl, no TanStack, no kit):
// the type is meant to move into a shared package so the same settings can
// later drive the public-site renderer. The names follow the engine's
// DataView Element where they mean the same thing (`fields`, `sort` with
// `field` + `direction`).

import type { ReactNode } from "react";

/** A field's value as the list reads it: for sorting, client search and the default render. */
export type DataViewValue = string | number | boolean | Date | null | undefined;

/** What a field becomes in a tile. Several `meta` fields are drawn in order. */
export type DataViewTileRole = "title" | "media" | "meta" | "badge";

/**
 * What a field becomes in a mobile card. Several `field`s are drawn in order;
 * a `note` is a muted one-line «label: value» under them (records: Updated).
 */
export type DataViewCardRole = "title" | "field" | "note" | "actions";

export type DataViewSortDirection = "asc" | "desc";

/** One sort clause — the engine DataView's `sort` shape. */
export interface DataViewSort {
  field: string;
  direction: DataViewSortDirection;
}

export interface DataViewField<TRow> {
  /** Stable key: the column id, the sort key, the card / tile slot key. */
  id: string;
  /** Column header and the label of the field in a mobile card. */
  label?: string;
  /** The header names the column for assistive technology only (an actions column). */
  labelHidden?: boolean;
  /** Reads the value: sorting, client search and the default render. */
  value?: (row: TRow) => DataViewValue;
  /** Draws the value. Absent → the value as text. */
  render?: (row: TRow) => ReactNode;
  /**
   * Header sort control. Default: sortable when the field has a `value`
   * (the way the kit table treated accessor columns).
   */
  sortable?: boolean;
  /** First direction of the header click cycle. Default: the table's own guess by value type. */
  sortFirst?: DataViewSortDirection;
  /** Not a table column (a tile- or card-only field). Default: true. */
  table?: boolean;
  /** Native tooltip on the header cell. */
  headerHint?: string;
  /** Native tooltip on the body cell. */
  hint?: (row: TRow) => string | undefined;
  /** Role in a tile; absent = not in the tile. */
  tile?: DataViewTileRole;
  /** Role in a mobile card; absent = not in the card. */
  card?: DataViewCardRole;
}

/** The fields of one card slot, in declaration order. */
export function fieldsWithCardRole<TRow>(
  fields: readonly DataViewField<TRow>[],
  role: DataViewCardRole
): DataViewField<TRow>[] {
  return fields.filter((field) => field.card === role);
}

/** The fields of one tile slot, in declaration order. */
export function fieldsWithTileRole<TRow>(
  fields: readonly DataViewField<TRow>[],
  role: DataViewTileRole
): DataViewField<TRow>[] {
  return fields.filter((field) => field.tile === role);
}

/** The default render: the value as text, nothing for an absent one. */
export function formatFieldValue(value: DataViewValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
