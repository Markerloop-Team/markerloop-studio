import type { Metadata } from "next";
import { Box } from "@markerloop/ui/ui";
import { RulesHeader } from "./policy-section-view";

// Public frame of the product rules (SDL-658). /rules is outside
// PRODUCT_SECTIONS, so the proxy lets a guest through (public-routes-layer);
// no auth, no product shell.

export const metadata: Metadata = {
  title: "Правила — Markerloop",
  description: "Правила использования, лимиты, удаление и черновики документов Markerloop",
};

export default function RulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box className="min-h-dvh bg-background">
      <RulesHeader />
      <Box as="main" className="mx-auto w-full max-w-3xl px-4 pb-16">
        {children}
      </Box>
    </Box>
  );
}
