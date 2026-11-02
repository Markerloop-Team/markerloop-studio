import { notFound } from "next/navigation";
import { readProductFeatures } from "@/shared/config/product-features";

// SDL-635: the pages section exists only where pages-service does. Prod has no
// pages-service yet (EP-113) and its gateway answers 500 on every pages route,
// so with the flag off /pages and everything under it is the product's normal
// 404 — not a broken screen. The sidebar hides the item from the same flag
// (app/(product)/layout.tsx → ProductShell → Sidebar).
//
// The HTTP 404 itself comes from the proxy (proxy/layers/section-gate-layer.ts):
// thrown here alone it would ride only in the RSC stream of a 200, because
// ProductShell does not render its children on the server. This notFound() is
// the second line for anything that reaches the section past the proxy.
// Turning the section on is one value in the contour's overlay, no rebuild.
export const dynamic = "force-dynamic";

export default function PagesSectionLayout({ children }: { children: React.ReactNode }) {
  if (!readProductFeatures().pages) notFound();
  // The files delivery host (FILES_PUBLIC_BASE_URL) comes from the product
  // shell, app/(product)/layout.tsx — one mount for every section (SDL-624).
  return children;
}
