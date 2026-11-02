"use client";

import * as UI from "@markerloop/ui/ui";
import { StatusIndicator } from "@markerloop/ui/ui/admin";

import type { User } from "@/entities/user/model";
import { useAuth } from "@/shared/hooks/use-auth";
import { useTranslations } from "@/shared/hooks";
import { SettingsCard, SettingsRow } from "@/widgets/workspace-settings/settings-card";

/**
 * "Who you are" — the profile section at the top of the account settings
 * (SDL-767), laid out after the account canvas
 * `/design-system/account?case=settings` (`AccountSettings`, card
 * `account-identity`). The avatar menu's «Profile» opens this page.
 *
 * Read-only and limited to what GET /v1/users/my already returns — the same
 * query the header reads (`useAuth`): the username and the email with its
 * verification state. Deliberately absent, until the data exists:
 *   - the canvas's separate display «Name» (`account-name`) — the user has
 *     only `username`, which is the canvas's «Username» row (`account-handle`);
 *   - «How you sign in» — no endpoint reports the sign-in methods;
 *   - the Edit / Add buttons — editing is its own task.
 *
 * Presentational: `AccountProfile` below owns the query, so
 * `smoke:account-profile` renders every state without a network.
 */

export type AccountProfileState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; user: Pick<User, "username" | "email" | "email_verified"> };

export function AccountProfileView({ state }: { state: AccountProfileState }) {
  const t = useTranslations("accountProfile");

  const rows = (() => {
    switch (state.kind) {
      case "loading":
        return (
          <UI.Box className="px-4 py-3" data-testid="account-profile-loading">
            <UI.Skeleton className="h-10 w-full" />
          </UI.Box>
        );
      case "failed":
        return (
          <UI.Box className="px-4 py-3" data-testid="account-profile-failed">
            <UI.Text as="div" size="sm" variant="muted">
              {t("loadFailed")}
            </UI.Text>
          </UI.Box>
        );
      case "ready": {
        const { user } = state;
        return [
          <SettingsRow
            key="username"
            testid="account-handle"
            title={t("username")}
            description={<span className="break-all">{user.username}</span>}
            action={null}
          />,
          <SettingsRow
            key="email"
            testid="account-email"
            title={t("email")}
            description={
              user.email ? (
                <span className="break-all">{user.email}</span>
              ) : (
                t("emailNotSet")
              )
            }
            action={
              user.email ? (
                <StatusIndicator
                  tone={user.email_verified ? "success" : "warning"}
                  data-testid="account-email-status"
                >
                  {user.email_verified ? t("verified") : t("notVerified")}
                </StatusIndicator>
              ) : null
            }
          />,
        ];
      }
    }
  })();

  return (
    <SettingsCard
      testid="account-identity"
      title={t("title")}
      description={t("description")}
    >
      {rows}
    </SettingsCard>
  );
}

export function AccountProfile() {
  const { user, isLoading } = useAuth();
  const state: AccountProfileState = user
    ? { kind: "ready", user }
    : isLoading
      ? { kind: "loading" }
      : { kind: "failed" };
  return <AccountProfileView state={state} />;
}
