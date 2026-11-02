/**
 * A file URL the browser can load from anywhere (SDL-624).
 *
 * files-service answers `url` in two shapes: a signed absolute URL for a
 * private file, and the stable relative `/files/<id>` for a public one. The
 * relative one resolves against whatever host the page lives on — on the
 * admin that is the protected /files section, not the delivery ingress — so
 * the host is prepended here, and only to a path that starts with a single
 * `/`. Anything else (an absolute URL, a protocol-relative `//host`, an
 * empty base) is returned as is.
 */
export function absoluteFileUrl(url: string, deliveryBase: string | null | undefined): string {
  const base = (deliveryBase ?? "").trim().replace(/\/+$/, "");
  if (!base) return url;
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  return `${base}${url}`;
}

/**
 * The delivery host as the product shell hands it down (SDL-624 review):
 * trimmed, without a trailing `/`, and only when it is an absolute http(s)
 * origin — anything else (`api.markerloop.com` without a scheme, a typo)
 * becomes "", so no consumer can prefix `/files/<id>` with it and put a
 * relative or scheme-less address into <img src>. With "" a public file is
 * simply not previewed.
 */
export function deliveryBaseFrom(raw: string | null | undefined): string {
  const base = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+/i.test(base) ? base : "";
}

/**
 * Whether a resolved file URL can go into <img src> / window.open as is: an
 * absolute http(s) address. A relative `/files/<id>` is not — on the admin
 * host it lands in the protected /files section (307), which is how public
 * images stayed blank outside the pages section until 29 Sep 2026 (SDL-624).
 */
export function isDeliverableFileUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
