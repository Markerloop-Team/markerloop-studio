"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/shared/hooks";
import { useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { Alert, Box, Button, Text } from "@markerloop/ui/ui";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const t = useTranslations("common");
  const [isSending, setIsSending] = useState(false);

  // Не показываем если: нет пользователя, нет email, email верифицирован
  if (!user || !user.email || user.email_verified) {
    return null;
  }

  const handleResend = async () => {
    setIsSending(true);
    try {
      await authService.requestEmailVerification(user.email!);
      toast.success(t("emailVerification.sent") as string);
    } catch {
      toast.error(t("emailVerification.error") as string);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Alert variant="destructive" className="mx-6 mt-4">
      <Box direction="row" align="center" justify="between" gap={3}>
        <Text size="sm">
          {t("emailVerification.message") as string}
        </Text>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={isSending}
          className="whitespace-nowrap"
        >
          {isSending ? (t("emailVerification.sending") as string) : (t("emailVerification.resend") as string)}
        </Button>
      </Box>
    </Alert>
  );
}
