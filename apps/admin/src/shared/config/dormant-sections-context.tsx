"use client";

// Dormant sections on the client side (SDL-768): whether the shell leads to
// Notifications and the Telegram bot. The values are the pod env
// NOTIFICATIONS_SECTION_ENABLED / TELEGRAM_BOT_SECTION_ENABLED, read on the
// server by app/(product)/layout.tsx (readDormantSections in
// product-features.ts) and handed down here by ProductShell.
//
// Outside the provider both are HIDDEN — a header, sidebar or dashboard
// rendered where nobody wired the flags must not bring the dead entries back.

import { createContext, useContext } from "react";
import type { DormantSections } from "./product-features";

/** Both sections hidden — what a component sees outside the provider. */
export const DORMANT_SECTIONS_HIDDEN: DormantSections = { notifications: false, telegramBot: false };

const DormantSectionsContext = createContext<DormantSections>(DORMANT_SECTIONS_HIDDEN);

export function DormantSectionsProvider({
  sections,
  children,
}: {
  sections: DormantSections;
  children: React.ReactNode;
}) {
  return <DormantSectionsContext.Provider value={sections}>{children}</DormantSectionsContext.Provider>;
}

export function useDormantSections(): DormantSections {
  return useContext(DormantSectionsContext);
}
