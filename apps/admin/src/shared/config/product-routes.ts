/**
 * Product routes at the domain root (SDL-607).
 *
 * Until SDL-607 every product screen lived under `/admin/*`. The product now
 * answers at the domain root (`/collections`, `/pages`, `/users`, ...), while
 * `/` itself belongs to the marketing landing on prod (the ingress sends it
 * there). The screens sit in the `app/(product)` route group: the group adds
 * no URL segment and scopes the product shell (sidebar, header, auth guard)
 * to exactly these sections.
 *
 * Old `/admin/*` links keep working through the 308s in `next.config.ts`.
 *
 * This module is imported by the edge proxy, so it must stay free of React,
 * browser APIs and anything else that is not plain TypeScript.
 */

/**
 * Top-level segments of `app/(product)`. The proxy protects exactly these
 * (every unlisted path is public), so a new section that is missing here
 * would render to anonymous visitors until the client-side guard kicked in.
 * `smoke/sidebar-active.tsx` fails when this list and the directory drift.
 */
export const PRODUCT_SECTIONS = [
  "dashboard",
  "collections",
  "pages",
  // The Components section (EP-157): the Blocks tab of /pages until then.
  "components",
  // The site theme editor (EP-187, layer 5): /theme, full-screen in the
  // editor frame; it was the ?tab=theme of the workspace settings.
  "theme",
  "files",
  "users",
  "roles",
  "permissions",
  "dictionary",
  // The journal of rule acceptances (SDL-752), Admin tools.
  "policy-acceptances",
  "notifications",
  "telegram-bot",
  // Workspace settings (SDL-615): /settings/workspace — the sidebar's
  // Members, Plan and Theme items (EP-157).
  "settings",
  // The first workspace (SDL-759): /welcome, where an account without a
  // workspace is sent; drawn without the rail.
  "welcome",
] as const;

/**
 * Signed-in pages OUTSIDE the product shell (SDL-693): no sidebar, the auth
 * frame instead, but a guest is sent to /login with the whole address in
 * `?redirect=` by the proxy exactly like a product section. `/oauth/consent`
 * is where auth-service sends the browser of an MCP agent's authorization
 * (OAUTH_CONSENT_URL); without this a guest would see the page flash before
 * the client guard moved them. Google sign-in does not carry `?redirect=` back
 * (it lands on PRODUCT_HOME), so a guest who signs in with Google loses the
 * consent address and has to restart the connection from the agent.
 */
export const SIGNED_IN_STANDALONE_PATHS = ["/oauth"] as const;

/**
 * Product paths that are a directory under `app/(product)` with no
 * `page.tsx` of their own: they only group the screens below them, and a
 * request to them answers 404. The breadcrumbs print such a segment as
 * plain text instead of a link (SDL-615) — a link there both leads to the
 * 404 and makes next/link prefetch it on every load of the screen.
 * (`/pages/blocks` left the list with EP-157: it redirects to /components.)
 * `smoke/pager-i18n.tsx` fails when this list and the directory drift.
 */
export const PRODUCT_PATHS_WITHOUT_PAGE: readonly string[] = ["/settings"];

/**
 * The product's home screen (the old `/admin`). Used by the sidebar root
 * item, the breadcrumbs Home icon, 404's "go home", `/` on the test contour,
 * and the flows that do not carry a destination of their own: the Google
 * OAuth callback (the `?redirect=` does not survive the Google round trip)
 * and the Telegram Mini App (/webapp). It is also OAuthButtons' default, but
 * login and register always pass AFTER_LOGIN (or the checked `?redirect=`),
 * so the Telegram bot login from those pages lands on AFTER_LOGIN.
 */
export const PRODUCT_HOME = "/dashboard";

/**
 * Where password login, registration and the Telegram bot login land when no
 * `?redirect=` is given, and where a logged-in visitor of /login is sent.
 * Collections is the multi-tenant entry point that shows the user's own data
 * straight away.
 */
export const AFTER_LOGIN = "/collections";

/**
 * «Create your first workspace» (SDL-759): where the product shell sends an
 * account whose workspace list loaded empty, and where the MCP consent screen
 * leads a person who has no workspace to connect.
 */
export const WELCOME_PATH = "/welcome";

/**
 * Sections that only make sense inside a workspace — the ones that send an
 * account with none to /welcome (SDL-759). Platform screens (users, roles,
 * dictionary…) belong to the account's global rights, not to a workspace, and
 * stay reachable without one. Read by the proxy (welcome check) and the client.
 */
export const WORKSPACE_SECTIONS = ["/dashboard", "/collections", "/pages", "/components", "/theme", "/files", "/settings/workspace"] as const;

export function isWorkspaceSection(pathname: string | null): boolean {
  if (!pathname) return false;
  return WORKSPACE_SECTIONS.some((s) => pathname === s || pathname.startsWith(`${s}/`));
}

/**
 * Accepts only a same-origin relative path: starts with a single "/", not
 * "//" (protocol-relative) and not "/\" (browsers normalise the backslash
 * to a slash, which makes it protocol-relative too). Anything else —
 * `https://evil`, `javascript:`, `//evil.com` — yields `fallback`.
 *
 * Every `?redirect=` value must pass through here before it reaches
 * `window.location`: /login now redirects a logged-in user automatically, so
 * an unchecked value would be an open redirect with no user action at all.
 */
export function safeRedirect(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters (tab, newline) are stripped by URL parsing and can
  // turn "/\t/evil.com" into "//evil.com".
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;
  return value;
}

/**
 * What a guest stopped at a protected address comes back to after login
 * (SDL-643): the WHOLE address — path AND query. Until SDL-643 only the path
 * was kept, so `/pages/<id>/view?ws=…&record=…` came back as a bare path:
 * the workspace fell back to the first one and the record link opened
 * nothing. `search` is `location.search` / `nextUrl.search` ("" or "?…").
 *
 * `null` = no `?redirect=` at all: `/`, `/login` itself, and the product
 * home without a query (the login default is a better landing than the home
 * it would restore — that rule predates SDL-643 and is kept as it was).
 */
export function loginRedirectTarget(pathname: string, search: string): string | null {
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  if (pathname === "/" || pathname === "/login") return null;
  if (pathname === PRODUCT_HOME && query === "") return null;
  return `${pathname}${query}`;
}

/** `/login`, carrying the full address to come back to (see loginRedirectTarget). */
export function loginHref(pathname: string, search: string): string {
  const target = loginRedirectTarget(pathname, search);
  return target === null ? "/login" : `/login?${new URLSearchParams({ redirect: target }).toString()}`;
}
