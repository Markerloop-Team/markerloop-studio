"use client";

import { withBasePath } from "@/demo/config";
import { AuthCenter } from "@/shared/components/auth-center";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocale, useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { logger } from "@/shared/lib/logger";
import { useAuthStore } from "@/shared/store/auth-store";
import { OAuthButtons } from "@/features/auth/oauth-buttons";
import { AFTER_LOGIN, safeRedirect } from "@/shared/config/product-routes";
import { acceptanceText, usePolicyEdition } from "@/entities/policy";
import { acceptPolicyEdition, PolicyLinks } from "@/features/policy-acceptance";
import { Alert, Box, Button, Card, FormControl, Skeleton, Text } from "@markerloop/ui/ui";

const createRegisterSchema = (t: (key: string) => string) =>
  z
    .object({
      username: z.string().min(3, t("usernameMinLength")).max(30),
      email: z.string().email(t("emailInvalid")),
      password: z.string().min(6, t("passwordMinLength")),
      confirmPassword: z.string().min(1, t("confirmPasswordRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsDoNotMatch"),
      path: ["confirmPassword"],
    });

type RegisterFormData = z.infer<ReturnType<typeof createRegisterSchema>>;

function RegisterForm() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuthenticated } = useAuthStore();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tPolicy = useTranslations("policyAcceptance");
  // The rules edition in force on this contour (register/layout.tsx, SDL-665).
  // Without the checkbox the form does not submit at all.
  const edition = usePolicyEdition();
  // The checkbox label is an owner-approved rules text (packages/policy).
  const { locale } = useLocale();
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const mustAcceptPolicy = Boolean(edition?.version);

  const registerSchema = createRegisterSchema(t);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    if (mustAcceptPolicy && !policyAccepted) return;
    setIsLoading(true);
    setError(null);

    try {
      await authService.register({
        username: data.username,
        password: data.password,
        email: data.email,
      });

      const accessToken = authService.getAccessTokenSync();
      if (accessToken) {
        const payload = authService.getTokenPayload(accessToken);
        if (payload?.user_id) {
          setAuthenticated(payload.user_id, accessToken);
        }
      }

      // The acceptance of the edition shown next to the checkbox (SDL-665).
      // A failure here does not undo the sign-up: the product shell asks
      // again on the first screen (PolicyGate).
      if (edition?.version) {
        try {
          await acceptPolicyEdition(edition.version);
        } catch (err: unknown) {
          logger.warn("policy acceptance after register failed (shell will ask again):", err);
        }
      }

      // No workspace is provisioned here any more (SDL-759): the product
      // shell sends an account without one to /welcome, where the person
      // names it and picks its address.
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Default redirect lands new users on /collections — the
      // multi-tenant entry point that shows THEIR data. /dashboard still
      // works for power users via the sidebar. `?redirect=` must be a
      // same-origin path (SDL-607): anything else falls back.
      const redirect = safeRedirect(searchParams.get("redirect"), AFTER_LOGIN);
      window.location.href = withBasePath(redirect);
    } catch (err: unknown) {
      const errorMessage =
        (err as { message?: string })?.message || (tCommon("error") as string);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // pt-20 below md: the rules block makes the mark + card taller than a
    // 390×844 screen, and centred, the top of the column would slide under
    // the absolute language-switcher bar of the auth layout (SDL-665). The
    // logo no longer lives in that bar — AuthCenter draws it above the card.
    <AuthCenter className="pt-20 md:pt-4">
      <Card fullWidth maxWidth={448}>
        <Card.Content>
          <Box gap={4}>
            <Box gap={1}>
              <Text as="h1" size="2xl" weight="bold">
                {t("register") as string}
              </Text>
              <Text variant="muted" size="sm">
                {t("createAccount") as string}
              </Text>
            </Box>

            <Box as="form" gap={4} onSubmit={handleSubmit(onSubmit)}>
              {error ? <Alert variant="destructive">{error}</Alert> : null}

              {/* SDL-460: здесь стоял `auth.username` — «Username или Email».
                  На входе это правда (логин принимает и то, и другое), а в
                  регистрации строкой ниже идёт отдельное поле Email, и два
                  поля начинали спорить за один смысл. Регистрации нужен свой
                  ключ: тут заводится ровно имя пользователя. `auth.username`
                  не трогаем — он остаётся форме входа, где описывает правду. */}
              <FormControl.Field
                id="username"
                label={t("usernameField") as string}
                error={errors.username?.message}
              >
                <FormControl.Input
                  type="text"
                  placeholder={t("usernameField") as string}
                  {...register("username")}
                  disabled={isLoading}
                />
              </FormControl.Field>

              <FormControl.Field
                id="email"
                label={t("email") as string}
                error={errors.email?.message}
              >
                <FormControl.Input
                  type="email"
                  placeholder="email@example.com"
                  {...register("email")}
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

              <FormControl.Field
                id="confirmPassword"
                label={t("confirmPassword") as string}
                error={errors.confirmPassword?.message}
              >
                <FormControl.Input
                  type="password"
                  placeholder={t("confirmPassword") as string}
                  {...register("confirmPassword")}
                  disabled={isLoading}
                />
              </FormControl.Field>

              {edition && mustAcceptPolicy ? (
                <Box gap={2} data-testid="register-policy">
                  <Box direction="row" align="center" gap={2}>
                    <FormControl.Checkbox
                      id="policyAccepted"
                      checked={policyAccepted}
                      onCheckedChange={(checked) => setPolicyAccepted(checked === true)}
                      disabled={isLoading}
                      data-testid="register-policy-checkbox"
                    />
                    <FormControl.Label htmlFor="policyAccepted">
                      {acceptanceText(edition, locale).checkbox}
                    </FormControl.Label>
                  </Box>
                  <Text variant="muted" size="sm">
                    {tPolicy("checkboxHint") as string}
                  </Text>
                  <PolicyLinks sections={edition.sections} inline />
                </Box>
              ) : null}

              <Button
                type="submit"
                fullWidth
                disabled={isLoading || (mustAcceptPolicy && !policyAccepted)}
                data-testid="register-submit"
              >
                {isLoading ? (tCommon("loading") as string) : (t("signUp") as string)}
              </Button>
            </Box>

            <OAuthButtons redirectTo={safeRedirect(searchParams.get("redirect"), AFTER_LOGIN)} />

            <Box align="center">
              <Text size="sm" variant="muted">
                {t("alreadyHaveAccount") as string}{" "}
                <Link href="/login" className="text-primary underline">
                  {t("signIn") as string}
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

export default function RegisterPage() {
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
      <RegisterForm />
    </Suspense>
  );
}
