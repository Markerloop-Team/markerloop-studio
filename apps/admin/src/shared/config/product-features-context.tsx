"use client";

// The contour's runtime flags on the client side (SDL-636).
//
// product-features.ts reads the pod env on the server; app/(product)/layout.tsx
// hands the result to the client ProductShell as a prop, and the shell puts it
// here, so any screen under (product) — the pages editor, the create dialog —
// reads it with useProductFeatures() instead of drilling a prop through pages
// that the app router renders on its own.
//
// Outside the provider every flag is OFF. That is the fail-safe answer, same
// as an absent env var: a component rendered somewhere nobody wired the flags
// must not offer an action whose backend may not exist on this contour.

import { createContext, useContext } from "react";
import type { ProductFeatures } from "./product-features";

/** Every gated feature off — what a component sees outside the provider. */
export const PRODUCT_FEATURES_OFF: ProductFeatures = { pages: false, pagesPublish: false };

const ProductFeaturesContext = createContext<ProductFeatures>(PRODUCT_FEATURES_OFF);

export function ProductFeaturesProvider({
  features,
  children,
}: {
  features: ProductFeatures;
  children: React.ReactNode;
}) {
  return <ProductFeaturesContext.Provider value={features}>{children}</ProductFeaturesContext.Provider>;
}

export function useProductFeatures(): ProductFeatures {
  return useContext(ProductFeaturesContext);
}
