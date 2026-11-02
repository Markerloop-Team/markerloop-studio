"use client";

import { withBasePath } from "@/demo/config";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { useAuthStore } from "@/shared/store/auth-store";
import { takeOAuthRedirect } from "@/shared/lib/oauth-redirect";
import { Alert, Box, Card, Skeleton, Text } from "@markerloop/ui/ui";

function GoogleCallbackHandler() {
  const searchParams = useSearchParams();
  const { setAuthenticated } = useAuthStore();
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    // Prevent double-call from React StrictMode
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setError(t("oauthError") as string);
      return;
    }

    const handleCallback = async () => {
      try {
        await authService.googleCallback(code, state);

        const accessToken = authService.getAccessTokenSync();
        if (accessToken) {
          const payload = authService.getTokenPayload(accessToken);
          if (payload?.user_id) {
            setAuthenticated(payload.user_id, accessToken);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        // Where the sign-in started from (e.g. /invite), parked by
        // OAuthButtons before leaving for Google; PRODUCT_HOME otherwise.
        window.location.href = withBasePath(takeOAuthRedirect(window.sessionStorage));
      } catch (err: unknown) {
        const errorMessage =
          (err as { message?: string })?.message || (t("oauthError") as string);
        setError(errorMessage);
      }
    };

    handleCallback();
  }, [searchParams, setAuthenticated, t]);

  if (error) {
    return (
      <Box variant="center" minHeightScreen padding={4}>
        <Card fullWidth maxWidth={448}>
          <Card.Content>
            <Box gap={4} align="center">
              <Alert variant="destructive">{error}</Alert>
              <Link href="/login" className="text-primary underline">
                {t("backToLogin") as string}
              </Link>
            </Box>
          </Card.Content>
        </Card>
      </Box>
    );
  }

  return (
    <Box variant="center" minHeightScreen padding={4}>
      <Box gap={2} align="center">
        <Skeleton width={160} height={16} />
        <Text variant="muted" size="sm">
          {t("processingOAuth") as string}
        </Text>
      </Box>
    </Box>
  );
}

export default function GoogleCallbackPage() {
  const t = useTranslations("auth");

  return (
    <Suspense
      fallback={
        <Box variant="center" minHeightScreen padding={4}>
          <Box gap={2} align="center">
            <Skeleton width={160} height={16} />
            <Text variant="muted" size="sm">
              {t("processingOAuth") as string}
            </Text>
          </Box>
        </Box>
      }
    >
      <GoogleCallbackHandler />
    </Suspense>
  );
}
