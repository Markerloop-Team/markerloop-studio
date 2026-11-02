// Server half of «no workspace → /welcome» (SDL-759 re-open). Server only:
// it reads the request's cookies and headers through next/headers.
//
// The proxy marks a full page load of a workspace section with
// WELCOME_CHECK_HEADER (src/proxy/layers/welcome-check.ts); the root layout
// (app/layout.tsx) calls `redirectToWelcomeIfNoWorkspace()` before it renders
// anything. One
// GET /v1/workspaces with the session's access token, through the in-cluster
// gateway (API_INTERNAL_URL) like the BFF routes. Only a list that LOADED
// empty redirects: a timeout, a 401, a 5xx or a body that is not a list lets
// the page render, and the section then draws the no-workspace state in place
// — a gateway hiccup is not "you have nothing".

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { WELCOME_PATH } from "@/shared/config/product-routes";
import { readSessionPair } from "@/shared/lib/session-cookies";
import { WELCOME_CHECK_HEADER } from "@/shared/lib/welcome-skip";
import { clientIpOf, gatewayUpstream } from "./auth-upstream";

/** The page waits at most this long for the list before rendering anyway. */
export const WELCOME_CHECK_TIMEOUT_MS = 2_000;

/** How many workspaces the gateway lists for this token; null = unknown. */
export async function listedWorkspaceCount(
  accessToken: string,
  requestHeaders: Pick<Headers, "get">,
  fetchImpl: typeof fetch = fetch
): Promise<number | null> {
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost";
  const proto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const upstream = gatewayUpstream("/v1/workspaces", { host, proto });
  const outgoing: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  const language = requestHeaders.get("accept-language");
  if (language) outgoing["Accept-Language"] = language;
  const ip = clientIpOf({ headers: requestHeaders });
  if (ip) outgoing["X-Forwarded-For"] = ip;

  try {
    const response = await fetchImpl(upstream.url, {
      headers: outgoing,
      cache: "no-store",
      signal: AbortSignal.timeout(WELCOME_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (Array.isArray(body)) return body.length;
    const data = body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

/** Redirects (307 on a page load) when the marked request's account has no workspace. */
export async function redirectToWelcomeIfNoWorkspace(): Promise<void> {
  const requestHeaders = await headers();
  if (requestHeaders.get(WELCOME_CHECK_HEADER) !== "1") return;
  const { access } = readSessionPair(await cookies());
  if (!access) return;
  const count = await listedWorkspaceCount(access, requestHeaders);
  if (count === 0) redirect(WELCOME_PATH);
}
