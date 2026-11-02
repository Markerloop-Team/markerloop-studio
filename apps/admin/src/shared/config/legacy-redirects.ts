// Old product addresses that moved, as `next.config.ts` redirects (308). A
// module of its own so smoke:shell-layout reads the very list Next serves.
// Next forwards the query string itself (?ws= survives every hop); redirects
// run before the proxy, so no session logic is involved.

export type LegacyRedirect = {
  source: string;
  destination: string;
  permanent: true;
  has?: Array<{ type: "query"; key: string; value: string }>;
};

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  // SDL-607: the product moved from /admin/* to the domain root. Order
  // matters: `/admin/:path*` also matches zero segments, so the bare `/admin`
  // entry must stay first.
  { source: "/admin", destination: "/dashboard", permanent: true },
  { source: "/admin/:path*", destination: "/:path*", permanent: true },
  // EP-157: the Blocks tab of /pages and its editor became the Components
  // section. A shared link to the tab, or to one Block, lands on the same
  // thing at its new address, workspace kept.
  {
    source: "/pages",
    has: [{ type: "query", key: "tab", value: "blocks" }],
    destination: "/components",
    permanent: true,
  },
  { source: "/pages/blocks", destination: "/components", permanent: true },
  { source: "/pages/blocks/:blockId", destination: "/components/:blockId", permanent: true },
  // EP-187 (layer 5): the site theme left the workspace settings for its own
  // full-screen editor. The old tab lands there, workspace kept.
  {
    source: "/settings/workspace",
    has: [{ type: "query", key: "tab", value: "theme" }],
    destination: "/theme",
    permanent: true,
  },
];

/**
 * Where a path + query lands after the redirects above, as Next applies them
 * (first match wins, query forwarded). For the smoke; never used at runtime.
 */
export function resolveLegacyRedirect(url: string): string | null {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  for (const r of LEGACY_REDIRECTS) {
    if (r.has && !r.has.every((h) => params.get(h.key) === h.value)) continue;
    const pattern = new RegExp(
      "^" +
        r.source
          .replace(/\/:([a-zA-Z]+)\*$/, "(?:/(?<$1>.*))?")
          .replace(/:([a-zA-Z]+)/g, "(?<$1>[^/]+)") +
        "$"
    );
    const m = pattern.exec(path);
    if (!m) continue;
    const groups = m.groups ?? {};
    const dest = r.destination.replace(/:([a-zA-Z]+)\*?/g, (_, k: string) => groups[k] ?? "").replace(/\/+$/, "") || "/";
    return query ? `${dest}?${query}` : dest;
  }
  return null;
}
