"use client";

import { AuthCenter } from "@/shared/components/auth-center";
import type { ReactNode } from "react";
import { Clock, Globe, UserRound } from "lucide-react";
import { useTranslations } from "@/shared/hooks";
import { Alert, Box, Button, Card, Skeleton, Text } from "@markerloop/ui/ui";

/**
 * The invite screen (SDL-615 S9) — the approved canvas «Вход по приглашению»
 * (`design-system/_canvas/invite-parts.tsx`) wired to real data. Same states,
 * same testids, so the canvas spec and this page are read the same way.
 *
 * Two deviations from the canvas, both forced by the API:
 *  - `signed-out` names no workspace: `POST /invites/preview` answers only a
 *    signed-in actor, so before sign-in there is nothing to name;
 *  - `loading` and `network` exist here only (a canvas has no network).
 *
 * Dead states (expired, used, revoked, invalid) name neither the workspace
 * nor the inviter and never show a Join button — canvas rule.
 */

export type InviteDeadState = "expired" | "used" | "revoked" | "invalid";

export interface InviteSummaryData {
  workspaceName: string;
  inviter?: string;
  /** Already formatted for the locale. */
  expiresOn: string;
}

export type InviteViewState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "ready"; summary: InviteSummaryData; joining: boolean; joinFailed: boolean }
  | { kind: "already-member"; workspaceName: string }
  | { kind: "own" }
  | { kind: InviteDeadState }
  | { kind: "network" };

export interface InviteViewActions {
  signUpHref: string;
  signInHref: string;
  onJoin: () => void;
  onSwitchAccount: () => void;
  onOpenWorkspace: () => void;
  onBackToMembers: () => void;
  onRetry: () => void;
  homeHref: string;
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <AuthCenter>
      <Card fullWidth maxWidth={448} data-testid="auth-card">
        <Card.Content>
          <Box direction="column" gap={5}>
            <Box direction="column" gap={1}>
              <Text as="h1" size="2xl" weight="bold">
                {title}
              </Text>
              <Text variant="muted" size="sm">
                {subtitle}
              </Text>
            </Box>
            {children}
          </Box>
        </Card.Content>
      </Card>
    </AuthCenter>
  );
}

