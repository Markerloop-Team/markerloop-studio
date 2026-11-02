import { notFound } from "next/navigation";
import { readProductFeatures } from "@/shared/config/product-features";

// The site theme editor (EP-187, layer 5) lives on pages-service, like /pages
// and /components: gated by the same runtime flag (SDL-635). The HTTP 404 comes
// from the proxy (proxy/layers/section-gate-layer.ts, `/theme` in
// GATED_SECTIONS); this notFound() is the second line.
export const dynamic = "force-dynamic";

export default function ThemeSectionLayout({ children }: { children: React.ReactNode }) {
  if (!readProductFeatures().pages) notFound();
  return children;
}
