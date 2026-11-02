// The one write a DataView makes (SDL-641, EP-130): the declared field
// `read_at` — the time a record was read, empty = unread. No general action
// system: this file knows one field and one way to write it.
//
// PATCH /records/:id REPLACES the record's `data` whole and carries the
// `version` it was built from (collections-service `UpdateRecordRequest`); a
// stale version answers 409 `record_version_conflict`. So a write is always
// read → change ONE field → write with that version, and on 409 the whole
// round is repeated from a fresh read. Building the payload from the row on
// screen (or sending only `{read_at}`) would wipe what another tab or the
// mirror script wrote since — the defect the smoke plants.

import type { CollectionRecord } from "@/widgets/collections";
import { apiErrorCode } from "@/shared/lib/api/collections-client";

/** The only field the widget writes. The collection must declare it. */
export const DATA_VIEW_READ_FIELD = "read_at";

/**
 * Field types `read_at` may have for the widget to write it: collections-
 * service types `date` as an ISO-8601 string and passes `string` as is — an
 * ISO timestamp is valid for both. Any other type draws no toggle.
 */
export const DATA_VIEW_READ_FIELD_TYPES: ReadonlySet<string> = new Set(["date", "string"]);

/** The collection declares a writable `read_at`. */
export function declaresReadField(fields: readonly { key: string; type: string }[], field: string = DATA_VIEW_READ_FIELD): boolean {
  return fields.some((f) => f.key === field && DATA_VIEW_READ_FIELD_TYPES.has(f.type));
}

/** How many read→write rounds before giving up on a record others keep rewriting. */
export const DATA_VIEW_WRITE_ATTEMPTS = 3;

export type RecordWriteApi = {
  get: (id: string) => Promise<CollectionRecord>;
  update: (id: string, payload: { data: Record<string, unknown>; version: number }) => Promise<CollectionRecord>;
};

export function isVersionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { status?: unknown }).status !== 409) return false;
  return apiErrorCode(error) === "record_version_conflict";
}

/** Read or not: any non-empty `read_at`. */
export function isRecordRead(record: CollectionRecord, field: string = DATA_VIEW_READ_FIELD): boolean {
  const value = record.data[field];
  return value !== null && value !== undefined && value !== "";
}

/**
 * Sets `field` to `value` (null = removes it) on the CURRENT record, leaving every other field as
 * the server has it. Retries the whole read→write on 409; any other error,
 * or a conflict that outlives the attempts, is thrown to the caller.
 */
export async function writeDeclaredField(input: {
  api: RecordWriteApi;
  id: string;
  field: string;
  value: string | null;
  /**
   * The collection's field keys. A key the schema no longer declares (the
   * field was deleted, old records still carry it) is dropped before the
   * PATCH: the service answers such a key 400 `unknown_field_key`, on every
   * attempt, forever. Absent = send the record's keys as read.
   */
  declaredKeys?: ReadonlySet<string>;
  attempts?: number;
}): Promise<CollectionRecord> {
  const attempts = input.attempts ?? DATA_VIEW_WRITE_ATTEMPTS;
  let lastConflict: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await input.api.get(input.id);
    const data: Record<string, unknown> = { ...current.data };
    if (input.declaredKeys) {
      for (const key of Object.keys(data)) if (!input.declaredKeys.has(key)) delete data[key];
    }
    // Unread is the field's absence, as records arrive from the writers —
    // not a null the field's type might refuse.
    if (input.value === null) delete data[input.field];
    else data[input.field] = input.value;
    try {
      return await input.api.update(input.id, { data, version: current.version });
    } catch (error) {
      if (!isVersionConflict(error)) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict;
}
