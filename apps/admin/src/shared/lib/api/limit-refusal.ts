// One reading of a limit refusal for every client (SDL-666).
//
// The services refuse a write past a workspace limit in three shapes, all of
// them meaning the same thing to a person:
//   - 409 quota_exceeded — collections (workspaces, collections, records),
//     pages (routes), files (number of files);
//   - 507 quota_exceeded — files, bytes of the workspace (objection G6: a
//     reader that only knows 409 misses every storage refusal);
//   - 413 record_too_large — one record over record_max_bytes.
// The envelope is `{success:false, error:<code>, message, data:{resource,
// limit, used}}`; apiClient keeps the parsed body on `error.data`, so the
// details sit at `data.data`. Older call sites that unwrap once are read too.
//
// The sentence a person sees comes from @markerloop/policy (limit_write_refused)
// and only where the promise is in force on the contour; the link always goes
// to /rules/limits. Nothing here is a copy of the policy text.

export const QUOTA_EXCEEDED = "quota_exceeded";
/**
 * `resource` of the one-free-workspace refusal (collections-service SDL-758,
 * LIMIT_FREE_WORKSPACES_PER_OWNER): the owner already has a free workspace.
 */
export const FREE_WORKSPACES = "free_workspaces";
/** `resource` of the owner's ceiling of workspaces, the trash included. */
export const WORKSPACES = "workspaces";
export const RECORD_TOO_LARGE = "record_too_large";
export const LIMITS_RULES_HREF = "/rules/limits";
export const DELETION_RULES_HREF = "/rules/deletion";

/**
 * The workspace in the trash that holds the one free place (collections-service
 * SDL-758, `data.blocking_trashed` of a free_workspaces refusal). The trash
 * keeps holding the place until it is erased; the person picks: restore it or
 * erase it now and create the new one.
 */
export type BlockingTrashed = {
  id: string;
  name: string;
  slug?: string;
  deleted_at: string;
  purge_after: string;
  days_left?: number;
};

export type LimitRefusal = {
  code: typeof QUOTA_EXCEEDED | typeof RECORD_TOO_LARGE;
  status: number;
  /** workspaces | free_workspaces | collections | records | routes | files | bytes, when sent. */
  resource?: string;
  limit?: number;
  used?: number;
  /**
   * free_workspaces only: the trashed workspace holding the place, or null
   * when an active workspace holds it (then the plain refusal stands).
   */
  blockingTrashed?: BlockingTrashed | null;
};

function blockingTrashedOf(value: unknown): BlockingTrashed | null {
  const v = asObject(value);
  if (!v) return null;
  const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);
  const id = str(v.id);
  const name = str(v.name);
  const deletedAt = str(v.deleted_at);
  const purgeAfter = str(v.purge_after);
  if (!id || !name || !deletedAt || !purgeAfter) return null;
  return {
    id,
    name,
    slug: str(v.slug),
    deleted_at: deletedAt,
    purge_after: purgeAfter,
    days_left: typeof v.days_left === "number" && Number.isFinite(v.days_left) ? v.days_left : undefined,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** The refusal carried by an error apiClient threw, or null for any other error. */
export function limitRefusalOf(error: unknown): LimitRefusal | null {
  const err = asObject(error);
  if (!err) return null;
  const status = typeof err.status === "number" ? err.status : 0;
  const body = asObject(err.data);
  if (!body) return null;
  const code = body.error;
  const isQuota = code === QUOTA_EXCEEDED && (status === 409 || status === 507);
  const isTooLarge = code === RECORD_TOO_LARGE && status === 413;
  if (!isQuota && !isTooLarge) return null;
  const details = asObject(body.data) ?? body;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    code: isQuota ? QUOTA_EXCEEDED : RECORD_TOO_LARGE,
    status,
    resource: typeof details.resource === "string" ? details.resource : undefined,
    limit: num(details.limit),
    used: num(details.used),
    blockingTrashed:
      "blocking_trashed" in details ? blockingTrashedOf(details.blocking_trashed) : undefined,
  };
}

/** Whole days since `iso` (0 = today); `now` for tests. */
export function daysSince(iso: string, now: number = Date.now()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

// The contour's policy sentence for a quota refusal, set by PolicyFlagsProvider
// (it is the only place that knows the contour's flags on the client). apiClient
// reads it when it builds the error, so every existing `toast.error(e.message)`
// shows the rule instead of the service's bare wording. null = the promise is
// not in force here: the service's own message stays.
let quotaRefusalCopy: string | null = null;

export function setQuotaRefusalCopy(text: string | null): void {
  quotaRefusalCopy = text;
}

/** The message apiClient puts on a refusal: the policy sentence when it is in force. */
export function limitRefusalMessage(refusal: LimitRefusal, fallback: string): string {
  if (refusal.code === QUOTA_EXCEEDED && quotaRefusalCopy) return quotaRefusalCopy;
  return fallback;
}
