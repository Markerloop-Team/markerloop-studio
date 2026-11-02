// Workspace usage on one screen (SDL-666): the three usage handles of the
// services, read as they are — every number the panel draws, the limit
// included, is the service's answer, never a constant of the admin. Pure, so
// smoke:usage-limits runs it without React.

import type { WorkspaceUsage } from "@/shared/lib/api/collections-client";
import type { FilesUsage } from "@/shared/lib/api/files-client";
import type { PagesUsage } from "@/shared/lib/api/pages-client";

/** From this share on, the panel raises the «running out» banner. */
export const USAGE_WARN_PERCENT = 75;
/** At the limit: writes of that resource are refused, reads keep working. */
export const USAGE_FULL_PERCENT = 100;

export type UsageResource =
  | "workspaces"
  | "collections"
  | "records"
  | "routes"
  | "files"
  | "bytes";

export type UsageRow = {
  resource: UsageResource;
  used: number;
  limit: number;
  /** Bytes are drawn as sizes, the rest as counts. */
  unit: "count" | "bytes";
  /** 0..100+, rounded down; null when the limit is off (0). */
  percent: number | null;
};

function row(resource: UsageResource, used: number, limit: number, unit: UsageRow["unit"] = "count"): UsageRow {
  const percent = limit > 0 ? Math.floor((used / limit) * 100) : null;
  return { resource, used, limit, unit, percent };
}

/**
 * One counter of a usage body — `body[resource][field]` — or `null` when the
 * body does not carry it as a finite number. The body is whatever the service
 * answered with a 200: an older service, a gateway stub or a proxy can hand
 * back `{}`, `[]` or `{ routes: null }`, and a plain `body.routes.used` then
 * throws in render. Every reader of a usage body goes through here.
 */
export function usageNumber(body: unknown, resource: string, field: string): number | null {
  if (!body || typeof body !== "object") return null;
  const entry = (body as Record<string, unknown>)[resource];
  if (!entry || typeof entry !== "object") return null;
  const value = (entry as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A row only when both of its numbers are there; a partial body draws fewer rows, never NaN. */
function rowOf(
  body: unknown,
  resource: UsageResource,
  key: string,
  limitField: string,
  unit: UsageRow["unit"] = "count"
): UsageRow[] {
  const used = usageNumber(body, key, "used");
  const limit = usageNumber(body, key, limitField);
  return used === null || limit === null ? [] : [row(resource, used, limit, unit)];
}

/**
 * The panel's rows, in a fixed order; a source that has not answered (null)
 * contributes no rows — the panel says so instead of drawing zeros.
 */
export function usageRows(sources: {
  workspace?: WorkspaceUsage | null;
  pages?: PagesUsage | null;
  files?: FilesUsage | null;
}): UsageRow[] {
  const { workspace, pages, files } = sources;
  return [
    ...rowOf(workspace, "workspaces", "workspaces", "limit"),
    ...rowOf(workspace, "collections", "collections", "limit"),
    ...rowOf(workspace, "records", "records", "limit"),
    ...rowOf(pages, "routes", "routes", "limit"),
    ...rowOf(files, "files", "files", "limit"),
    ...rowOf(files, "bytes", "bytes", "quota", "bytes"),
  ];
}

export type UsageLevel = "ok" | "warn" | "full";

export function usageLevel(r: Pick<UsageRow, "percent">): UsageLevel {
  if (r.percent === null) return "ok";
  if (r.percent >= USAGE_FULL_PERCENT) return "full";
  if (r.percent >= USAGE_WARN_PERCENT) return "warn";
  return "ok";
}

/** The rows at the limit and the rows past the warning line, for the banners. */
export function usageAlerts(rows: readonly UsageRow[]): { full: UsageRow[]; warn: UsageRow[] } {
  return {
    full: rows.filter((r) => usageLevel(r) === "full"),
    warn: rows.filter((r) => usageLevel(r) === "warn"),
  };
}
