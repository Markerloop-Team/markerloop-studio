import { NextRequest, NextResponse } from "next/server";
import {
  expireCookie,
  hostPrefixEnabled,
  legacySessionCookieName,
  sessionCookieName,
  sessionCookieOptions,
  sessionMaxAge,
} from "@/shared/lib/session-cookies";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // expires_in / refresh_expires_in: what auth-service said about these
    // tokens (SDL-613 S6a). Absent (older callers, e2e setup) → the JWT exp.
    const { access_token, refresh_token, expires_in, refresh_expires_in } = body;

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: "Missing tokens" },
        { status: 400 }
      );
    }

    const response = NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );

    // httpOnly, `__Host-` in production: Secure, Path=/, no Domain (SDL-680).
    response.cookies.set(
      sessionCookieName("access"),
      access_token,
      sessionCookieOptions("access", sessionMaxAge("access", expires_in, access_token))
    );
    response.cookies.set(
      sessionCookieName("refresh"),
      refresh_token,
      sessionCookieOptions("refresh", sessionMaxAge("refresh", refresh_expires_in, refresh_token))
    );

    // A fresh sign-in replaces a pre-SDL-680 session: drop its old names so the
    // readers' fallback cannot pick a stale token.
    if (hostPrefixEnabled()) {
      expireCookie(response.cookies, legacySessionCookieName("access"), "access");
      expireCookie(response.cookies, legacySessionCookieName("refresh"), "refresh");
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set tokens" },
      { status: 500 }
    );
  }
}
