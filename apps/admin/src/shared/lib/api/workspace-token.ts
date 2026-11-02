// Workspace tokens of THIS tab (SDL-613 S6b).
//
// The session token (login/refresh, no `wsid`) is exchanged at
// POST /v1/auth/token/workspace {workspace_id} for a short token of ONE
// workspace (`wsid`, `wsr`, 15 min at most, never longer than the session).
// The gateway takes the scope from that token: a `wsid` other than the
// request's `workspace_id` → 403, a revoked member → 401 at once.
//
// The map lives in module memory, so it is per tab by construction: two tabs
// open on two workspaces never overwrite each other (a shared cookie would).
// Every pages/files call names its workspace, and the token is picked by that
// name — not by whatever workspace the tab looked at last.
//
// One exchange per workspace at a time (callers join the one in flight). The
// exchange itself is an ordinary session call, so it goes through the single
// refresh point of S6a — this module never refreshes on its own.

import { decodeJwt } from "jose";
import { toApiError } from "../error-handler";

/** What POST /v1/auth/token/workspace answers (auth-service WorkspaceTokenResponse). */
export interface WorkspaceTokenResponse {
  access_token: string;
  expires_in?: number;
  workspace_id?: string;
  workspace_role?: string;
}

export type WorkspaceTokenExchange = (workspaceId: string) => Promise<WorkspaceTokenResponse>;

/** A cached token is re-exchanged this long before it expires. */
export const WORKSPACE_TOKEN_BUFFER_MS = 60 * 1000;

interface Entry {
  token: string;
  expiresAt: number;
}

/**
 * Expiry of a token in ms on THIS clock: `expires_in` counted from the moment
 * the answer arrived. The `exp` claim is the server's clock — a browser clock
 * that runs fast or slow would keep a dead token or drop a live one — so it is
 * only the fallback when the answer carries no lifetime.
 */
function expiryOf(res: WorkspaceTokenResponse, now: number): number {
  if (typeof res.expires_in === "number" && res.expires_in > 0) return now + res.expires_in * 1000;
  try {
    const exp = decodeJwt(res.access_token).exp;
    if (typeof exp === "number") return exp * 1000;
  } catch {
    // not a JWT we can read: treat as already expired, the next call exchanges
  }
  return now;
}

export class WorkspaceTokenStore {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<string>>();
  /** Bumped by clear(): an exchange started before it must not land after it. */
  private generation = 0;

  constructor(
    private readonly exchange: WorkspaceTokenExchange,
    private readonly now: () => number = Date.now
  ) {}

  /** The tab's token for `workspaceId`, exchanged when missing or about to expire. */
  async get(workspaceId: string): Promise<string> {
    const cached = this.entries.get(workspaceId);
    if (cached && cached.expiresAt - this.now() > WORKSPACE_TOKEN_BUFFER_MS) {
      return cached.token;
    }
    const pending = this.inFlight.get(workspaceId);
    if (pending) return pending;

    const generation = this.generation;
    const run = (async () => {
      const res = await this.exchange(workspaceId);
      if (!res || typeof res.access_token !== "string" || !res.access_token) {
        // The same error shape every apiClient caller already handles.
        throw toApiError(new Error("Workspace token exchange answered without a token"));
      }
      if (generation === this.generation) {
        this.entries.set(workspaceId, { token: res.access_token, expiresAt: expiryOf(res, this.now()) });
      }
      return res.access_token;
    })();
    this.inFlight.set(workspaceId, run);
    try {
      return await run;
    } finally {
      if (this.inFlight.get(workspaceId) === run) this.inFlight.delete(workspaceId);
    }
  }

  /**
   * Forget the token the server refused (revoked, wrong `wsid`). Only the one
   * that was sent: a newer token another call already fetched stays.
   */
  invalidate(workspaceId: string, token: string | null): void {
    const cached = this.entries.get(workspaceId);
    if (cached && (token === null || cached.token === token)) {
      this.entries.delete(workspaceId);
    }
  }

  /** Sign-out / another user: no workspace token of the old session survives. */
  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }
}
