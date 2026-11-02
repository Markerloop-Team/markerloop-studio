import Script from "next/script";
import { readTelegramLoginEnabled } from "@/shared/config/product-features";
import { TelegramLoginProvider } from "@/shared/config/telegram-login-context";

// Per request: the Mini App sign-in is gated by the pod env
// TELEGRAM_LOGIN_ENABLED (SDL-754), which a static render would freeze.
export const dynamic = "force-dynamic";

export default function WebAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <TelegramLoginProvider enabled={readTelegramLoginEnabled()}>{children}</TelegramLoginProvider>
    </>
  );
}
