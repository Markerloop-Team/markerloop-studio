import { apiClient } from "@/shared/lib/api/client";
import { journalSearchParams, totalPages } from "../lib/journal-query";
import {
  POLICY_JOURNAL_MAX_LIMIT,
  type PolicyAcceptance,
  type PolicyEditionSummary,
  type PolicyJournalMode,
  type PolicyJournalPage,
  type PolicyJournalQuery,
  type UserPolicyAcceptances,
} from "../model/types";

/**
 * The journal of rule acceptances (SDL-752). The gateway holds
 * `users:read:policy_acceptances` for all three reads; only superadmin has it
 * today (not in the seed), so callers gate on that permission BEFORE asking —
 * a request that the gateway answers 403 is never sent.
 */
export const policyAcceptancesApi = {
  list: async (query: PolicyJournalQuery): Promise<PolicyJournalPage> => {
    const page = await apiClient.get<PolicyJournalPage>(
      `/v1/policy-acceptances?${journalSearchParams(query).toString()}`
    );
    return {
      acceptances: Array.isArray(page?.acceptances) ? page.acceptances : [],
      count: page?.count ?? 0,
      total: page?.total ?? 0,
      page: page?.page ?? query.page,
      limit: page?.limit ?? query.limit,
    };
  },

  summary: async (): Promise<PolicyEditionSummary> => {
    const s = await apiClient.get<PolicyEditionSummary>(
      "/v1/policy-acceptances/summary"
    );
    return {
      editions: Array.isArray(s?.editions) ? s.editions : [],
      never_accepted: s?.never_accepted ?? 0,
      total_users: s?.total_users ?? 0,
    };
  },

  /**
   * Every row of a filter, page by page at the service's ceiling — the CSV
   * holds the whole selection, not the page on screen.
   */
  listAll: async (
    search: string,
    mode: PolicyJournalMode
  ): Promise<PolicyAcceptance[]> => {
    // Keyed by id: a row accepted while the export pages through shifts the
    // pages by one (newest first), and the same row would come twice.
    const rows = new Map<string, PolicyAcceptance>();
    let page = 1;
    let pages = 1;
    do {
      const res = await policyAcceptancesApi.list({
        search,
        mode,
        page,
        limit: POLICY_JOURNAL_MAX_LIMIT,
      });
      for (const a of res.acceptances) if (!rows.has(a.id)) rows.set(a.id, a);
      pages = totalPages(res.total, POLICY_JOURNAL_MAX_LIMIT);
      page += 1;
    } while (page <= pages);
    return [...rows.values()];
  },

  /** One person's history, newest first (GET /users/:id/policy-acceptances). */
  userHistory: async (userId: string): Promise<UserPolicyAcceptances> => {
    const res = await apiClient.get<UserPolicyAcceptances>(
      `/v1/users/${encodeURIComponent(userId)}/policy-acceptances?limit=${POLICY_JOURNAL_MAX_LIMIT}`
    );
    return {
      user_id: res?.user_id ?? userId,
      acceptances: Array.isArray(res?.acceptances) ? res.acceptances : [],
      count: res?.count ?? 0,
    };
  },
};
