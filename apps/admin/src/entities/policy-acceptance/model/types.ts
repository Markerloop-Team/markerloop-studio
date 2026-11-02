// The policy acceptance journal of user-service (SDL-752). Field names are
// exactly the service's JSON — see user-service MR !37 for the contract.

/** One row of GET /v1/policy-acceptances — the journal across people. */
export type PolicyAcceptance = {
  id: string;
  user_id: string;
  /** null — the person signed in through Telegram and has no email. */
  email: string | null;
  username: string;
  /** The person's latest accepted edition (users.policy_accepted_version). */
  current_version: string | null;
  /** The edition this row accepts, YYYY-MM-DD. */
  version: string;
  /** RFC 3339; rendered in UTC. */
  accepted_at: string;
  /** null on backfilled rows (accepted before the journal existed). */
  ip: string | null;
  user_agent: string | null;
  source: "accept" | "backfill" | (string & {});
};

export type PolicyJournalPage = {
  acceptances: PolicyAcceptance[];
  count: number;
  total: number;
  page: number;
  limit: number;
};

/** GET /v1/policy-acceptances/summary — counted by users.policy_accepted_version. */
export type PolicyEditionSummary = {
  /** Newest first; [] when nobody accepted anything. */
  editions: { version: string; users: number }[];
  never_accepted: number;
  total_users: number;
};

/**
 * The two edition modes exclude each other (the service answers 400 to both):
 * - edition: every acceptance of edition X, whoever moved on later;
 * - current: people whose latest accepted edition is X, with their whole history.
 */
export type PolicyJournalMode =
  | { kind: "all" }
  | { kind: "edition"; version: string }
  | { kind: "current"; version: string };

export type PolicyJournalQuery = {
  search: string;
  mode: PolicyJournalMode;
  page: number;
  limit: number;
};

/** A row of GET /v1/users/:id/policy-acceptances (no email/username there). */
export type UserPolicyAcceptance = Omit<
  PolicyAcceptance,
  "email" | "username" | "current_version"
>;

export type UserPolicyAcceptances = {
  user_id: string;
  acceptances: UserPolicyAcceptance[];
  count: number;
};

/** The service's ceiling for one page (models.PolicyAcceptancesMaxLimit). */
export const POLICY_JOURNAL_MAX_LIMIT = 200;
