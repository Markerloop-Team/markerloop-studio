"use client";

import { DEMO_MODE, withBasePath } from "@/demo/config";
import { AuthCenter } from "@/shared/components/auth-center";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { useAuthStore } from "@/shared/store/auth-store";
import { OAuthButtons } from "@/features/auth/oauth-buttons";
import { AFTER_LOGIN, safeRedirect } from "@/shared/config/product-routes";
import { Alert, Box, Button, Card, FormControl, Skeleton, Text } from "@markerloop/ui/ui";

const createLoginSchema = (t: (key: string) => string) => z.object({
  username: z.string().min(1, t("usernameRequired")),
  password: z.string().min(1, t("passwordRequired")),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>;

function LoginForm() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuthenticated, isInitialized } = useAuthStore();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  // `?redirect=` comes from the URL: only a same-origin path is honoured.
  const redirectTarget = safeRedirect(searchParams.get("redirect"), AFTER_LOGIN);

  /**
   * A visitor who already has a session is sent into the product (SDL-607
   * decision: `/` is the landing, /login is the way into the product).
   *
   * The check runs ONCE, on the state AuthProvider established when it
   * initialised from the cookies — never on a later `setAuthenticated`. The
   * password and Telegram sign-ins on this very page (Telegram: archived,
   * SDL-754 — shown only with TELEGRAM_LOGIN_ENABLED=true) call
   * `setAuthenticated` and then navigate themselves (after a 100 ms wait for
   * the cookies); an
   * effect keyed on `isAuthenticated` would fire in that window and start a
   * second, competing navigation. `isAuthenticated` is therefore read from
   * the store snapshot, not subscribed to.
   *
   * The navigation is a hard `location.replace`: the next page load re-reads
   * the cookies, so a stale in-memory "authenticated" cannot bounce a user
   * between /login and the product inside one SPA session.
   */
  const sessionChecked = useRef(false);
  useEffect(() => {
    if (!isInitialized || sessionChecked.current) return;
    sessionChecked.current = true;
    if (useAuthStore.getState().isAuthenticated) {
      window.location.replace(withBasePath(redirectTarget));
    }
  }, [isInitialized, redirectTarget]);

  const loginSchema = createLoginSchema(t);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    // Showcase: the form comes pre-filled — any name and password sign in.
    defaultValues: {
      username: DEMO_MODE ? "alex.rivera" : "",
      password: DEMO_MODE ? "demo-password" : "",
      rememberMe: false,
    },
  });

  const rememberMe = watch("rememberMe");

  const onSubmit = async (data: LoginFormData) => {
    // From here on this page navigates itself; the session check above
    // must not start a second navigation.
    sessionChecked.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login({
        username: data.username,
        password: data.password,
      });

      // Токены уже сохранены в httpOnly cookies и в памяти через setTokens
      // Получаем user_id из токена (используем синхронную версию, так как токен уже в кэше)
      const accessToken = authService.getAccessTokenSync();
      if (accessToken) {
        const payload = authService.getTokenPayload(accessToken);
        if (payload?.user_id) {
          setAuthenticated(payload.user_id, accessToken);
        }
      }

      // Небольшая задержка чтобы убедиться что cookies установлены
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Перенаправление на /collections — мульти-тенантный entry
      // point, который сразу показывает данные пользователя.
      // /dashboard остаётся доступен через sidebar для admin-ролей.
      // Используем window.location для полного перезагрузки страницы и применения cookies
      window.location.href = withBasePath(redirectTarget);
    } catch (err: unknown) {
      const errorMessage =
        (err as { message?: string })?.message || (tCommon("error") as string);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCenter>
      <Card fullWidth maxWidth={448}>
        <Card.Content>
          <Box gap={4}>
            <Box gap={1}>
              <Text as="h1" size="2xl" weight="bold">
                {t("login") as string}
              </Text>
              {/* EP-51, кластер F: подзаголовком стоял `auth.username` —
                  дословная копия лейбла поля двумя строками ниже
                  («Username или Email»). Подзаголовок обязан говорить,
                  куда человек попал, а не повторять форму. */}
              <Text variant="muted" size="sm">
                {t("loginSubtitle") as string}
              </Text>
            </Box>

            <Box as="form" gap={4} onSubmit={handleSubmit(onSubmit)}>
              {DEMO_MODE ? (
                <Alert data-testid="demo-login-hint">
                  Live demo on a mock backend: any name and password work. Your changes stay in this browser session.
                </Alert>
              ) : null}
              {error ? <Alert variant="destructive">{error}</Alert> : null}

              <FormControl.Field
                id="username"
                label={t("username") as string}
                error={errors.username?.message}
              >
                <FormControl.Input
                  type="text"
                  placeholder={t("username") as string}
                  {...register("username")}
                  disabled={isLoading}
                />
              </FormControl.Field>

              <FormControl.Field
                id="password"
                label={t("password") as string}
                error={errors.password?.message}
              >
                <FormControl.Input
                  type="password"
                  placeholder={t("password") as string}
                  {...register("password")}
                  disabled={isLoading}
                />
              </FormControl.Field>

              {/* SDL-462/SDL-475: до этой строки ошибка входа была тупиком —
                  вспомнить пароль было негде, а бэкендовые ручки
                  восстановления уже существовали и никем не звались.
                  Ссылка стоит рядом с «запомнить меня», то есть в поле
                  зрения человека, который только что не смог войти. */}
              <Box direction="row" gap={2} align="center" justify="between">
                <Box direction="row" gap={2} align="center">
                  <FormControl.Checkbox
                    id="rememberMe"
                    checked={rememberMe === true}
                    onCheckedChange={(value) =>
                      setValue("rememberMe", value === true)
                    }
                    disabled={isLoading}
                  />
                  <FormControl.Label htmlFor="rememberMe">
                    <Text as="span" size="sm">
                      {t("rememberMe") as string}
                    </Text>
                  </FormControl.Label>
                </Box>
                <Text as="span" size="sm">
                  <Link href="/forgot-password" className="text-primary underline">
                    {t("forgotPassword") as string}
                  </Link>
                </Text>
              </Box>

              <Button type="submit" fullWidth disabled={isLoading}>
                {isLoading ? (tCommon("loading") as string) : (t("signIn") as string)}
              </Button>
            </Box>

            <OAuthButtons redirectTo={redirectTarget} />

            <Box align="center">
              <Text size="sm" variant="muted">
                {t("dontHaveAccount") as string}{" "}
                <Link href="/register" className="text-primary underline">
                  {t("register") as string}
                </Link>
              </Text>
            </Box>
            <Box align="center">
              <Link href="/rules" className="text-sm text-muted-foreground underline" data-testid="rules-link">
                {tCommon("productRules") as string}
              </Link>
            </Box>
          </Box>
        </Card.Content>
      </Card>
    </AuthCenter>
  );
}

export default function LoginPage() {
  const tCommon = useTranslations("common");
  
  return (
    <Suspense
      fallback={
        <AuthCenter>
          <Box gap={2} align="center">
            <Skeleton width={160} height={16} />
            <Text variant="muted" size="sm">
              {tCommon("loading") as string}
            </Text>
          </Box>
        </AuthCenter>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

