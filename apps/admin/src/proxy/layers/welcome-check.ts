import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { type MiddlewareContext } from "../types";
import { isWorkspaceSection } from "@/shared/config/product-routes";
import {
  WELCOME_CHECK_HEADER,
  skipCookieMatches,
  welcomeSkipCookieName,
} from "@/shared/lib/welcome-skip";

export { WELCOME_CHECK_HEADER };

/*
 * «No workspace → /welcome» on the server (SDL-759 re-open, owner acceptance
 * 16 Oct 2026). The client hook it replaces waited for the workspace list in
 * the browser, so a new account saw the dashboard for a second or two and was
 * then thrown onto /welcome.
 *
 * The proxy stays synchronous (every layer and six smokes call it so), so it
 * only DECIDES whether the request needs the check and says so in a request
 * header; the root layout (`app/layout.tsx`, a server component)
 * reads the header, asks the gateway for the list with the session cookie and
 * redirects before any HTML of the section is sent — a 307 to /welcome.
 *
 * Checked only for a full page load (`Sec-Fetch-Dest: document`): login,
 * registration, the Google callback and a typed address all arrive that way.
 * A client-side navigation inside the shell is not checked — the sections
 * draw the no-workspace state in place (the dashboard: the welcome form), so
 * there is nothing to jump from. Without an access cookie (only a refresh
 * one) the page refreshes in the browser and is not checked either.
 */

function userIdOf(token: string): string | null {
  try {
    const payload = decodeJwt(token) as { user_id?: unknown; sub?: unknown };
    if (typeof payload.user_id === "string") return payload.user_id;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function needsWelcomeCheck(request: NextRequest, context: MiddlewareContext): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("sec-fetch-dest") !== "document") return false;
  if (!context.accessToken) return false;
  if (!isWorkspaceSection(context.pathname)) return false;
  const skipped = request.cookies.get(welcomeSkipCookieName())?.value;
  return !skipCookieMatches(skipped, userIdOf(context.accessToken));
}

/**
 * Request headers for the page with the check's answer, or null when nothing
 * is to be set. A header the browser sent itself is always overwritten.
 */
export function welcomeCheckHeaders(request: NextRequest, context: MiddlewareContext): Headers | null {
  const check = needsWelcomeCheck(request, context);
  if (!check && !request.headers.has(WELCOME_CHECK_HEADER)) return null;
  const headers = new Headers(request.headers);
  if (check) headers.set(WELCOME_CHECK_HEADER, "1");
  else headers.delete(WELCOME_CHECK_HEADER);
  return headers;
}
