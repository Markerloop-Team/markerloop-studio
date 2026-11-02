import { NextRequest, NextResponse } from "next/server";
import {
  expireSession,
  readSessionPair,
  writeSessionPair,
} from "@/shared/lib/session-cookies";
import {
  AUTH_UPSTREAM_TIMEOUT_MS,
  authUpstream,
  authUpstreamHeaders,
  unwrapEnvelope,
} from "@/shared/lib/api/auth-upstream";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The BFF refresh (SDL-613 S6a) — the only place the admin rotates a session.
 *
 * The refresh token stays in its httpOnly cookie: this handler reads it, asks
 * auth-service for a new pair, and writes both cookies with the lifetimes
 * auth-service reported. The browser gets only the new access token (it goes
 * into the Authorization header anyway).
 *
 * Browser-side there is exactly one caller, `authService.refreshAccessToken`,
 * which holds a Web Lock across tabs: auth-service treats a second use of a
 * rotated refresh token as reuse and kills the whole family, so two tabs
 * refreshing at once would log the person out everywhere.
 *
 * Answers: 200 `{access_token, expires_in}`; 401 — no session, or auth-service
 * refused the token (the cookies are expired: the session is over); 429 —
 * rate limited (cookies untouched); 502 — auth-service unreachable or broken
 * (cookies untouched: a transient failure must not log anyone out).
 */
export async function POST(request: NextRequest) {
  const { refresh } = readSessionPair(request.cookies);
  if (!refresh) {
    return NextResponse.json({ error: "no_session" }, { status: 401, headers: NO_STORE });
  }

  const upstream = authUpstream(request, "/v1/auth/refresh");
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream.url, {
      method: "POST",
      headers: authUpstreamHeaders(request, upstream),
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ error: "auth_unreachable" }, { status: 502, headers: NO_STORE });
  }

  if (upstreamResponse.status === 401) {
    const response = NextResponse.json({ error: "session_expired" }, { status: 401, headers: NO_STORE });
    expireSession(response.cookies);
    return response;
  }

  if (upstreamResponse.status === 429) {
    const retryAfter = upstreamResponse.headers.get("retry-after");
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, ...(retryAfter ? { "Retry-After": retryAfter } : {}) } }
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = unwrapEnvelope(await upstreamResponse.json());
  } catch {
    // falls through to the shape check below
  }
  const access = data.access_token;
  const nextRefresh = data.refresh_token;
  if (!upstreamResponse.ok || typeof access !== "string" || !access || typeof nextRefresh !== "string" || !nextRefresh) {
    return NextResponse.json(
      { error: "auth_failed", status: upstreamResponse.status },
      { status: 502, headers: NO_STORE }
    );
  }

  const response = NextResponse.json(
    { access_token: access, expires_in: data.expires_in ?? null },
    { status: 200, headers: NO_STORE }
  );
  writeSessionPair(response.cookies, {
    access,
    refresh: nextRefresh,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  });
  return response;
}
