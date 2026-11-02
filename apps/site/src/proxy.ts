import { NextResponse, type NextRequest } from "next/server";
import { buildSiteCsp } from "@/lib/csp";

// The site's request layer (SDL-685), Next 16 `proxy` (formerly middleware).
//
// 1. Incoming `Cookie` is cut before any page code runs. The site is a
//    *.markerloop.com subdomain — the same site as the admin on the apex — so
//    the browser may send cookies scoped to the parent domain; nothing here
//    may read, log or forward them.
// 2. A fresh nonce per request goes into the CSP on both the request (Next
//    reads it there and stamps it on its inline hydration scripts) and the
//    response (the browser enforces it).
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildSiteCsp(nonce, process.env.SITES_BASE_DOMAIN);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("cookie");
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Static chunks carry no page and need no nonce.
  matcher: [{ source: "/((?!_next/static|_next/image).*)" }],
};
