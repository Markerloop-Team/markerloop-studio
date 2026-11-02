// The cross-tab half of the single refresh point (SDL-613 S6a).
//
// auth-service rotates the refresh token on every use and treats a second use
// of a rotated token as reuse: it kills the whole family, i.e. every tab and
// device of that sign-in. Two tabs that notice an expired access token at the
// same moment and both refresh therefore log the person out. An in-memory
// promise stops that inside one tab; across tabs it takes a Web Lock — held
// by one tab at a time for the whole origin, released when the callback
// settles or the tab goes away.
//
// Where Web Locks are missing (an insecure context, a very old browser) the
// callback just runs: the in-tab promise still holds, the cross-tab guarantee
// does not.

export const REFRESH_LOCK_NAME = "markerloop:auth-refresh";

type LockRequester = {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
};

function lockManager(): LockRequester | undefined {
  if (typeof navigator === "undefined") return undefined;
  const locks = (navigator as { locks?: LockRequester }).locks;
  return locks && typeof locks.request === "function" ? locks : undefined;
}

/** Run `task` while holding the origin-wide refresh lock. */
export function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  if (!locks) return task();
  return locks.request(REFRESH_LOCK_NAME, { mode: "exclusive" }, task);
}
