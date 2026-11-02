import { notFound } from "next/navigation";
import { readProductFeatures } from "@/shared/config/product-features";

// The Components section (EP-157) lives on pages-service, like /pages: gated by
// the same runtime flag (SDL-635). The HTTP 404 comes from the proxy
// (proxy/layers/section-gate-layer.ts, `/components` in GATED_SECTIONS); this
// notFound() is the second line for anything that reaches it past the proxy.
export const dynamic = "force-dynamic";

export default function ComponentsSectionLayout({ children }: { children: React.ReactNode }) {
  if (!readProductFeatures().pages) notFound();
  return children;
}
