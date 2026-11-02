"use client";

import { withBasePath } from "@/demo/config";
import { useEffect, useState } from "react";
import { authService } from "@/shared/lib/api/auth";
import { useAuthStore } from "@/shared/store/auth-store";
import Link from "next/link";
import { Box, Button, EmptyState, Text } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { getApiBaseUrl } from "@/shared/lib/api/base-url";
import { PRODUCT_HOME } from "@/shared/config/product-routes";
import { useTelegramLoginEnabled } from "@/shared/config/telegram-login-context";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: Record<string, unknown>;
        ready: () => void;
        expand: () => void;
        close: () => void;
      };
    };
  }
}

function getInitData(): string | null {
  // Способ 1: window.Telegram.WebApp.initData (основной)
  if (typeof window !== "undefined" && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }

  // Способ 2: URL hash (некоторые версии Telegram передают через tgWebAppData)
  if (typeof window !== "undefined") {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const tgWebAppData = params.get("tgWebAppData");
    if (tgWebAppData) {
      return tgWebAppData;
    }
  }

  return null;
}

export default function WebAppPage() {
  const [status, setStatus] = useState<"loading" | "error">("loading");
  // `noInitData` is not a failure — the page was simply opened outside
  // Telegram, and that deserves an explanation plus a way out rather
  // than the bare red line the audit (SDL-461) found here.
  const [noInitData, setNoInitData] = useState(false);
  const [error, setError] = useState<string>("");
  const { setAuthenticated } = useAuthStore();
  const t = useTranslations("common");
  // SDL-754: the Mini App sign-in is sign-in through Telegram, archived by the
  // owner on 8 Oct 2026. Off (the default) = the page says so and never calls
  // auth-service, whose /telegram/webapp answers 404 under the same flag.
  const telegramLogin = useTelegramLoginEnabled();

  useEffect(() => {
    // Сигнализируем Telegram что Mini App готово
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    if (!telegramLogin) return;

    async function authenticate() {
      try {
        const initData = getInitData();

        if (!initData) {
          setNoInitData(true);
          setStatus("error");
          return;
        }

        // Отправляем initData на бэкенд
        const apiUrl = getApiBaseUrl();
        const response = await fetch(`${apiUrl}/v1/auth/telegram/webapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ init_data: initData }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          // Сообщение сервера пробрасываем как есть; своего английского
          // текста здесь нет — локализованный фолбэк подставляется в
          // рендере, где доступен `t` (SDL-458).
          throw new Error(
            typeof body.message === "string" ? body.message : ""
          );
        }

        const result = await response.json();
        const data = result.data || result;

        if (!data.access_token || !data.refresh_token) {
          throw new Error("");
        }

        // Сохраняем токены
        await authService.setTokens(data.access_token, data.refresh_token, data);

        const payload = authService.getTokenPayload(data.access_token);
        if (payload?.user_id) {
          setAuthenticated(payload.user_id, data.access_token);
        }

        // Redirect на главную продукта (SDL-607: /dashboard)
        window.location.href = withBasePath(PRODUCT_HOME);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "");
      }
    }

    // Небольшая задержка чтобы Telegram успел инжектнуть WebApp объект
    setTimeout(authenticate, 100);
  }, [setAuthenticated, telegramLogin]);

  if (!telegramLogin) {
    return (
      <Box align="center" justify="center" className="min-h-dvh p-5">
        <Box variant="panel" padding={6} className="w-full max-w-sm" data-testid="webapp-telegram-login-off">
          <EmptyState paddingY={8}>
            <Text as="h1" size="lg" weight="semibold">
              {t("webappLoginDisabled") as string}
            </Text>
            <Text size="sm" variant="muted">
              {t("webappLoginDisabledHint") as string}
            </Text>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">{t("webappGoToLogin") as string}</Link>
            </Button>
          </EmptyState>
        </Box>
      </Box>
    );
  }

  return (
    <Box align="center" justify="center" className="min-h-dvh p-5">
      {status === "loading" && (
        <Text size="sm" variant="muted">
          {t("webappAuthenticating") as string}
        </Text>
      )}
      {status === "error" && (
        <Box variant="panel" padding={6} className="w-full max-w-sm">
          <EmptyState paddingY={8}>
            <Text as="h1" size="lg" weight="semibold">
              {noInitData
                ? (t("webappOpenFromTelegram") as string)
                : (t("webappAuthFailed") as string)}
            </Text>
            <Text size="sm" variant="muted">
              {noInitData
                ? (t("webappOpenFromTelegramHint") as string)
                : error || (t("webappAuthErrorUnknown") as string)}
            </Text>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">{t("webappGoToLogin") as string}</Link>
            </Button>
          </EmptyState>
        </Box>
      )}
    </Box>
  );
}
