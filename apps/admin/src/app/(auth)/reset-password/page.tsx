"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import {
  PASSWORD_MIN_LENGTH,
  ResetPasswordView,
  resetPasswordStateFromError,
  type ResetPasswordState,
} from "@/features/auth/password-reset-view";

/**
 * Приземление ссылки «восстановите пароль» из письма (SDL-475).
 *
 * Письмо строит адрес как `{EMAIL_VERIFY_HOST}/reset-password?token=…`
 * (auth-service/internal/services/password_reset.go:171) — то есть
 * `staging.example.com` на тесте и `markerloop.com` в проде (оба значения
 * сверены с dev-infra 23 Sep 2026: auth-service overlays test/prod).
 *
 * Страница публичная: сессии у человека нет по определению. Роут вне
 * разделов продукта (`PRODUCT_SECTIONS`), middleware пропускает его без токена
 * (proxy/layers/public-routes-layer.ts).
 *
 * В отличие от /email-verify запрос НЕ уходит на монтировании: токен
 * гасится тем же вызовом, что меняет пароль (порядок разобран в шапке
 * password_reset.go), поэтому проверить его заранее нечем — любая проба
 * сожгла бы ссылку. Отсюда и порядок экранов: форма показывается сразу,
 * а «ссылка мертва» выясняется по ответу на отправку.
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  // Ссылки без токена быть не может — значит её либо порезал почтовый
  // клиент, либо адрес открыли руками. Это отдельный текст, а не общий
  // отказ: поправимо это по-разному.
  const [state, setState] = useState<ResetPasswordState>(
    token ? { kind: "form" } : { kind: "missingToken" }
  );

  const submit = async () => {
    if (!token || state.kind === "sending") return;

    if (password.length < PASSWORD_MIN_LENGTH) {
      setValidationError(t("passwordMinLength") as string);
      return;
    }
    if (password !== confirmPassword) {
      setValidationError(t("passwordsDoNotMatch") as string);
      return;
    }
    setValidationError(null);

    setState({ kind: "sending" });
    try {
      await authService.resetPassword(token, password);
      setState({ kind: "success" });
    } catch (err: unknown) {
      setState(resetPasswordStateFromError(err));
    }
  };

  return (
    <ResetPasswordView
      form={{
        state,
        password,
        confirmPassword,
        validationError,
        onPasswordChange: setPassword,
        onConfirmPasswordChange: setConfirmPassword,
        onSubmit: submit,
      }}
    />
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordView form={fallbackForm} />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

/**
 * Фолбэк `Suspense` — та же форма, только неактивная. Скелет здесь был бы
 * хуже: `useSearchParams` разрешается в первом же кадре, и мигание пустой
 * рамкой человек прочитал бы как «страница не загрузилась».
 */
const fallbackForm = {
  state: { kind: "form" } as ResetPasswordState,
  password: "",
  confirmPassword: "",
  validationError: null,
  onPasswordChange: () => {},
  onConfirmPasswordChange: () => {},
  onSubmit: () => {},
};
