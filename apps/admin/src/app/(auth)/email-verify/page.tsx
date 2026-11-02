"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { authService } from "@/shared/lib/api/auth";
import {
  EmailVerifyView,
  emailVerifyStateFromError,
  type EmailVerifyResendState,
  type EmailVerifyState,
} from "@/features/auth/email-verify-view";

/**
 * Приземление ссылки «подтвердите почту» из письма.
 *
 * Письмо строит адрес как `{EMAIL_VERIFY_HOST}/email-verify?token=…`
 * (auth-service/internal/services/auth_service.go:659). Ручка на бэкенде
 * живёт давно, а страницы под неё не было ни на одном хосте — ссылка
 * упиралась в 404 (SDL-263).
 *
 * Страница публичная: человек ещё не вошёл, сессии у него нет. Роут лежит
 * вне разделов продукта (`PRODUCT_SECTIONS`), поэтому middleware пропускает его без проверки
 * токена (proxy/layers/public-routes-layer.ts).
 */
function EmailVerifyHandler() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<EmailVerifyState>({ kind: "loading" });
  // SDL-270: досылка письма прямо отсюда. Адрес спрашиваем — токен в
  // неудачных состояниях либо отсутствует, либо недействителен, почты в
  // нём не достать, а сессии у человека нет.
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<EmailVerifyResendState>({ kind: "idle" });
  // StrictMode монтирует эффект дважды. Токен одноразовый: второй вызов
  // придёт уже на удалённый из Redis ключ и покажет отказ поверх успеха.
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setState({ kind: "error", reason: "missingToken" });
      return;
    }

    const verify = async () => {
      try {
        await authService.verifyEmailByToken(token);
        setState({ kind: "success" });
      } catch (err: unknown) {
        setState(emailVerifyStateFromError(err));
      }
    };

    verify();
  }, [searchParams]);

  // Отказ бэкенда сюда не протекает: ответ у него один на все случаи, а
  // сетевой сбой показывать как «адрес не найден» нельзя — это был бы
  // оракул существования адресов. Поэтому любой исход = «письмо отправлено,
  // если было кому»; настоящие ошибки уходят только в лог сервиса.
  const submitResend = async () => {
    if (resendState.kind !== "idle") return;
    setResendState({ kind: "sending" });
    try {
      await authService.resendVerification(resendEmail);
    } catch {
      // намеренно проглатываем — см. комментарий выше
    }
    setResendState({ kind: "sent" });
  };

  return (
    <EmailVerifyView
      state={state}
      resend={{
        state: resendState,
        email: resendEmail,
        onEmailChange: setResendEmail,
        onSubmit: submitResend,
      }}
    />
  );
}

export default function EmailVerifyPage() {
  return (
    <Suspense fallback={<EmailVerifyView state={{ kind: "loading" }} />}>
      <EmailVerifyHandler />
    </Suspense>
  );
}
