"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { Box, Button, Text } from "@markerloop/ui/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry first (SDL-85), console second: before this boundary reported
    // anywhere, every route crash was visible only to the person who hit it.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <Box className="p-6">
      <Box variant="panel" padding={6} className="max-w-xl">
        <Box gap={3}>
          <Text as="h1" size="2xl" weight="bold">
            Что-то пошло не так
          </Text>
          <Text variant="muted">
            Попробуйте обновить страницу. Если ошибка повторяется — проверьте логи.
          </Text>
          {error.digest ? (
            <Text variant="mono" size="sm">
              digest: {error.digest}
            </Text>
          ) : null}
          <Button onClick={() => reset()}>Повторить</Button>
        </Box>
      </Box>
    </Box>
  );
}

