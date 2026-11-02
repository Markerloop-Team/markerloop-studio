// Where the Google sign-in comes back to (SDL-615 S9).
//
// Google's round trip leaves the app entirely: the callback page is a fresh
// load of /auth/google/callback with only `code` and `state` — whatever
// `?redirect=` the login page had is gone. Until S9 the callback always went
// to PRODUCT_HOME, so a person who opened an invite link, pressed «Sign in»
// and chose Google landed on the dashboard and lost the invite. The target is
// parked in sessionStorage (same tab, survives the round trip) right before
// leaving, and taken — once — by the callback.

import { PRODUCT_HOME, safeRedirect } from "@/shared/config/product-routes";

export const OAUTH_REDIRECT_KEY = "ml.oauth.redirect";

type Storage2 = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rememberOAuthRedirect(storage: Storage2, target: string): void {
  try {
    storage.setItem(OAUTH_REDIRECT_KEY, safeRedirect(target, PRODUCT_HOME));
  } catch {
    // Storage off: the callback falls back to PRODUCT_HOME.
  }
}

/**
 * The address the callback navigates to. Read once and removed, and passed
 * through `safeRedirect` again: sessionStorage is same-origin, but a value
 * that became a navigation target is checked where it is used.
 */
export function takeOAuthRedirect(storage: Storage2): string {
  let value: string | null = null;
  try {
    value = storage.getItem(OAUTH_REDIRECT_KEY);
    storage.removeItem(OAUTH_REDIRECT_KEY);
  } catch {
    value = null;
  }
  return safeRedirect(value, PRODUCT_HOME);
}
