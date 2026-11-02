// Invite token handling on the client (SDL-615 S9).
//
// The invite link is `…/invite#token=mli_…`: the token rides in the URL
// fragment, which the browser never puts on the request line, so it does not
// reach access logs or the Referer of the next request. It still sits in
// `location.href` while the page lives — every analytics hit, error report
// and copied address would carry it. So the page takes it out of the address
// on its very first client frame and keeps it in `sessionStorage` instead:
// the same tab still has it after a detour through sign-in, sign-up or the
// Google round trip, and closing the tab forgets it.
//
// Pure functions over a narrow environment, so smoke/invite.tsx runs them
// under node without a DOM.

export const INVITE_TOKEN_KEY = "ml.invite.token";

/** Where the page lives; also the redirect target after sign-in. */
export const INVITE_PATH = "/invite";

export interface InviteTokenEnv {
  location: { hash: string; pathname: string; search: string };
  history: { replaceState(data: unknown, unused: string, url: string): void };
  sessionStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

/** `#token=abc` / `#foo=1&token=abc` → `abc`; anything else → null. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const value = new URLSearchParams(raw).get("token");
  return value && value.trim() ? value.trim() : null;
}

/**
 * Reads the token from the fragment, removes the fragment from the address
 * (history.replaceState — no navigation, no new history entry) and parks the
 * token in sessionStorage. Without a fragment token, returns the parked one:
 * that is the way back from /login?redirect=/invite.
 */
export function consumeInviteToken(env: InviteTokenEnv): string | null {
  const fromHash = tokenFromHash(env.location.hash);
  if (fromHash) {
    env.history.replaceState(
      null,
      "",
      `${env.location.pathname}${env.location.search}`
    );
    try {
      env.sessionStorage.setItem(INVITE_TOKEN_KEY, fromHash);
    } catch {
      // Storage off (private mode quota): the token lives in memory for this
      // page only; the address is clean either way.
    }
    return fromHash;
  }
  try {
    return env.sessionStorage.getItem(INVITE_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Forget the parked token: the invite is spent, dead, or accepted. */
export function forgetInviteToken(
  storage: Pick<Storage, "removeItem">
): void {
  try {
    storage.removeItem(INVITE_TOKEN_KEY);
  } catch {
    // nothing to forget
  }
}
