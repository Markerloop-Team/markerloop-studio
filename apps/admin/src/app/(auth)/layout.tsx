import { readTelegramLoginEnabled } from "@/shared/config/product-features";
import { TelegramLoginProvider } from "@/shared/config/telegram-login-context";
import { AuthShell } from "./auth-shell";

// Per request, never prerendered: whether sign-in through Telegram is offered
// is the pod's own environment (TELEGRAM_LOGIN_ENABLED, SDL-754), and a static
// render would freeze the build machine's value into the one image that test
// and prod both run.
export const dynamic = "force-dynamic";

/**
 * Server half of the public auth frame (/login, /register and the rest):
 * reads the contour's flags and hands them to the client frame. Sign-in
 * through Telegram is archived (owner, 8 Oct 2026) — off unless the pod env
 * says exactly `true`; OAuthButtons reads it from TelegramLoginProvider.
 */
export default function AuthRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <TelegramLoginProvider enabled={readTelegramLoginEnabled()}>
      <AuthShell>{children}</AuthShell>
    </TelegramLoginProvider>
  );
}
