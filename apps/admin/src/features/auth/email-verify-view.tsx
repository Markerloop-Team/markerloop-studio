"use client";

import { AuthCenter } from "@/shared/components/auth-center";
import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslations } from "@/shared/hooks";
import { Alert, Box, Button, Card, FormControl, Skeleton, Text } from "@markerloop/ui/ui";

/**
 * Экран подтверждения почты — только представление, без сетевых вызовов.
 *
 * Отделено от страницы намеренно: страница держит `useSearchParams` и
 * эффект с запросом, а такой компонент нечем исполнить вне Next (роутер-
 * контекст пуст, `renderToString` падает). Представление же рендерится
 * обычным `react-dom/server` — из-за этого его состояния и покрыты
 * smoke'ом (`pnpm smoke:email-verify`), а не только сборкой, которая
 * компонент не исполняет.
 */

export type EmailVerifyState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; reason: "missingToken" | "invalidToken" | "serverError" };

/**
 * Досылка письма прямо с этой страницы (SDL-270).
 *
 * Адрес приходится спрашивать: в неудачных состояниях у страницы есть
 * только токен, и он либо отсутствует, либо уже недействителен — достать
 * из него почту нельзя, а сессии у человека нет по определению.
 *
 * `sent` — единственный терминальный исход. Бэкенд отвечает одинаково и
 * зарегистрированному адресу, и выдуманному, и попавшему под лимит
 * (auth-service ResendEmailVerification), поэтому состояния «адрес не
 * найден» здесь нет и быть не может: показать его — значит превратить
 * страницу в оракул существования адресов.
 */
export type EmailVerifyResendState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" };

export type EmailVerifyResend = {
  state: EmailVerifyResendState;
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
};

/**
 * Раскладывает отказ бэкенда по состояниям экрана.
 *
 * 400 — истёкший, неизвестный или уже использованный токен: штатный исход,
 * а не сбой (auth_handler.go:305, токен одноразовый и живёт 24 ч). Всё
 * остальное — недоступность сервиса.
 *
 * Проверяется по полю `status`, не через `instanceof ValidationError`:
 * dual-build (CJS+ESM) ломает instanceof между бандлами.
 */
export function emailVerifyStateFromError(error: unknown): EmailVerifyState {
  const status = (error as { status?: number })?.status;
  return { kind: "error", reason: status === 400 ? "invalidToken" : "serverError" };
}

export function EmailVerifyView({
  state,
  resend,
}: {
  state: EmailVerifyState;
  resend?: EmailVerifyResend;
}) {
  const t = useTranslations("auth");

  if (state.kind === "loading") {
    return (
      <AuthCenter>
        <Box gap={2} align="center">
          <Skeleton width={160} height={16} />
          <Text variant="muted" size="sm">
            {t("emailVerify.checking")}
          </Text>
        </Box>
      </AuthCenter>
    );
  }

  if (state.kind === "success") {
    return (
      <AuthCenter>
        <Card fullWidth maxWidth={448}>
          <Card.Content>
            <Box gap={4}>
              <Text as="h1" size="2xl" weight="bold">
                {t("emailVerify.successTitle")}
              </Text>
              <Text variant="muted" size="sm">
                {t("emailVerify.successMessage")}
              </Text>
              <Link href="/login">
                <Button fullWidth>{t("emailVerify.goToLogin")}</Button>
              </Link>
            </Box>
          </Card.Content>
        </Card>
      </AuthCenter>
    );
  }

  return (
    <AuthCenter>
      <Card fullWidth maxWidth={448}>
        <Card.Content>
          <Box gap={4}>
            <Text as="h1" size="2xl" weight="bold">
              {t("emailVerify.errorTitle")}
            </Text>
            <Alert variant="destructive">
              {/* Литеральные ключи, а не `emailVerify.${reason}`:
                  validate-i18n-keys проверяет только литералы, а
                  вычисленный ключ он лишь перечисляет — ровно так
                  «common.emailVerification.message» и уехало в прод. */}
              {state.reason === "missingToken"
                ? t("emailVerify.missingToken")
                : state.reason === "invalidToken"
                  ? t("emailVerify.invalidToken")
                  : t("emailVerify.serverError")}
            </Alert>
            {/* SDL-270: досылка теперь возможна прямо отсюда — шлюз
                пропускает /v1/auth/resend-verification без JWT. До этого
                здесь стоял текст «войдите, на главной есть баннер», то
                есть тупик: войти с неподтверждённым адресом нельзя. */}
            {resend ? <ResendBlock resend={resend} /> : null}
            {/* SDL-460: на экране отказа было ДВЕ primary-кнопки — «отправить
                письмо заново» и «перейти ко входу», — и какая из них
                основная, человек угадать не мог. Пока форма досылки жива,
                главное действие тут одно: получить новое письмо; вход
                становится запасным выходом и рисуется вторичным. Ушло письмо
                (`sent`) или досылки на экране нет вовсе — вход снова
                единственное действие, и снова primary. */}
            <Link href="/login">
              <Button
                fullWidth
                variant={resend && resend.state.kind !== "sent" ? "outline" : "default"}
              >
                {t("emailVerify.goToLogin")}
              </Button>
            </Link>
          </Box>
        </Card.Content>
      </Card>
    </AuthCenter>
  );
}

/**
 * Форма «отправить письмо заново» и её терминальное состояние.
 *
 * Валидацию адреса делает сам браузер (`type="email"` + `required` внутри
 * формы) — отдельной строки об ошибке нет намеренно: любое собственное
 * сообщение здесь пришлось бы формулировать так, чтобы оно ничего не
 * говорило о существовании адреса.
 */
function ResendBlock({ resend }: { resend: EmailVerifyResend }) {
  const t = useTranslations("auth");

  if (resend.state.kind === "sent") {
    return <Alert variant="default">{t("emailVerify.resendSent")}</Alert>;
  }

  const sending = resend.state.kind === "sending";

  return (
    <Box
      as="form"
      gap={2}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        resend.onSubmit();
      }}
    >
      <Text variant="muted" size="sm">
        {t("emailVerify.resendDescription")}
      </Text>
      <FormControl.Field
        id="resend-email"
        label={t("emailVerify.resendEmailLabel")}
      >
        <FormControl.Input
          type="email"
          required
          autoComplete="email"
          placeholder={t("emailVerify.resendEmailLabel")}
          value={resend.email}
          disabled={sending}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            resend.onEmailChange(event.target.value)
          }
        />
      </FormControl.Field>
      <Button type="submit" fullWidth disabled={sending}>
        {sending ? t("emailVerify.resendSending") : t("emailVerify.resendSubmit")}
      </Button>
    </Box>
  );
}
