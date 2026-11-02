import { NextRequest, NextResponse } from "next/server";
import { expireSession, readSessionPair } from "@/shared/lib/session-cookies";
import {
  AUTH_UPSTREAM_TIMEOUT_MS,
  authUpstream,
  authUpstreamHeaders,
} from "@/shared/lib/api/auth-upstream";

/**
 * Sign out (SDL-613 S6a): ask auth-service to kill the refresh token's family
 * (`POST /v1/auth/logout`, S5) and expire the session cookies.
 *
 * The refresh token lives in an httpOnly cookie the browser cannot read, so
 * the call has to be made from here. The cookies are expired whatever
 * auth-service answers — a person who pressed "Sign out" is signed out of
 * this browser even when the revocation did not go through; `revoked` says
 * whether it did.
 */
export async function POST(request: NextRequest) {
  const { refresh } = readSessionPair(request.cookies);

  let revoked = false;
  if (refresh) {
    const upstream = authUpstream(request, "/v1/auth/logout");
    try {
      const res = await fetch(upstream.url, {
        method: "POST",
        headers: authUpstreamHeaders(request, upstream),
        body: JSON.stringify({ refresh_token: refresh }),
        cache: "no-store",
        signal: AbortSignal.timeout(AUTH_UPSTREAM_TIMEOUT_MS),
      });
      revoked = res.ok;
    } catch {
      revoked = false;
    }
  }

  const response = NextResponse.json(
    { success: true, revoked },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
  expireSession(response.cookies);
  return response;
}
