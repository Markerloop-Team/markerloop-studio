"use client";

import { withBasePath } from "@/demo/config";
// The acceptance screen of the product shell (SDL-665). Every way an account
// appears — email, Google, Telegram through auth; the bot and admin POST /users
// straight into user-service — ends up here, so the check lives in the shell
// and not in one sign-up form. Until policy_accepted_version equals the current
// edition of this contour, no product section renders: only this screen, its
// links to /rules (outside the shell) and sign-out.
//
// The edition comes from the server (app/(product)/layout.tsx, pod env per
// request); the account's accepted edition is read here through the API
// client, which refreshes an expired session. While it loads, nothing of the
// product mounts — no section fetches its data before the verdict.
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Box, Button, Card, Skeleton, Text } from "@markerloop/ui/ui";
import {
  acceptanceText,
  editionSectionTitle,
  needsPolicyAcceptance,
  usePolicyEdition,
  type PolicyEdition,
  type PolicyEditionSection,
} from "@/entities/policy";
import { useLocale, useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { logger } from "@/shared/lib/logger";
import { useAuthStore } from "@/shared/store/auth-store";
import { forgetInviteToken } from "@/features/invite/invite-token";
import {
  acceptPolicyEdition,
  CURRENT_ACCESS_QUERY_KEY,
  CURRENT_USER_QUERY_KEY,
  fetchCurrentAccess,
  fetchCurrentUser,
} from "./accept";

export function PolicyGate({ children }: { children: React.ReactNode }) {
  const edition = usePolicyEdition();
  const [acceptedHere, setAcceptedHere] = useState(false);
  const { isInitialized, isAuthenticated } = useAuthStore();
  const signedIn = isInitialized && isAuthenticated;
  const askClient = signedIn && Boolean(edition?.version) && !acceptedHere;
  const userQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    enabled: askClient,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const mustAccept = Boolean(
    edition &&
      userQuery.data &&
      needsPolicyAcceptance(userQuery.data.policy_accepted_version, edition)
  );
  // Asked only when the profile says "not accepted": a read-only machine
  // account (its only role is observer, dev-infra/docs/domains/user.md) has
  // no users:update:own and could never accept, so the screen would lock it
  // out of the product for good (the e2e readonly suite, the feed canary).
  const accessQuery = useQuery({
    queryKey: CURRENT_ACCESS_QUERY_KEY,
    queryFn: fetchCurrentAccess,
    enabled: askClient && mustAccept,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Not signed in yet: the shell frame shows its own loading or goes to
  // /login; the gate has nothing to compare.
  if (!edition || !edition.version || acceptedHere || !signedIn) {
    return <>{children}</>;
  }

  // A profile that cannot be read is not a known refusal: the shell's own
  // guards (session, 401 → /login) handle it; the gate does not lock the
  // product on a user-service hiccup.
  if (userQuery.error) {
    logger.warn("policy gate: GET /users/my failed", userQuery.error);
    return <>{children}</>;
  }
  if (!userQuery.data || (mustAccept && !accessQuery.data && !accessQuery.error)) {
    return (
      <Box variant="center" className="h-dvh" data-testid="policy-gate-loading">
        <Skeleton width={160} height={16} />
      </Box>
    );
  }
  if (!mustAccept || isReadOnlyMachine(accessQuery.data?.roles)) {
    return <>{children}</>;
  }

  return (
    <PolicyAcceptanceScreen
      edition={edition}
      onAccepted={() => setAcceptedHere(true)}
    />
  );
}

function isReadOnlyMachine(roles: readonly string[] | undefined): boolean {
  return Boolean(roles && roles.length > 0 && roles.every((role) => role === "observer"));
}

export function PolicyAcceptanceScreen({
  edition,
  onAccepted,
}: {
  edition: PolicyEdition;
  onAccepted: () => void;
}) {
  const t = useTranslations("policyAcceptance");
  const tAuth = useTranslations("auth");
  // Title and description are owner-approved rules texts (packages/policy);
  // only the buttons and status lines come from messages/.
  const { locale } = useLocale();
  const text = acceptanceText(edition, locale);
  const queryClient = useQueryClient();
  const { clear } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const accept = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const user = await acceptPolicyEdition(edition.version);
      if (user && typeof user === "object") {
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user);
      }
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      onAccepted();
    } catch (err: unknown) {
      logger.warn("policy acceptance failed", err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    try {
      await authService.logout();
    } finally {
      forgetInviteToken(window.sessionStorage);
      clear();
      window.location.href = withBasePath("/login");
    }
  };

  return (
    <Box
      variant="center"
      padding={4}
      className="min-h-dvh"
      data-testid="policy-acceptance"
    >
      <Card fullWidth maxWidth={520}>
        <Card.Content>
          <Box gap={4}>
            <Box gap={1}>
              <Text as="h1" size="2xl" weight="bold">
                {text.title}
              </Text>
              <Text variant="muted" size="sm">
                {text.description}
              </Text>
            </Box>
            <PolicyLinks sections={edition.sections} />
            {failed ? <Alert variant="destructive">{t("failed")}</Alert> : null}
            <Box direction="row" gap={2} justify="end" wrap>
              <Button
                variant="outline"
                onClick={signOut}
                data-testid="policy-sign-out"
              >
                {tAuth("logout")}
              </Button>
              <Button
                onClick={accept}
                disabled={saving}
                data-testid="policy-accept"
              >
                {saving ? t("saving") : t("accept")}
              </Button>
            </Box>
          </Box>
        </Card.Content>
      </Card>
    </Box>
  );
}

// Links to the sections in force on this contour — titles come from
// packages/policy, never from the admin's own strings. "inline" wraps them in
// one flowing line: the sign-up card must stay short enough on a 390px phone
// not to slide under the auth header.
export function PolicyLinks({
  sections,
  inline = false,
}: {
  sections: readonly PolicyEditionSection[];
  inline?: boolean;
}) {
  // SDL-784: the titles follow the interface locale (en → English).
  const { locale } = useLocale();
  return (
    <Box
      as="ul"
      direction={inline ? "row" : "column"}
      wrap={inline}
      gap={inline ? 3 : 1}
      className={`list-none p-0 ${inline ? "gap-y-1" : ""}`}
      data-testid="policy-links"
    >
      {sections.map((section) => (
        <li key={section.slug}>
          <Link
            href={`/rules/${section.slug}`}
            target="_blank"
            rel="noopener"
            className="text-sm text-primary underline"
          >
            {editionSectionTitle(section, locale)}
          </Link>
        </li>
      ))}
    </Box>
  );
}