function Summary({ summary }: { summary: InviteSummaryData }) {
  const t = useTranslations("invite");
  const rows = [
    { key: "workspace", icon: Globe, text: summary.workspaceName },
    {
      key: "role",
      icon: UserRound,
      text: summary.inviter
        ? t("summaryRole", { inviter: summary.inviter })
        : t("summaryRoleNoInviter"),
    },
    {
      key: "expires",
      icon: Clock,
      text: t("summaryExpires", { date: summary.expiresOn }),
    },
  ];
  return (
    <Box
      direction="column"
      gap={2}
      className="rounded-md border border-border p-3"
      data-testid="join-summary"
    >
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <Box
            key={row.key}
            direction="row"
            align="start"
            gap={2}
            data-testid={`join-summary-${row.key}`}
          >
            <Icon size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <Text as="span" size="sm">
              {row.text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

const DEAD: Record<InviteDeadState, { title: string; subtitle: string; advice: string }> = {
  expired: { title: "expiredTitle", subtitle: "expiredSubtitle", advice: "expiredAdvice" },
  used: { title: "usedTitle", subtitle: "usedSubtitle", advice: "usedAdvice" },
  revoked: { title: "revokedTitle", subtitle: "revokedSubtitle", advice: "revokedAdvice" },
  invalid: { title: "invalidTitle", subtitle: "invalidSubtitle", advice: "invalidAdvice" },
};

export function InviteView({
  state,
  actions,
}: {
  state: InviteViewState;
  actions: InviteViewActions;
}) {
  const t = useTranslations("invite");

  switch (state.kind) {
    case "loading":
      return (
        <AuthCenter>
          <Box gap={2} align="center" data-testid="join-loading">
            <Skeleton width={160} height={16} />
            <Text variant="muted" size="sm">
              {t("loading")}
            </Text>
          </Box>
        </AuthCenter>
      );

    case "signed-out":
      // Sign-up first: the link is most often opened by someone new to the
      // product. After either, the person comes back here to press Join.
      return (
        <Shell title={t("signedOutTitle")} subtitle={t("signedOutSubtitle")}>
          <Box direction="column" gap={4} data-testid="join-signed-out">
            <Text as="p" size="sm" variant="muted">
              {t("signedOutHint")}
            </Text>
            <Box direction="column" gap={2}>
              <Button asChild fullWidth data-testid="join-signup">
                <a href={actions.signUpHref}>{t("signUp")}</a>
              </Button>
              <Button asChild variant="outline" fullWidth data-testid="join-signin">
                <a href={actions.signInHref}>{t("signIn")}</a>
              </Button>
            </Box>
          </Box>
        </Shell>
      );

    case "ready": {
      const { summary } = state;
      const vars = { workspace: summary.workspaceName, inviter: summary.inviter ?? "" };
      return (
        <Shell
          title={t("joinTitle", vars)}
          subtitle={
            summary.inviter ? t("joinSubtitle", vars) : t("joinSubtitleNoInviter", vars)
          }
        >
          <Box direction="column" gap={4} data-testid="join-ready">
            <Summary summary={summary} />
            {state.joinFailed ? (
              <Alert variant="destructive" data-testid="join-error">
                {t("joinFailed")}
              </Alert>
            ) : null}
            <Box direction="column" gap={2}>
              <Button
                fullWidth
                disabled={state.joining}
                onClick={actions.onJoin}
                data-testid="join-submit"
              >
                {state.joining ? t("joining") : t("join", vars)}
              </Button>
              {/* The link is not bound to an address, so «am I signed in
                  with the right account?» is a fair question — the way to
                  another account stays right here. */}
              <Button
                variant="ghost"
                fullWidth
                disabled={state.joining}
                onClick={actions.onSwitchAccount}
                data-testid="join-switch-account"
              >
                {t("switchAccount")}
              </Button>
            </Box>
          </Box>
        </Shell>
      );
    }

    case "already-member": {
      const vars = { workspace: state.workspaceName };
      return (
        <Shell title={t("alreadyMemberTitle")} subtitle={t("alreadyMemberSubtitle", vars)}>
          <Box direction="column" gap={4} data-testid="join-already-member">
            <Alert data-testid="join-note">{t("alreadyMemberNote")}</Alert>
            <Button fullWidth onClick={actions.onOpenWorkspace} data-testid="join-open-workspace">
              {t("openWorkspace", vars)}
            </Button>
          </Box>
        </Shell>
      );
    }

    case "own":
      return (
        <Shell title={t("ownTitle")} subtitle={t("ownSubtitle")}>
          <Box direction="column" gap={4} data-testid="join-own">
            <Alert data-testid="join-note">{t("ownNote")}</Alert>
            <Button
              variant="outline"
              fullWidth
              onClick={actions.onBackToMembers}
              data-testid="join-back-to-members"
            >
              {t("backToMembers")}
            </Button>
          </Box>
        </Shell>
      );

    case "network":
      return (
        <Shell title={t("networkTitle")} subtitle={t("networkSubtitle")}>
          <Box direction="column" gap={4} data-testid="join-network">
            <Button fullWidth onClick={actions.onRetry} data-testid="join-retry">
              {t("retry")}
            </Button>
          </Box>
        </Shell>
      );

    default: {
      const copy = DEAD[state.kind];
      return (
        <Shell title={t(copy.title)} subtitle={t(copy.subtitle)}>
          <Box direction="column" gap={4} data-testid={`join-${state.kind}`}>
            <Alert data-testid="join-dead-advice">{t(copy.advice)}</Alert>
            <Button asChild variant="outline" fullWidth data-testid="join-home">
              <a href={actions.homeHref}>{t("home")}</a>
            </Button>
          </Box>
        </Shell>
      );
    }
  }
}
