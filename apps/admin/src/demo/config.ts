// Showcase configuration: the base path the app is mounted under and the
// switch that answers `/api/v1/*` from the in-process mock backend
// (src/demo/server) instead of the Markerloop gateway.
//
// NEXT_PUBLIC_* values are inlined at build time, so the same build is
// self-consistent in the browser and on the server.

/** `""` at the root, `/markerloop-studio` on the showroom. No trailing slash. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/**
 * The mock backend is on unless explicitly switched off with
 * `NEXT_PUBLIC_DEMO_MODE=false` (then the app talks to a real gateway at
 * NEXT_PUBLIC_API_URL / API_INTERNAL_URL exactly as the product does).
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

/** Prefix a root-relative app path with the base path (`/login` → `/markerloop-studio/login`). */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`)) return path;
  return `${BASE_PATH}${path}`;
}
