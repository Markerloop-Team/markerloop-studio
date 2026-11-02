import { headers } from "next/headers";

/**
 * The site's address is the request Host — the ingress passes the visitor's
 * Host through. `X-Forwarded-Host` is deliberately not read: the Host decides
 * which workspace answers, and that header is whatever the client wrote.
 * pages-service normalises case, port and a trailing dot itself.
 */
export async function requestHost(): Promise<string> {
  const h = await headers();
  return h.get("host") ?? "";
}
