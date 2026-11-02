// Pure rules of the OAuth consent screen (SDL-693). Kept free of React and
// the network so `smoke:oauth-consent` runs every branch.

import { isGatewayRouteMissing } from "@/shared/lib/api/client";

export type WorkspaceRole = "owner" | "member";

export interface ConsentWorkspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

/**
 * The person's workspaces with their role. auth-service knows two roles
 * (go-sdk `wsaccess`: owner, member) and the owner is `owner_user_id`, so the
 * list needs no per-workspace members call. Owned workspaces first, then by
 * name — the order a person scans for "mine".
 */
export function consentWorkspaces(
  workspaces: ReadonlyArray<{ id: string; name: string; owner_user_id: string }>,
  userId: string | null | undefined
): ConsentWorkspace[] {
  return workspaces
    .map((w) => ({
      id: w.id,
      name: w.name,
      role: (userId && w.owner_user_id === userId ? "owner" : "member") as WorkspaceRole,
    }))
    .sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1
    );
}

/** The workspace preselected on open: only when there is exactly one. */
export function initialWorkspace(list: readonly ConsentWorkspace[]): string | null {
  return list.length === 1 ? list[0].id : null;
}

export type ConsentErrorKind =
  | "expired"
  | "decided"
  | "signed-out"
  | "not-member"
  | "unavailable"
  | "redirect-mismatch"
  | "failed";

function field(error: unknown, name: "status" | "code" | "data"): unknown {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

function errorCode(error: unknown): unknown {
  const code = field(error, "code");
  if (typeof code === "string" && code) return code;
  const data = field(error, "data");
  return typeof data === "object" && data !== null
    ? (data as { error?: unknown }).error
    : undefined;
}

/** Any failed consent call → what the screen says about it. */
export function consentErrorKind(error: unknown): ConsentErrorKind {
  const status = field(error, "status");
  const code = errorCode(error);
  // A bare gateway 404 (no such route on this contour) is not "the request
  // expired": auth-service's own 404 carries a JSON envelope.
  if (isGatewayRouteMissing(error)) return "unavailable";
  if (status === 404) return "expired";
  if (status === 409) return "decided";
  if (status === 401) return "signed-out";
  if (status === 403 || code === "not_a_member") return "not-member";
  if (status === 503) return "unavailable";
  return "failed";
}

/**
 * Whether the screen may stay after this error: the request is still open
 * (auth-service keeps it on 403/503 and on a network failure), so the person
 * can pick another workspace or retry. Expired and decided are final.
 */
export function isFinalConsentError(kind: ConsentErrorKind): boolean {
  return kind === "expired" || kind === "decided";
}

export interface DisplayHost {
  /**
   * What the screen prints: the host in ASCII (punycode for an IDN). null —
   * the string is not a bare host (a path, query, fragment or userinfo rides
   * in it, or it does not parse): it is never printed, since
   * `evil.com/claude.ai` or `a@claude.ai` reads as a name it does not go to.
   */
  ascii: string | null;
  /**
   * The host is an international domain (punycode, non-ASCII or
   * percent-encoded letters) or could not be parsed: it may imitate another
   * site letter for letter (`clаude.ai` with a Cyrillic "а" is
   * `xn--clude-5ve.ai`), so the screen warns.
   */
  lookalike: boolean;
}

function isBareHost(url: URL): boolean {
  return url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
}

/** `shownHost` is exactly what displayHost prints for itself — nothing smuggled. */
function isNormalizedHost(shownHost: string): boolean {
  try {
    const url = new URL(`https://${shownHost}`);
    return isBareHost(url) && url.host === shownHost;
  } catch {
    return false;
  }
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

/**
 * The redirect host as the browser will resolve it. auth-service sends
 * `url.Host` of the registered redirect_uri as is, and dynamic registration
 * accepts a non-ASCII host, so the raw string is never printed: a lookalike
 * would read as the real name.
 */
export function displayHost(raw: string): DisplayHost {
  let url: URL;
  try {
    url = new URL(`https://${raw}`);
  } catch {
    return { ascii: null, lookalike: true };
  }
  if (!isBareHost(url)) return { ascii: null, lookalike: true };
  const ascii = url.host;
  const lookalike =
    url.hostname.includes("xn--") ||
    url.hostname !== stripPort(raw).toLowerCase();
  return { ascii, lookalike };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Where the browser goes after a decision, or null — then it does not go.
 * Mirrors auth-service's redirect_uri rule (https, or http only to a
 * loopback host), and the target's host must be the very host the screen
 * showed (both in ASCII, the port compared under the target's scheme): the
 * person agreed to send access THERE, not wherever the answer points.
 */
export function decisionTarget(redirectTo: unknown, shownHost: string | null): string | null {
  if (typeof redirectTo !== "string" || redirectTo.trim() === "") return null;
  // Only a host displayHost could print: a "host" with a path, query,
  // fragment or userinfo would be re-parsed below into another host.
  if (!shownHost || !isNormalizedHost(shownHost)) return null;
  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    return null;
  }
  if (url.protocol === "http:") {
    if (!LOOPBACK.has(url.hostname)) return null;
  } else if (url.protocol !== "https:") {
    return null;
  }
  let expected: URL;
  try {
    expected = new URL(`${url.protocol}//${shownHost}`);
  } catch {
    return null;
  }
  if (expected.host !== url.host) return null;
  return url.toString();
}

/** `request_id` from the consent address; null when missing or blank. */
export function consentRequestId(search: string): string | null {
  const id = new URLSearchParams(search).get("request_id");
  return id && id.trim() ? id.trim() : null;
}
