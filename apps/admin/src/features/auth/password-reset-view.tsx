"use client";

import { AuthCenter } from "@/shared/components/auth-center";
import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslations } from "@/shared/hooks";
import { Alert, Box, Button, Card, FormControl, Text } from "@markerloop/ui/ui";

/**
 * Экраны восстановления пароля — только представление, без сетевых вызовов.
 *
 * Разделение то же, что у `email-verify-view` и по той же причине: страница
 * держит `useSearchParams` и запрос, а такой компонент нечем исполнить вне
 * Next — роутер-контекст пуст, `renderToString` падает. Представление же
 * рендерится обычным `react-dom/server`, поэтому все его состояния покрыты
 * смоуком (`pnpm smoke:password-reset`), а не только сборкой, которая
 * компонент не исполняет.
 *
 * Обе страницы живут в одном файле намеренно: это две половины одного
 * флоу, они делят словарь `auth.passwordReset.*` и одинаково обязаны
 * молчать о существовании адреса. Разнести их — значит завести два места,
 * где эту обязанность можно забыть по отдельности.
 */

/**
 * Состояния экрана «забыли пароль».
 *
 * `sent` — единственный терминальный исход, и он ОДИН на все случаи:
 * бэкенд отвечает одинаково зарегистрированному адресу, выдуманному и
 * попавшему под 90-секундное окно (auth-service password_reset.go). Ветки
 * «адрес не найден» здесь нет и быть не может — она превратила бы форму в
 * перечислитель зарегистрированных адресов.
 *
 * `error` остаётся ровно за одним случаем: сервис не ответил вовсе. Он
 * ничего не говорит об адресе, потому что до адреса дело не дошло.
 */
export type ForgotPasswordState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error" };

export type ForgotPasswordForm = {
  state: ForgotPasswordState;
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
};

/**
 * Состояния экрана установки нового пароля.
 *
 * `invalidToken` отделён от `serverError` намеренно (требование задачи):
 * истёкшая ссылка — это штатный, самый частый и полностью поправимый
 * исход, у него свой текст и своё действие («запросить ссылку заново»).
 * Свалить его в общую ошибку значит отправить человека гадать, что
 * сломалось.
 *
 * `missingToken` — открыли /reset-password руками или почтовый клиент
 * порезал ссылку; отличается от `invalidToken` тем, что запроса не было
 * вовсе.
 */
export type ResetPasswordState =
  | { kind: "form" }
  | { kind: "sending" }
  | { kind: "success" }
  | { kind: "missingToken" }
  | { kind: "invalidToken" }
  | { kind: "serverError" };

export type ResetPasswordForm = {
  state: ResetPasswordState;
  password: string;
  confirmPassword: string;
  /** Ошибка формы (несовпадение, короткий пароль) — считается на клиенте. */
  validationError: string | null;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

/** Минимальная длина пароля — та же, что у бэкенда (`binding:"min=6"`). */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Раскладывает отказ бэкенда по состояниям экрана сброса.
 *
 * 400 — истёкший, неизвестный или уже применённый токен: штатный исход
 * (auth_handler.go, ветка ErrPasswordResetTokenInvalid). Всё остальное —
 * недоступность сервиса.
 *
 * Проверяется по полю `status`, не через `instanceof ValidationError`:
 * dual-build (CJS+ESM) ломает instanceof между бандлами.
 */
export function resetPasswordStateFromError(error: unknown): ResetPasswordState {
  const status = (error as { status?: number })?.status;
  return status === 400 ? { kind: "invalidToken" } : { kind: "serverError" };
}

/** Общая рамка auth-экрана — та же, что у входа и подтверждения почты. */
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <AuthCenter>
      <Card fullWidth maxWidth={448}>
        <Card.Content>
          <Box gap={4}>{children}</Box>
        </Card.Content>
      </Card>
    </AuthCenter>
  );
}

