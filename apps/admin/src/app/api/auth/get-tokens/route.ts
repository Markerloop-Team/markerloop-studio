import { NextRequest, NextResponse } from "next/server";
import { readSessionPair } from "@/shared/lib/session-cookies";

/**
 * The access token for the browser's Authorization header, and whether a
 * refresh token exists.
 *
 * The refresh token itself never leaves the server (SDL-613 S6a): the only
 * thing that uses it is the BFF refresh (`/api/auth/refresh`) and the logout
 * (`/api/auth/logout`), both of which read the cookie here on the server.
 * `has_refresh` is what lets a tab with no access cookie ask for a refresh
 * instead of treating itself as a guest.
 */
export async function GET(request: NextRequest) {
  try {
    const { access, refresh } = readSessionPair(request.cookies);

    return NextResponse.json(
      {
        access_token: access || null,
        has_refresh: Boolean(refresh),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to get tokens" },
      { status: 500 }
    );
  }
}
