// The public address of a published page (SDL-687, EP-113):
// `https://<workspace slug>.<base><path>` — the host the workspace site
// (apps/site) answers on. Owner decision 29 Sep 2026: the site of a workspace
// lives at <slug>.markerloop.com; the personal workspace's slug comes from the
// username (collections-service SDL-677).
//
// The base is a RUNTIME value of the contour, read from the pod env on the
// server (app/(product)/layout.tsx) for the same reason as the section flags in
// product-features.ts: test and prod run one image. It is the same variable
// and the same value the site itself is configured with
// (dev-infra apps/markerloop-site: `SITES_BASE_DOMAIN`, test
// `staging.example.com`). Absent or malformed = no address anywhere: an admin
// that does not know where the sites live must not print a link that leads
// nowhere.

/** Pod env var with the sites' base domain (no scheme, no slug). */
export const SITES_BASE_DOMAIN_ENV = "SITES_BASE_DOMAIN";

const DNS_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const BASE_RE = new RegExp(`^${DNS_LABEL}(?:\\.${DNS_LABEL})+$`);
const SLUG_RE = new RegExp(`^${DNS_LABEL}$`);

/**
 * Normalize the env value: trimmed, lower-cased, a trailing dot dropped. Only
 * a bare host of two or more DNS labels passes — a scheme, a port, a path or
 * a wildcard is a misconfiguration, read as "no base" (fail safe).
 */
export function sitesBaseDomainFrom(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  return BASE_RE.test(value) ? value : null;
}

export type SiteAddress = {
  /** What a link opens: `https://slug.base/path`. */
  url: string;
  /** What a person reads: the host and the path, no scheme (`slug.base/path`). */
  label: string;
};

/**
 * The address of one page on its workspace's site, or `null` when there is
 * none to show: no base on this contour, a workspace without a slug yet (a row
 * older than the column, not backfilled), or a path with a parameter
 * (`/courses/[slug]`) — that is a pattern, not a page anyone can open.
 */
export function siteAddress(
  slug: string | null | undefined,
  base: string | null | undefined,
  path: string
): SiteAddress | null {
  if (!slug || !base || !SLUG_RE.test(slug)) return null;
  if (!path.startsWith("/") || path.includes("[")) return null;
  const host = `${slug}.${base}`;
  // Per segment, mirroring apps/site routePath() (which decodes each segment):
  // encodeURI would leave "?" and "#" alone, and "/faq?x" would open "/faq".
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return {
    url: `https://${host}${encodedPath}`,
    label: path === "/" ? host : `${host}${path}`,
  };
}
