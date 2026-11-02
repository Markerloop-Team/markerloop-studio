import { NextResponse } from "next/server";
import {
  expireCookie,
  hostPrefixEnabled,
  legacySessionCookieName,
  sessionCookieName,
} from "@/shared/lib/session-cookies";

export async function POST() {
  const response = NextResponse.json({ success: true });

  // Очищаем cookies. `__Host-` куку браузер удалит только Set-Cookie'ем с
  // Secure и Path=/ — поэтому expireCookie, а не cookies.delete (SDL-680).
  expireCookie(response.cookies, sessionCookieName("access"), "access");
  expireCookie(response.cookies, sessionCookieName("refresh"), "refresh");
  if (hostPrefixEnabled()) {
    expireCookie(response.cookies, legacySessionCookieName("access"), "access");
    expireCookie(response.cookies, legacySessionCookieName("refresh"), "refresh");
  }

  return response;
}
