import type { PolicyJournalMode, PolicyJournalQuery } from "../model/types";

/** The service caps `search` at 100 characters and answers 400 above it. */
export const POLICY_JOURNAL_SEARCH_MAX = 100;

/**
 * Query string of GET /v1/policy-acceptances. `edition` and `current_edition`
 * never go together (400), an empty search is not sent, and the search is
 * trimmed and cut to the service's ceiling so typing can never produce a 400.
 */
export function journalSearchParams(query: PolicyJournalQuery): URLSearchParams {
  const params = new URLSearchParams();
  const search = query.search.trim().slice(0, POLICY_JOURNAL_SEARCH_MAX);
  if (search) params.set("search", search);
  if (query.mode.kind === "edition") params.set("edition", query.mode.version);
  if (query.mode.kind === "current") params.set("current_edition", query.mode.version);
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  return params;
}

export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

/** File name of a CSV export — says which slice of the journal it holds. */
export function journalCsvName(mode: PolicyJournalMode): string {
  if (mode.kind === "current") return `policy-acceptances-currently-on-${mode.version}.csv`;
  if (mode.kind === "edition") return `policy-acceptances-${mode.version}.csv`;
  return "policy-acceptances-all-editions.csv";
}
