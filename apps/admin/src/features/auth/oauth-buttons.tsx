"use client";

import { withBasePath } from "@/demo/config";
import { useState } from "react";
import { useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { useAuthStore } from "@/shared/store/auth-store";
import { Alert, Box, Button, Separator, Text } from "@markerloop/ui/ui";
import { getApiBaseUrl } from "@/shared/lib/api/base-url";
import { PRODUCT_HOME, safeRedirect } from "@/shared/config/product-routes";
import { rememberOAuthRedirect } from "@/shared/lib/oauth-redirect";
import { useTelegramLoginEnabled } from "@/shared/config/telegram-login-context";

interface OAuthButtonsProps {
  redirectTo?: string;
}

export function OAuthButtons({ redirectTo: rawRedirectTo }: OAuthButtonsProps) {
  // Callers feed `?redirect=` straight from the URL; the check lives here so
  // no caller can hand an external URL to `window.location` (SDL-607).
  const redirectTo = safeRedirect(rawRedirectTo, PRODUCT_HOME);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const t = useTranslations("auth");
  // SDL-754: sign-in through Telegram is archived (owner, 8 Oct 2026) — the
  // button renders only where the pod env TELEGRAM_LOGIN_ENABLED is `true`.
  // The code below stays; switching it back on is the owner's decision.
  const telegramLogin = useTelegramLoginEnabled();

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const url = await authService.getGoogleAuthURL();
      // The round trip through Google drops `?redirect=`; the callback reads
      // it back from here (SDL-615: an invite must survive Google sign-in).
      rememberOAuthRedirect(window.sessionStorage, redirectTo);
      window.location.href = withBasePath(url);
    } catch {
      setIsGoogleLoading(false);
    }
  };

  return (
    <Box gap={3}>
      <Box direction="row" align="center" gap={2}>
        <Separator className="flex-1" />
        <Text variant="muted" size="xs">
          {t("orContinueWith") as string}
        </Text>
        <Separator className="flex-1" />
      </Box>

      <Box gap={2}>
        <Button
          type="button"
          variant="outline"
          fullWidth
          disabled={isGoogleLoading}
          onClick={handleGoogleLogin}
        >
          <Box direction="row" align="center" gap={2} justify="center">
            <GoogleIcon />
            <span>
              {isGoogleLoading
                ? (t("processingOAuth") as string)
                : (t("signInWithGoogle") as string)}
            </span>
          </Box>
        </Button>

        {telegramLogin ? <TelegramBotLogin redirectTo={redirectTo} /> : null}
      </Box>
    </Box>
  );
}

type TelegramState = "idle" | "loading" | "waiting" | "error";

function TelegramBotLogin({ redirectTo }: { redirectTo: string }) {
  const [state, setState] = useState<TelegramState>("idle");
  const [deeplink, setDeeplink] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setAuthenticated } = useAuthStore();
  const t = useTranslations("auth");

  const handleClick = async () => {
    setState("loading");
    setError(null);

    try {
      const { token, deeplink: link, qr_code } = await authService.createTelegramLoginRequest();
      setDeeplink(link);
      setQrCode(qr_code || null);
      setState("waiting");

      // На мобильных открываем Telegram напрямую
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(link, "_blank");
      }

      // Подключаемся к SSE
      const apiUrl = getApiBaseUrl();
      const eventSource = new EventSource(
        `${apiUrl}/v1/auth/telegram/login-stream?token=${token}`
      );

      eventSource.addEventListener("auth", async (event) => {
        eventSource.close();
        try {
          const data = JSON.parse(event.data);
          await authService.setTokens(data.access_token, data.refresh_token, data);

          const accessToken = authService.getAccessTokenSync();
          if (accessToken) {
            const payload = authService.getTokenPayload(accessToken);
            if (payload?.user_id) {
              setAuthenticated(payload.user_id, accessToken);
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
          window.location.href = withBasePath(redirectTo);
        } catch {
          setState("error");
          setError(t("oauthError") as string);
        }
      });

      eventSource.addEventListener("timeout", () => {
        eventSource.close();
        setState("error");
        setError(t("telegramTimeout") as string);
      });

      eventSource.addEventListener("error", () => {
        eventSource.close();
        setState("error");
        setError(t("oauthError") as string);
      });

      eventSource.onerror = () => {
        eventSource.close();
        setState("error");
        setError(t("oauthError") as string);
      };
    } catch {
      setState("error");
      setError(t("oauthError") as string);
    }
  };

  if (state === "waiting") {
    return (
      <Box gap={3}>
        {qrCode && (
          <Box align="center" gap={2}>
            <img
              src={qrCode}
              alt="Telegram QR"
              width={200}
              height={200}
              className="rounded-lg"
            />
            <Text variant="muted" size="xs" as="p" className="text-center">
              {t("scanQR") as string}
            </Text>
          </Box>
        )}
        <Button
          type="button"
          variant="outline"
          fullWidth
          onClick={() => deeplink && window.open(deeplink, "_blank")}
        >
          <Box direction="row" align="center" gap={2} justify="center">
            <TelegramIcon />
            <span>{t("openTelegram") as string}</span>
          </Box>
        </Button>
        <Text variant="muted" size="xs" as="p" className="text-center">
          {t("waitingTelegram") as string}
        </Text>
      </Box>
    );
  }

  if (state === "error" && error) {
    return (
      <Box gap={2}>
        <Alert variant="destructive">{error}</Alert>
        <Button type="button" variant="outline" fullWidth onClick={handleClick}>
          <Box direction="row" align="center" gap={2} justify="center">
            <TelegramIcon />
            <span>{t("signInWithTelegram") as string}</span>
          </Box>
        </Button>
      </Box>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      fullWidth
      disabled={state === "loading"}
      onClick={handleClick}
    >
      <Box direction="row" align="center" gap={2} justify="center">
        <TelegramIcon />
        <span>
          {state === "loading"
            ? (t("processingOAuth") as string)
            : (t("signInWithTelegram") as string)}
        </span>
      </Box>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#229ED9">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
