"use client";

// Whether this contour offers sign-in through Telegram (SDL-754), on the
// client side. The value is the pod env TELEGRAM_LOGIN_ENABLED, read on the
// server by app/(auth)/layout.tsx and app/webapp/layout.tsx
// (readTelegramLoginEnabled in product-features.ts) and handed down here.
//
// Outside the provider it is OFF — the archived sign-in must not reappear on
// a screen where nobody wired the flag.

import { createContext, useContext } from "react";

const TelegramLoginContext = createContext<boolean>(false);

export function TelegramLoginProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <TelegramLoginContext.Provider value={enabled}>{children}</TelegramLoginContext.Provider>;
}

export function useTelegramLoginEnabled(): boolean {
  return useContext(TelegramLoginContext);
}
