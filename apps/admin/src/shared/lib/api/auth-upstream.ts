// Server side of the session (SDL-613 S6a): how the admin's own route handlers
// reach auth-service when they act for the browser — the BFF refresh
// (`/api/auth/refresh`) and the logout (`/api/auth/logout`).
//
// Server only: it reads SERVICE_KEY. Never import it from a client module.
//
// Where to: `API_INTERNAL_URL` (runtime env, the gateway inside the cluster —
// dev-infra apps/markerloop-app/base/configmap.yaml) → an absolute
// `NEXT_PUBLIC_API_URL` (local dev against a remote API, self-host compose) →
// this request's own origin + the relative base, i.e. through the ingress like
// the browser would. The request's host is what the ingress routed on, so the
// last fallback cannot be pointed elsewhere from outside; it still never
// carries the service key.
//
// Whose IP: auth-service counts its refresh/logout limits per client IP. A
// call from this server would otherwise be one IP for every user. The real one
// goes along twice: `X-Forwarded-For` (what the gateway and auth read today)
// and, when SERVICE_KEY is set and the call goes to API_INTERNAL_URL,
// `X-Client-IP` + `X-Service-Key` — the pair auth-service trusts
// (auth-service internal/handlers/auth_handler.go, ClientIPHeader, S5).

import type { NextRequest } from "next/server";
import { getApiBaseUrl } from "./base-url";
import { BASE_PATH, DEMO_MODE } from "@/demo/config";

/** auth-service reads this only together with a valid X-Service-Key. */
export const CLIENT_IP_HEADER = "X-Client-IP";
export const SERVICE_KEY_HEADER = "X-Service-Key";

/** How long a route handler waits for auth-service before answering 502. */
export const AUTH_UPSTREAM_TIMEOUT_MS = 10_000;

type Upstream = { url: string; internal: boolean };

function join(base: string, endpoint: string): string {
  return `${base.replace(/\/+$/, "")}${endpoint}`;
}

/**
 * The URL of a gateway endpoint as seen from this server, for a request that
 * arrived on `origin` (host + scheme). Also used by server components, which
 * have the request headers but no NextRequest (SDL-759).
 */
export function gatewayUpstream(endpoint: string, origin: { host: string; proto: string }): Upstream {
  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) return { url: join(internal, endpoint), internal: true };

  // Showcase: the mock gateway lives in this very process (app/api/v1). Call
  // it over loopback rather than through the public host and proxy.
  if (DEMO_MODE) {
    const port = process.env.PORT || "3000";
    return { url: join(`http://127.0.0.1:${port}${BASE_PATH}/api`, endpoint), internal: false };
  }

  const base = getApiBaseUrl();
  if (/^https?:\/\//i.test(base)) return { url: join(base, endpoint), internal: false };

  return { url: join(`${origin.proto}://${origin.host}${base}`, endpoint), internal: false };
}

/** The URL of a gateway endpoint (`/v1/auth/refresh`) as seen from this server. */
export function authUpstream(request: NextRequest, endpoint: string): Upstream {
  const host = request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(/:$/, "");
  return gatewayUpstream(endpoint, { host, proto });
}

const IP_SHAPE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The browser's IP as the ingress saw it: `X-Real-IP` (the ingress overwrites
 * it with the peer address), else the first `X-Forwarded-For` hop. Undefined
 * when neither looks like an address — local dev without a proxy.
 */
export function clientIpOf(request: { headers: Pick<Headers, "get"> }): string | undefined {
  const candidates = [
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && IP_SHAPE.test(ip)) return ip;
  }
  return undefined;
}

/** Headers for a call to auth-service on behalf of this request's browser. */
export function authUpstreamHeaders(request: NextRequest, upstream: Upstream): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const language = request.headers.get("accept-language");
  if (language) headers["Accept-Language"] = language;

  const ip = clientIpOf(request);
  if (ip) {
    headers["X-Forwarded-For"] = ip;
    const key = process.env.SERVICE_KEY?.trim();
    if (key && upstream.internal) {
      headers[SERVICE_KEY_HEADER] = key;
      headers[CLIENT_IP_HEADER] = ip;
    }
  }
  return headers;
}

/** The `data` of the gateway's `{success, data}` envelope, or the body itself. */
export function unwrapEnvelope(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if ("success" in record && record.data && typeof record.data === "object") {
      return record.data as Record<string, unknown>;
    }
    return record;
  }
  return {};
}
