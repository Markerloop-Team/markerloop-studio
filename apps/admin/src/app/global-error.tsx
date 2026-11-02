"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary (SDL-85). Catches what error.tsx cannot: crashes of the
 * root layout itself. It replaces <html>, so no app chrome and no UI kit — a
 * kit component may be exactly what just crashed. Plain markup only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Что-то пошло не так</h1>
        <p style={{ color: "#555", marginBottom: 16 }}>
          Приложение упало при загрузке. Попробуйте ещё раз.
        </p>
        {error.digest ? (
          <p style={{ fontFamily: "monospace", fontSize: 13, color: "#777" }}>
            digest: {error.digest}
          </p>
        ) : null}
        <button
          onClick={() => reset()}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          Повторить
        </button>
      </body>
    </html>
  );
}
