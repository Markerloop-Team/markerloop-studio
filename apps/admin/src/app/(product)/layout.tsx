import { deliveryBaseFrom } from "@/entities/files/lib/absolute-url";
import { FilesDeliveryProvider } from "@/entities/files/lib/delivery-context";
import { currentPolicyEdition, PolicyEditionProvider } from "@/entities/policy";
import { readDormantSections, readPolicyFlags, readProductFeatures } from "@/shared/config/product-features";
import { readProductNotice } from "@/shared/config/product-notice";
import { resolvePolicyStrings } from "@/shared/config/policy-strings";
import { SITES_BASE_DOMAIN_ENV, sitesBaseDomainFrom } from "@/shared/config/site-address";
import { SitesBaseDomainProvider } from "@/shared/config/site-address-context";
import { PolicyStringsProvider } from "@/shared/config/policy-strings-context";
import { ProductShell } from "./product-shell";
import { headers } from "next/headers";
import { BASE_PATH, DEMO_MODE } from "@/demo/config";

/**
 * Showcase: public demo files are served by the in-process mock under
 * `<origin><basePath>/api/v1/__demo/files/<id>`, so the delivery host is this
 * request's own origin — the showroom host behind its proxy, or localhost.
 */
async function demoDeliveryBase(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return deliveryBaseFrom(`${proto}://${host}${BASE_PATH}/api/v1/__demo`);
}

// Per request, never prerendered: the section flags below are the pod's own
// environment (SDL-635), and a static render would freeze whatever the build
// machine had — which is exactly the value that cannot differ between the
// test contour and prod, since both run one image.
export const dynamic = "force-dynamic";

// The public delivery host of files-service (FILES_PUBLIC_BASE_URL), read here
// and nowhere else. A public file answers with the relative /files/<id>; every
// section that renders a file — /files, the collections image field, the pages
// canvas and picker — resolves it against this host through fileUrlQuery.
// It sits on the shell, not on one section: mounted only in pages/layout.tsx
// it left /files and collections with base "" and their public images never
// displayed (SDL-624, prod acceptance 29 Sep 2026). `smoke:files` §9 fails if
// it moves back down or a second mount appears. The value is normalized once
// here (deliveryBaseFrom): a host without a scheme becomes "", never a prefix.
//
// `dynamic = "force-dynamic"` above is what makes this a per-pod read: test
// and prod run one image, so a build-time value would be the build machine's
// (smoke:files §9 fails if it goes).
//
// The rules edition in force here (SDL-665) is read the same way, per pod and
// per request. ProductShell's PolicyGate compares it with the account's
// policy_accepted_version (GET /users/my through the API client, which
// refreshes an expired session — the server cannot: the access cookie lives an
// hour and the proxy does not refresh) and renders the acceptance screen
// instead of the whole shell until they match. smoke:policy §8 fails if the
// provider or the gate goes.
//
// The sites' base domain (SITES_BASE_DOMAIN, SDL-687) is read here too, per pod:
// the pages section prints `https://<workspace slug>.<base><path>` for a
// published address. Absent on a contour = no address printed.
//
// The announcement (PRODUCT_NOTICE + PRODUCT_NOTICE_UNTIL, SDL-744) is read
// here too, per pod and per request: the owner edits the configmap and rolls
// the pods, no rebuild. Empty, broken or expired = null = no strip.
//
// The dormant sections (SDL-768: Notifications, the Telegram bot) are read here
// too, per pod and per request: hidden from the shell unless the pod env says
// `true`. Their pages are still served — only the ways in are hidden.
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const filesBase = DEMO_MODE ? await demoDeliveryBase() : deliveryBaseFrom(process.env.FILES_PUBLIC_BASE_URL);
  return (
    <FilesDeliveryProvider base={filesBase}>
      <PolicyEditionProvider edition={currentPolicyEdition(readPolicyFlags())}>
        {/* Policy strings in force on this contour (SDL-666), resolved here
            because the flags are the pod env. */}
        <PolicyStringsProvider strings={resolvePolicyStrings()}>
          <SitesBaseDomainProvider base={sitesBaseDomainFrom(process.env[SITES_BASE_DOMAIN_ENV])}>
            <ProductShell
              features={readProductFeatures()}
              dormant={readDormantSections()}
              notice={readProductNotice()}
            >
              {children}
            </ProductShell>
          </SitesBaseDomainProvider>
        </PolicyStringsProvider>
      </PolicyEditionProvider>
    </FilesDeliveryProvider>
  );
}