export function ForgotPasswordView({ form }: { form: ForgotPasswordForm }) {
  const t = useTranslations("auth");

  if (form.state.kind === "sent") {
    return (
      <AuthCard>
        <Text as="h1" size="2xl" weight="bold">
          {t("passwordReset.sentTitle")}
        </Text>
        {/* Формулировка условная («если такой адрес зарегистрирован») —
            это не осторожность стиля, а требование: любой текст, из
            которого следует существование адреса, делает форму
            перечислителем. */}
        <Alert variant="default">{t("passwordReset.sentMessage")}</Alert>
        <Link href="/login">
          <Button fullWidth>{t("passwordReset.backToLogin")}</Button>
        </Link>
      </AuthCard>
    );
  }

  const sending = form.state.kind === "sending";

  return (
    <AuthCard>
      <Box gap={1}>
        <Text as="h1" size="2xl" weight="bold">
          {t("passwordReset.forgotTitle")}
        </Text>
        <Text variant="muted" size="sm">
          {t("passwordReset.forgotDescription")}
        </Text>
      </Box>

      {/* Единственная ошибка, которую здесь можно показать, — «сервис не
          ответил». Про адрес она не говорит ничего, потому что до адреса
          дело не дошло. */}
      {form.state.kind === "error" ? (
        <Alert variant="destructive">{t("passwordReset.serverError")}</Alert>
      ) : null}

      <Box
        as="form"
        gap={2}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          form.onSubmit();
        }}
      >
        {/* Валидацию адреса делает браузер (`type="email"` + `required`):
            собственное сообщение пришлось бы формулировать так, чтобы оно
            ничего не говорило о существовании адреса, — а это ровно то,
            что уже делает браузерная подсказка про формат. */}
        <FormControl.Field
          id="forgot-email"
          label={t("passwordReset.emailLabel")}
        >
          <FormControl.Input
            type="email"
            required
            autoComplete="email"
            placeholder={t("passwordReset.emailLabel") as string}
            value={form.email}
            disabled={sending}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              form.onEmailChange(event.target.value)
            }
          />
        </FormControl.Field>
        <Button type="submit" fullWidth disabled={sending}>
          {sending ? t("passwordReset.sending") : t("passwordReset.forgotSubmit")}
        </Button>
      </Box>

      {/* Вход — запасной выход, пока на экране стоит главное действие.
          Тот же инвариант «одна primary на экран», что и в SDL-460. */}
      <Box align="center">
        <Text size="sm" variant="muted">
          <Link href="/login" className="text-primary underline">
            {t("passwordReset.backToLogin")}
          </Link>
        </Text>
      </Box>
    </AuthCard>
  );
}

export function ResetPasswordView({ form }: { form: ResetPasswordForm }) {
  const t = useTranslations("auth");

  if (form.state.kind === "success") {
    return (
      <AuthCard>
        <Text as="h1" size="2xl" weight="bold">
          {t("passwordReset.successTitle")}
        </Text>
        <Text variant="muted" size="sm">
          {t("passwordReset.successMessage")}
        </Text>
        <Link href="/login">
          <Button fullWidth>{t("passwordReset.goToLogin")}</Button>
        </Link>
      </AuthCard>
    );
  }

  // Мёртвая ссылка — отдельный экран, а не общая ошибка поверх формы.
  // Форму показывать бессмысленно: вводить новый пароль некуда, токена
  // уже нет. Главное действие здесь одно — запросить ссылку заново.
  if (form.state.kind === "missingToken" || form.state.kind === "invalidToken") {
    return (
      <AuthCard>
        <Text as="h1" size="2xl" weight="bold">
          {t("passwordReset.linkDeadTitle")}
        </Text>
        <Alert variant="destructive">
          {/* Литеральные ключи, а не `passwordReset.${kind}`:
              validate-i18n-keys проверяет только литералы, вычисленный
              ключ он лишь перечисляет (тот же разбор, что в
              email-verify-view). */}
          {form.state.kind === "missingToken"
            ? t("passwordReset.missingToken")
            : t("passwordReset.invalidToken")}
        </Alert>
        <Link href="/forgot-password">
          <Button fullWidth>{t("passwordReset.requestNewLink")}</Button>
        </Link>
        <Box align="center">
          <Text size="sm" variant="muted">
            <Link href="/login" className="text-primary underline">
              {t("passwordReset.backToLogin")}
            </Link>
          </Text>
        </Box>
      </AuthCard>
    );
  }

  const sending = form.state.kind === "sending";

  return (
    <AuthCard>
      <Box gap={1}>
        <Text as="h1" size="2xl" weight="bold">
          {t("passwordReset.resetTitle")}
        </Text>
        <Text variant="muted" size="sm">
          {t("passwordReset.resetDescription")}
        </Text>
      </Box>

      {form.state.kind === "serverError" ? (
        <Alert variant="destructive">{t("passwordReset.serverError")}</Alert>
      ) : null}

      <Box
        as="form"
        gap={4}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          form.onSubmit();
        }}
      >
        {/* One mismatch error for the pair: it is drawn under the second
            field, and the first one points at it explicitly (the wrapper
            names the error `<control id>-error`). */}
        <FormControl.Field
          id="new-password"
          label={t("passwordReset.newPasswordLabel")}
        >
          <FormControl.Input
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            placeholder={t("passwordReset.newPasswordLabel") as string}
            value={form.password}
            disabled={sending}
            aria-invalid={form.validationError ? true : undefined}
            aria-describedby={
              form.validationError ? "confirm-new-password-error" : undefined
            }
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              form.onPasswordChange(event.target.value)
            }
          />
        </FormControl.Field>

        <FormControl.Field
          id="confirm-new-password"
          label={t("passwordReset.confirmPasswordLabel")}
          error={form.validationError}
        >
          <FormControl.Input
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            placeholder={t("passwordReset.confirmPasswordLabel") as string}
            value={form.confirmPassword}
            disabled={sending}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              form.onConfirmPasswordChange(event.target.value)
            }
          />
        </FormControl.Field>

        <Button type="submit" fullWidth disabled={sending}>
          {sending ? t("passwordReset.sending") : t("passwordReset.resetSubmit")}
        </Button>
      </Box>
    </AuthCard>
  );
}
