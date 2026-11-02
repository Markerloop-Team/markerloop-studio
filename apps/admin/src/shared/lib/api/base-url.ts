import { BASE_PATH } from "@/demo/config";

/**
 * Where the admin sends its backend calls.
 *
 * Default is the relative `/api` — the deployed contour proxies `/api/v1/*`
 * to the gateway from the admin's own host (dev-infra
 * apps/markerloop-app/base/api-ingress.yaml), so the image carries no
 * environment inside it and the same artifact serves prod and test. Baking an
 * absolute host into the bundle is what previously made the test contour call
 * production from the browser.
 *
 * `NEXT_PUBLIC_API_URL` stays supported as an explicit override for setups
 * where the admin and the gateway are not behind one origin — local dev
 * against a remote API, and the self-host docker-compose stack. It is inlined
 * at build time, so setting it only has an effect when the image is built with
 * it; the cloud pipeline deliberately leaves it unset.
 *
 * Everything that talks to the backend must resolve its base here. The two
 * places that used to inline `process.env.NEXT_PUBLIC_API_URL || ""` fell back
 * to the *root* rather than `/api`, so with the variable unset they would have
 * requested `/v1/...` and hit the Next.js router instead of the gateway.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  const base = configured && configured.length > 0 ? configured : `${BASE_PATH}/api`;
  return base.replace(/\/+$/, "");
}
