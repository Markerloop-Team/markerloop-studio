// "Hide" of the product announcement (SDL-744) — remembered in THIS browser
// only (localStorage), under a key that carries the hash of the text: a new
// announcement has a new key and shows again.
//
// Every storage access is wrapped: a private window, blocked site data or a
// full quota throws on the accessor itself, and the announcement must then
// still show (and "Hide" still hide it for this page view), never crash the
// shell.

export type NoticeStorage = Pick<Storage, "getItem" | "setItem">;

const KEY_PREFIX = "markerloop:product-notice:hidden:";

export function productNoticeDismissKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/** window.localStorage, or null where it is absent or the accessor throws. */
export function browserNoticeStorage(): NoticeStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isProductNoticeDismissed(storage: NoticeStorage | null, id: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(productNoticeDismissKey(id)) !== null;
  } catch {
    return false;
  }
}

/** Returns whether the choice was stored (false = it lasts this page view only). */
export function dismissProductNotice(storage: NoticeStorage | null, id: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(productNoticeDismissKey(id), new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}
