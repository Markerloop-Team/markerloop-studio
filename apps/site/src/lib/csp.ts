// Content-Security-Policy of the workspace site (SDL-685).
//
// The page is someone's content on a *.markerloop.com subdomain, so it gets
// the strictest policy the renderer survives: nothing by default, images from
// any https origin (files-service and external covers), scripts only from the
// site's own origin plus the per-request nonce Next puts on its inline
// hydration scripts (without the nonce `script-src 'self'` blocks the RSC
// payload pushes and the page never hydrates), fonts only from the site's own
// origin (the theme's whitelisted faces under /fonts, SDL-774 — never Google's
// servers), no framing, no forms.
//
// `connect-src` lists the platform API of the contour: `https://api.<base>`,
// where <base> is `SITES_BASE_DOMAIN` (runtime env). Unset — only 'self'.

export function siteApiOrigin(baseDomain: string | undefined): string | null {
  const base = (baseDomain ?? "").trim().replace(/^\.+|\.+$/g, "").toLowerCase();
  if (base === "" || !/^[a-z0-9.-]+$/.test(base)) return null;
  return `https://api.${base}`;
}

export function buildSiteCsp(nonce: string, baseDomain: string | undefined): string {
  const api = siteApiOrigin(baseDomain);
  return [
    "default-src 'none'",
    "img-src https: data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    api ? `connect-src 'self' ${api}` : "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}
