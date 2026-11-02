"use client";

import { useState } from "react";
import { authService } from "@/shared/lib/api/auth";
import {
  ForgotPasswordView,
  type ForgotPasswordState,
} from "@/features/auth/password-reset-view";

/**
 * Запрос ссылки восстановления пароля (SDL-475, UI-половина SDL-462).
 *
 * Публичная страница: человек сюда приходит именно потому, что войти не
 * может. Роут лежит вне разделов продукта (`PRODUCT_SECTIONS`), поэтому middleware пропускает
 * его без токена (proxy/layers/public-routes-layer.ts).
 *
 * `Suspense` здесь не нужен, в отличие от соседних auth-страниц: у формы
 * нет `useSearchParams` — адрес человек вводит руками.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ForgotPasswordState>({ kind: "idle" });

  const submit = async () => {
    if (state.kind === "sending" || state.kind === "sent") return;
    setState({ kind: "sending" });
    try {
      await authService.forgotPassword(email);
      setState({ kind: "sent" });
    } catch {
      // Любой отказ читается одинаково — «запрос не ушёл». Раскладывать
      // его по кодам нечего: у ручки один ответ на все содержательные
      // случаи (200 и то же тело), а 400 она отдаёт только за форму
      // запроса, которую уже сторожит браузерная валидация `type="email"`.
      //
      // Показать отказ, а не притвориться отправкой, — сознательно:
      // «письмо отправлено» на неушедшем запросе оставляет человека ждать
      // письмо, которого никто не посылал. О существовании адреса это
      // состояние не говорит ничего: до адреса дело не дошло.
      setState({ kind: "error" });
    }
  };

  return (
    <ForgotPasswordView
      form={{
        state,
        email,
        onEmailChange: setEmail,
        onSubmit: submit,
      }}
    />
  );
}
